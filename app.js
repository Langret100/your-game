'use strict';
const $=id=>document.getElementById(id),C=$('game'),g=C.getContext('2d'),names=['점프','미로','경주','슈팅','핀볼','2인 공 튕기기'],help=['조이스틱 / ← → 이동 · 점프 · 위에서 몬스터 밟기','조이스틱 / 방향키 이동 · 녹색 출구','↑ 가속 · ↓ 감속/후진 · ← → 회전 · Space 드리프트','이동 조이스틱 / 방향키 · 자동 발사 · 위에서 적과 장애물이 등장','← → 플리퍼 · Space 누르고 떼면 발사','왼쪽 W/S · 오른쪽 ↑/↓ · 5점 먼저 획득'];
let W=980,H=550;const cv=(w,h)=>{let c=document.createElement('canvas');c.width=w;c.height=h;return c},clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function cloneArt(src){let c=cv(src.width,src.height);c.getContext('2d').drawImage(src,0,0);if(src.paperSource)c.paperSource=true;return c}
// Shared five-ink classifier for screen drawing, uploaded A4 and auto-genre analysis.
// 0 paper/unknown, 1 black, 2 blue, 3 red, 4 green, 5 yellow.
// This works on hue families, not exact RGB swatches. White/paper shadows
// must not become terrain; dark *saturated* marker ink must not become black.
function color(r,g,b){
 const hi=Math.max(r,g,b),lo=Math.min(r,g,b),d=hi-lo;
 if(hi<37)return 1; // near-black regardless of camera colour noise
 if(d<15){return hi<142?1:0;} // gray / paper white / shadows
 const sat=d/hi;
 if(hi<70&&d<28)return 1; // black ink with coloured sensor noise
 if(sat<.078||d<17)return hi<127?1:0;
 // Almost-white paper with a slight tint is not painted yellow or pink.
 if(hi>238&&d<21)return 0;
 // Low-saturation graphite/gray is terrain only when dark enough.
 if(sat<.17&&hi<110)return 1;
 const h=(hi===r?60*((g-b)/d+6):hi===g?60*((b-r)/d+2):60*((r-g)/d+4))%360;
 // Violet-blue and pink-red are included. Orange (~31 degrees) is
 // intentionally divided between red and yellow; it has no sixth role.
 if(h<31||h>=307)return 3;
 if(h<77)return 5;
 if(h<187)return 4;
 return 2;
}
// A photographed white sheet can be yellow/blue under classroom lighting.
// Estimate its white point from bright, nearly neutral pixels, sampled once
// per image (never per game frame). No network or AI API is involved.
function paperWhiteBalance(data,w,h){
 // Pick the brightest near-neutral pixels, which normally represent blank
 // paper. Exposure compensation happens before colour classification and
 // never changes the original drawing. Accept dim classroom photos too.
 const picks=[],step=Math.max(5,Math.floor(Math.min(w,h)/30));
 for(let y=step;y<h-step;y+=step)for(let x=step;x<w-step;x+=step){
  const i=(y*w+x)*4,r=data[i],g=data[i+1],b=data[i+2];
  const low=Math.min(r,g,b),high=Math.max(r,g,b);
  if(low>32&&high-low<115)picks.push({r,g,b,score:low+(r+g+b)/12});
 }
 if(picks.length<16)return [1,1,1];
 picks.sort((a,b)=>b.score-a.score);
 const n=Math.min(180,Math.max(16,Math.floor(picks.length*.16)));let R=0,G=0,B=0;
 for(let i=0;i<n;i++){R+=picks[i].r;G+=picks[i].g;B+=picks[i].b}
 R/=n;G/=n;B/=n;
 if(Math.min(R,G,B)<39)return [1,1,1];
 return [clamp(246/R,.80,6.5),clamp(246/G,.80,6.5),clamp(246/B,.80,6.5)];
}
function comps(m,w,h,v,min=20){let seen=new Uint8Array(m.length),q=new Int32Array(m.length),out=[];for(let i=0;i<m.length;i++){if(seen[i]||m[i]!==v)continue;let a=0,z=1;q[0]=i;seen[i]=1;let x0=w,y0=h,x1=0,y1=0,sx=0,sy=0;while(a<z){let k=q[a++],x=k%w,y=k/w|0;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);sx+=x;sy+=y;for(let j of [x?k-1:-1,x<w-1?k+1:-1,y?k-w:-1,y<h-1?k+w:-1])if(j>=0&&!seen[j]&&m[j]===v){seen[j]=1;q[z++]=j}}if(z>=min)out.push({x:sx/z,y:sy/z,x0,y0,x1,y1,n:z,ids:Array.from(q.subarray(0,z))})}return out}
function solve(a,b){for(let i=0;i<b.length;i++){let k=i;for(let j=i+1;j<b.length;j++)if(Math.abs(a[j][i])>Math.abs(a[k][i]))k=j;[a[i],a[k]]=[a[k],a[i]];[b[i],b[k]]=[b[k],b[i]];let d=a[i][i];if(Math.abs(d)<1e-8)throw Error('용지 각도를 줄여 주세요');for(let j=i;j<b.length;j++)a[i][j]/=d;b[i]/=d;for(let k=0;k<b.length;k++)if(k!==i){let f=a[k][i];for(let j=i;j<b.length;j++)a[k][j]-=f*a[i][j];b[k]-=f*b[i]}}return b}
// Relative-contrast detection is robust to dark exposure and moderately
// uneven lighting. The four solid black registration squares are identified
// by their geometry after local thresholding, not an absolute RGB cutoff.
function registrationMask(im,w,h){
 const stride=w+1,sum=new Uint32Array((w+1)*(h+1)),lum=new Uint8Array(w*h);
 for(let y=0;y<h;y++){
  let row=0;for(let x=0;x<w;x++){
   const k=y*w+x,i=k*4,L=(77*im[i]+150*im[i+1]+29*im[i+2])>>8;
   lum[k]=L;row+=L;sum[(y+1)*stride+x+1]=sum[y*stride+x+1]+row;
  }
 }
 const rad=clamp(Math.round(Math.min(w,h)*.043),18,35),m=new Uint8Array(w*h);
 for(let y=0;y<h;y++){
  const y0=Math.max(0,y-rad),y1=Math.min(h,y+rad+1);
  for(let x=0;x<w;x++){
   const x0=Math.max(0,x-rad),x1=Math.min(w,x+rad+1),n=(x1-x0)*(y1-y0);
   const mean=(sum[y1*stride+x1]-sum[y0*stride+x1]-sum[y1*stride+x0]+sum[y0*stride+x0])/n;
   const L=lum[y*w+x];
   if(L<mean-Math.max(6,mean*.18)&&L<mean*.82)m[y*w+x]=1;
  }
 }
 return m;
}
function imagePatchLuma(ctx,x,y,w,h){
 const d=ctx.getImageData(x,y,w,h).data;let s=0;
 for(let i=0;i<d.length;i+=4)s+=(77*d[i]+150*d[i+1]+29*d[i+2])>>8;
 return s/(w*h);
}
function project(src){
 const w=src.width,h=src.height,im=src.getContext('2d').getImageData(0,0,w,h).data;
 const m=registrationMask(im,w,h);
 const sq=comps(m,w,h,1,35).filter(o=>{
  const a=o.x1-o.x0+1,b=o.y1-o.y0+1;
  return a/b>.50&&a/b<2&&o.n/(a*b)>.49&&a<w*.12&&b<h*.16&&a>=6&&b>=6;
 });
 if(sq.length<4)throw Error('모서리 표식 4개를 모두 보여 주세요. 종이를 조금 밝게 비춰 주세요.');
 const pick=f=>sq.reduce((a,b)=>f(a)<f(b)?a:b);
 const p=[pick(o=>o.x+o.y),pick(o=>-o.x+o.y),pick(o=>-o.x-o.y),pick(o=>o.x-o.y)];
 if(new Set(p).size!==4||Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)<w*.35||Math.hypot(p[0].x-p[3].x,p[0].y-p[3].y)<h*.35)throw Error('용지를 화면 중앙에 펼쳐 주세요');
 const a=[],b=[];
 [[40,40],[1080,40],[1080,750],[40,750]].forEach(([x,y],i)=>{
  let u=p[i].x,v=p[i].y;
  a.push([x,y,1,0,0,0,-u*x,-u*y],[0,0,0,x,y,1,-v*x,-v*y]);b.push(u,v);
 });
 const t=solve(a,b),out=cv(1120,790),ctx=out.getContext('2d',{willReadFrequently:true}),d=ctx.createImageData(1120,790);
 for(let y=0;y<790;y++)for(let x=0;x<1120;x++){
  const z=t[6]*x+t[7]*y+1,u=Math.round((t[0]*x+t[1]*y+t[2])/z),v=Math.round((t[3]*x+t[4]*y+t[5])/z),i=(y*1120+x)*4,k=(v*w+u)*4;
  for(let j=0;j<3;j++)d.data[i+j]=u>=0&&u<w&&v>=0&&v<h?im[k+j]:255;
  d.data[i+3]=255;
 }
 ctx.putImageData(d,0,0);
 // A small orientation mark must contrast with nearby blank paper.
 // The relative test works even if the entire photo is very dark.
 const marked=(x,y,refY)=>{
  const fg=imagePatchLuma(ctx,x+1,y+1,10,10),bg=imagePatchLuma(ctx,x,refY,12,10);
  return bg-fg>Math.max(8,bg*.18)&&fg<bg*.75;
 };
 if(!marked(72,27,47)){
  if(marked(1036,751,731)){
   const tmp=cv(1120,790),q=tmp.getContext('2d');
   q.translate(1120,790);q.rotate(Math.PI);q.drawImage(out,0,0);
   return tmp;
  }
  throw Error('용지 방향을 확인하고 검은 방향 표식이 보이게 해 주세요.');
 }
 return out;
}
function parse(s){
 const c=s.getContext('2d',{willReadFrequently:true});
 // Ignore the outline of an EMPTY checkbox. Compare its centre with nearby
 // blank paper; both are affected similarly by shadows and exposure.
 const votes=names.map((_,i)=>{
  const x=78+i*167,d=c.getImageData(x,113,16,16).data;
  const paper=imagePatchLuma(c,x-3,140,22,8),threshold=Math.max(8,paper*.17);
  let dark=0,mean=0;
  for(let k=0;k<d.length;k+=4){const L=(77*d[k]+150*d[k+1]+29*d[k+2])>>8;mean+=L;if(paper-L>threshold)dark++}
  return dark/256>.24&&(paper-mean/256)>threshold*.38;
 });
 const chosen=votes.map((v,i)=>v?i:-1).filter(i=>i>=0);
 if(chosen.length>1)throw Error('장르 네모는 하나만 칠하거나 모두 비워 두세요.');
 const art=cv(980,550);art.getContext('2d').drawImage(s,70,180,980,550,0,0,980,550);art.paperSource=true;
 return {mode:chosen.length===1?chosen[0]:-1,art};
}
// Remove tiny JPEG colour fringes hugging black pen lines. A dark line
// photographed under strongly warm light can otherwise look like thin red
// or yellow objects at its antialiased edges. Genuine coloured drawings
// that occupy a larger area are untouched.
function photoInkFringe(o,m){
 const bw=o.x1-o.x0+1,bh=o.y1-o.y0+1;
 if(o.n>210||Math.min(bw,bh)>5||Math.max(bw,bh)<18)return false;
 const pad=8;let black=0;
 const x0=Math.max(0,o.x0-pad),x1=Math.min(W-1,o.x1+pad),y0=Math.max(0,o.y0-pad),y1=Math.min(H-1,o.y1+pad);
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(m[y*W+x]===1)black++;
 return black>o.n*1.2;
}
// One-shot preview cache: inspect the scene once, then reuse that exact result
// when play starts. The override is ephemeral and stored only in RAM.
window.actorTypeOverrides={player:'auto',enemy:'auto'};
window.preparedActorScene=null;
function applyActorChoices(scene){
 const options=window.actorTypeOverrides||{};
 for(const [v,role] of [[2,'player'],[3,'enemy']]){
  const choice=options[role]||'auto';
  if(choice==='auto')continue;
  for(const o of scene.o[v]){
   if(choice==='blob'){o.blob=true;o.custom=true;o.shape='blob'}
   else if(choice==='human'){o.blob=false;o.custom=true;o.shape='human'}
  }
 }
 return scene;
}
function analyze(art){
 const previous=window.preparedActorScene;
 if(previous?.art===art&&previous.w===art.width&&previous.h===art.height){
  window.preparedActorScene=null;
  return applyActorChoices(previous.scene);
 }
 let d=art.getContext('2d').getImageData(0,0,W,H).data,m=new Uint8Array(W*H);
 const gains=art.paperSource?paperWhiteBalance(d,W,H):[1,1,1];
 const corrected=gains[0]!==1||gains[1]!==1||gains[2]!==1;
 for(let i=0;i<m.length;i++){
  const k=i*4;
  m[i]=corrected?color(Math.min(255,d[k]*gains[0]),Math.min(255,d[k+1]*gains[1]),Math.min(255,d[k+2]*gains[2])):color(d[k],d[k+1],d[k+2]);
 }
 let terrain=cv(W,H),tc=terrain.getContext('2d'),td=tc.createImageData(W,H);for(let i=0;i<m.length;i++)if(m[i]===1){td.data[i*4]=d[i*4];td.data[i*4+1]=d[i*4+1];td.data[i*4+2]=d[i*4+2];td.data[i*4+3]=255}tc.putImageData(td,0,0);let o={};for(let v=2;v<=5;v++)o[v]=(v===2||v===3?window.groupActorInk(comps(m,W,H,v,6),v):comps(m,W,H,v,18)).filter(q=>q.n>=(art.paperSource?40:18)&&!(art.paperSource&&photoInkFringe(q,m))).sort((a,b)=>b.n-a.n).slice(0,v===2?1:70).map(o=>{let w=o.x1-o.x0+1,h=o.y1-o.y0+1,im=cv(w,h),c=im.getContext('2d'),id=c.createImageData(w,h);for(let k of o.ids){let j=((Math.floor(k/W)-o.y0)*w+k%W-o.x0)*4;id.data[j]=d[k*4];id.data[j+1]=d[k*4+1];id.data[j+2]=d[k*4+2];id.data[j+3]=255}c.putImageData(id,0,0);let shape=(v===2||v===3)?window.classifyActorShape(o):'default',custom=shape!=='default',scale=Math.min(1,84/Math.max(w,h));return {x:(o.x0+o.x1)/2,y:(o.y0+o.y1)/2,w:custom?w:Math.max(12,w*scale),h:custom?h:Math.max(12,h*scale),im,v,custom,blob:shape==='blob',shape}});return applyActorChoices({m,terrain,o})}
let dirty=true;let game=null,keys=new Set(),last=0,active=false,stream=null,stable='',count=0,latched=false,miss=0;
const obj=(v,x,y)=>({v,x,y,w:30,h:30}),key=k=>keys.has(k);
function start(mode,art){W=art.width;H=art.height;C.width=W;C.height=H;dirty=true;window.rememberGame?.(mode,art);let {m,terrain,o}=analyze(art),p=o[2][0]||obj(2,55,mode===0?H-90:H/2);if(mode===4){if(!p.custom)p={...p,w:24,h:24}}else if(!p.custom){const sizes=[[34,48],[32,44],[39,27],[36,42],[24,24]];[p.w,p.h]=sizes[mode]}for(const e of o[3]){if(!e.custom)[e.w,e.h]=[[38,42],[34,38],[30,32],[42,30],[34,34]][mode]}for(let c of o[5]){c.w=c.h=23}for(let q of o[4]){[q.w,q.h]=mode===4?[34,34]:[35,43]}let goals=o[4].length?o[4]:[obj(4,W-55,mode===0?H-70:H/2)];game={mode,m,terrain,solidIndex:buildSolidIndex(m),sourceArt:cloneArt(art),p:{...p,vx:0,vy:0,angle:0,sx:p.x,sy:p.y},enemies:o[3].map((e,i)=>({...e,base:e.x,phase:i*1.7,face:1,wind:0,recover:0,strike:0})),goals,coins:o[5],score:0,t:0,life:3,bullets:[],shot:0,finished:false,ground:false,check:false,fix:mode===0&&!m.some(v=>v===1)};if(mode===4){game.p.y=H-70;game.p.x=W/2}game.p.x=clamp(game.p.x,20,W-20);game.p.y=clamp(game.p.y,20,H-20);if(blocked(game.p,game.p.x,game.p.y)){let found=false;for(let r=8;r<160&&!found;r+=8)for(let i=0;i<16&&!found;i++){let x=clamp(game.p.x+Math.cos(i*Math.PI/8)*r,20,W-20),y=clamp(game.p.y+Math.sin(i*Math.PI/8)*r,20,H-20);if(!blocked(game.p,x,y)){game.p.x=x;game.p.y=y;found=true}}}game.p.sx=game.p.x;game.p.sy=game.p.y;
// Kid-friendly defaults: leave the child's artwork untouched, but give an
// unfinished level something to interact with. This runs only at build time.
if((mode===0||mode===1||mode===3)&&game.enemies.length===0){
  const ew=mode===3?42:mode===0?38:34,eh=mode===3?30:mode===0?42:38;
  const wantX=mode===3?W*.28:W*.62, wantY=mode===3?H*.20:mode===1?H*.65:H*.5;
  let candidate=null;
  for(let col=0;col<6&&!candidate;col++){
    const x=clamp(wantX+(col%2?1:-1)*Math.floor((col+1)/2)*48,ew,W-ew);
    for(let y=mode===0?32:wantY;y<H-eh;y+=(mode===0?3:15)){
      const e={v:3,x,y,w:ew,h:eh};
      if(Math.hypot(x-game.p.x,y-game.p.y)<Math.min(140,W*.2))continue;
      if(blocked(e,x,y))continue;
      if(mode===0){
        // Place the monster standing on a solid surface, never floating.
        const foot=y+eh*.44;
        if(!solid(x,foot+5)&&!solid(x,foot+12))continue;
      }
      candidate=e;break;
    }
  }
  if(candidate){game.enemies.push({...candidate,base:candidate.x,phase:0,face:-1,wind:0,recover:0,strike:0});game.autoEnemy=true}
}
if((mode===0||mode===1)&&game.coins.length===0){
  for(let i=0;i<3;i++){
    const x=W*(.3+i*.2), y=mode===1?H*(.25+i*.17):H*(.52-i*.09);
    const c={v:5,x,y,w:23,h:23};
    if(!blocked(c,x,y)&&Math.hypot(x-game.p.x,y-game.p.y)>50){game.coins.push(c)}
  }
}
if(mode===2&&goals.some(q=>near(game.p,q))){for(let q of goals){if(!near(game.p,q))continue;let best=null,dist=0;for(let y=30;y<H-25;y+=24)for(let x=30;x<W-25;x+=24){let d=Math.hypot(x-game.p.x,y-game.p.y);if(d>dist&&!blocked(game.p,x,y)){best={x,y};dist=d}}if(best)Object.assign(q,best)}}window.resetActorCache();window.prepareActor(game.p,mode);for(let e of game.enemies)window.prepareActor(e,mode);game.fx=[];game.attack=0;game.attackCooldown=0;game.facing=1;game.jumpBuffer=0;game.coyote=0;active=true;clearInput();window.showGame?.(mode);$('status').textContent=names[mode]+' · 게임 시작!';$('controls').textContent=help[mode];$('score').textContent='';window.resetGameFrameClock?.();document.activeElement?.blur()}
// Build a summed-area mask once per completed drawing. Used only to skip entirely
// empty footprints: all non-empty cases keep the original fine-grained test.
function buildSolidIndex(m){const stride=W+1,index=new Uint32Array(stride*(H+1));for(let y=1;y<=H;y++){let run=0,row=(y-1)*W,out=y*stride,prev=(y-1)*stride;for(let x=1;x<=W;x++){run+=(m[row+x-1]===1);index[out+x]=index[prev+x]+run}}return {index,stride}}
function hasBlack(x0,y0,x1,y1){const s=game.solidIndex.stride,q=game.solidIndex.index;return q[(y1+1)*s+x1+1]-q[y0*s+x1+1]-q[(y1+1)*s+x0]+q[y0*s+x0]>0}
function solid(x,y){if(x<0||x>=W)return true;if(y<0||y>=H)return false;if(game.fix&&y>=H-30)return true;return game.m[(y|0)*W+(x|0)]===1}
function clearStrike(a,b){let dx=b.x-a.x,dy=b.y-a.y,n=Math.max(1,Math.ceil(Math.hypot(dx,dy)/2));for(let i=1;i<n;i++)if(solid(a.x+dx*i/n,a.y+dy*i/n))return false;return true}
function blocked(p,x,y){let w=Math.min(p.w*.38,24),h=Math.min(p.h*.43,25);
 // Safe early-out preserving pixel-level collision, diagonal ramps and thin lines.
 const x0=Math.floor(x-w),x1=Math.floor(x+w),y0=Math.floor(y-h),y1=Math.floor(y+h);
 if(x0<0||x1>=W)return true;
 if(game.fix&&y1>=H-30)return true;
 // O(1) summed-area query is exact, including thin hand-drawn lines.
 if(game?.solidIndex&&y0>=0&&y1<H)return hasBlack(x0,y0,x1,y1);
 for(let j=Math.max(0,y0);j<=Math.min(H-1,y1);j++)for(let i=x0;i<=x1;i++)if(solid(i,j))return true;
 return false}
// Follow the local top surface of the hand-drawn solid mask. Small steps are bounded
// per horizontal substep, so a tall vertical wall cannot turn into a climbable ramp.
function move(p,dx,dy){let n=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/2)),bx=false,by=false,sx=dx/n,sy=dy/n,climb=0,walk=0;const platform=game.mode===0;
 for(let i=0;i<n;i++){
  let x=p.x,y=p.y,follow=platform&&sx!==0&&dy>=0&&(p.vy||0)>=-1&&blocked(p,x,y+2.1)&&!blocked(p,x,y);let limit=Math.min(5,Math.ceil(Math.abs(sx)*1.6)+1),nx=x+sx,ny=y;
  if(sx!==0){
   if(blocked(p,nx,ny)){
    let up=0;if(follow)for(let k=1;k<=limit;k++){if(!blocked(p,x,y-k)&&!blocked(p,nx,y-k)&&blocked(p,nx,y-k+1.1)){up=k;break}}
    if(up){p.x=nx;p.y=y-up;climb-=up;walk+=sx}else bx=true;
   }else{p.x=nx;walk+=sx;if(follow){let down=0;for(let k=1;k<=limit;k++){if(blocked(p,nx,y+k))break;down=k}if(down&&blocked(p,nx,y+down+1.1)){p.y=y+down;climb+=down}}}
  }
  if(sy!==0){if(!blocked(p,p.x,p.y+sy))p.y+=sy;else {by=true; // use fractional remaining clearance, without tunnelling
   if(platform){let lo=0,hi=1;for(let k=0;k<3;k++){let m=(lo+hi)/2;if(blocked(p,p.x,p.y+sy*m))hi=m;else lo=m}p.y+=sy*lo}
  }}
 }
 if(platform&&dx!==0){let target=Math.abs(walk)>.1?clamp(climb/walk,-1.6,1.6):0;p.slope=(p.slope||0)*.55+target*.45;}
 if(platform&&dy>=0&&blocked(p,p.x,p.y+.9))by=true;
 return [bx,by];
}
// Pinball uses a circular footprint and the local collision normal rather than
// reflecting separately on X/Y axes. This preserves the angle of drawn ramps.
const ballProbes=[];for(let y=-10;y<=10;y+=2)for(let x=-10;x<=10;x+=2)if(x*x+y*y<=101)ballProbes.push([x,y]);
function ballContact(x,y){let sx=0,sy=0,n=0;for(let [a,b] of ballProbes)if(solid(x+a,y+b)||(y+b<0)){sx+=a;sy+=b;n++}if(!n)return null;let d=Math.hypot(sx,sy);return d>.1?[-sx/d,-sy/d]:[0,-1]}
function ballNormal(x,y,normal){
 // Estimate the tangent of the actual ink near impact (only on contact).
 if(x<14||x>W-14||y<14)return normal;
 let cx=x-normal[0]*10,cy=y-normal[1]*10,n=0,sx=0,sy=0,xx=0,xy=0,yy=0;
 for(let j=-18;j<=18;j+=2)for(let i=-18;i<=18;i+=2){if(i*i+j*j>324||!solid(cx+i,cy+j))continue;n++;sx+=i;sy+=j;xx+=i*i;xy+=i*j;yy+=j*j}
 if(n<8)return normal;let a=xx/n-(sx/n)**2,b=xy/n-sx*sy/(n*n),d=yy/n-(sy/n)**2,spread=Math.hypot(a-d,2*b);if(spread<.38*(a+d))return normal;
 let angle=.5*Math.atan2(2*b,a-d),nx=-Math.sin(angle),ny=Math.cos(angle);if(nx*normal[0]+ny*normal[1]<0){nx=-nx;ny=-ny}return nx*normal[0]+ny*normal[1]>.4?[nx,ny]:normal;
}
function rollBall(p,dt){let speed=Math.hypot(p.vx,p.vy);if(speed>850){p.vx*=850/speed;p.vy*=850/speed}let n=Math.max(1,Math.ceil(Math.hypot(p.vx,p.vy)*dt/2.5)),step=dt/n;
 for(let i=0;i<n;i++){let nx=p.x+p.vx*step,ny=p.y+p.vy*step,normal=ballContact(nx,ny);if(!normal){p.x=nx;p.y=ny;continue}let [x,y]=ballNormal(nx,ny,normal),dot=p.vx*x+p.vy*y;
  if(dot<0){p.vx-=1.87*dot*x;p.vy-=1.87*dot*y;if(Math.abs(dot)>60&&!(game.impactCooldown>0)){game.impactCooldown=.10;impact('bumper',p.x-x*10,p.y-y*10,x,y,clamp(-dot/450,.25,1))}}
  // Push out only if necessary (e.g. user drew over the launch position).
  if(ballContact(p.x,p.y)){for(let k=1;k<=12;k++){if(!ballContact(p.x+x*k,p.y+y*k)){p.x+=x*k;p.y+=y*k;break}}}else{let tx=p.x+p.vx*step*.5,ty=p.y+p.vy*step*.5;if(!ballContact(tx,ty)){p.x=tx;p.y=ty}}
 }
}
const near=(a,b)=>Math.abs(a.x-b.x)<(a.w+b.w)*.45&&Math.abs(a.y-b.y)<(a.h+b.h)*.45;
function finish(msg){if(!game||game.finished)return;dirty=true;game.finished=true;active=false;clearInput();$('score').textContent=`${game.score}점 · ♥ ${game.life} · ${Math.max(0,Math.ceil((game.mode===3?45:60)-game.t))}초`;sfx(/성공|클리어|1등/.test(msg)?'win':'end');$('status').textContent=msg;$('controls').textContent='다시 하거나 그림을 수정할 수 있어요.'}
function restartLevel(msg='다시 시작!'){if(!game||game.restarting)return;const previous=game;const art=cloneArt(game.sourceArt);const mode=game.mode;dirty=true;game.finished=true;game.restarting=true;active=false;clearInput();$('status').textContent=msg;$('score').textContent=`${game.score}점`;$('controls').textContent='잠시 후 같은 그림으로 다시 시작해요.';sfx('end');setTimeout(()=>{if(document.hidden||game!==previous)return;start(mode,art)},650)}
function hit(kind='generic'){let a=game,p=a.p;if(a.inv>0||a.finished)return;if(a.mode===0&&kind==='enemy'){impact('hurt',p.x,p.y,-a.facing,0,1);restartLevel('몬스터에 닿아 다시 시작!');return}impact('hurt',p.x,p.y,-a.facing,0,1);a.life--;a.inv=1.4;if(a.life<=0){finish('게임 종료 · 멋진 도전!');return}if(a.mode===0&&p.y<=H+30){p.vx=-a.facing*260;p.vy=-235;a.recoil=.18;}else if(a.mode===1||a.mode===3){let e=a.enemies.filter(x=>!x.dead).sort((x,y)=>Math.hypot(x.x-p.x,x.y-p.y)-Math.hypot(y.x-p.x,y.y-p.y))[0];let dx=p.x-(e?.x??p.x-1),dy=p.y-(e?.y??p.y),len=Math.hypot(dx,dy)||1;move(p,dx/len*32,dy/len*32);}else{p.x=p.sx;p.y=p.sy;p.vx=p.vy=0;}if(a.mode===4){p.x=W/2;p.y=H-70}}
function update(dt){let a=game,p=a.p,M=a.mode;a.t+=dt;for(let f of a.fx){f.x+=f.vx*dt;f.y+=f.vy*dt;f.t-=dt}a.fx=a.fx.filter(f=>f.t>0);a.inv=Math.max(0,(a.inv||0)-dt);let [dx,dy]=inputAxes();a.attack=Math.max(0,a.attack-dt);a.attackCooldown=Math.max(0,a.attackCooldown-dt);if(dx&&!a.attack)a.facing=Math.sign(dx);if(M===0){let held=key('Space')||key('ArrowUp');if((held&&!a.jumpHeld)||consume('Space')||consume('ArrowUp')){a.jumpBuffer=.18;consume('Space');consume('ArrowUp');}a.jumpHeld=held;a.jumpBuffer=Math.max(0,a.jumpBuffer-dt);a.coyote=a.ground?.12:Math.max(0,a.coyote-dt);if(a.jumpBuffer>0&&a.coyote>0){p.vy=-(a.jumpPower||470);a.ground=false;a.coyote=a.jumpBuffer=0;sfx('jump');burst(p.x,p.y,'#6b91d8',7)}if(!held&&p.vy< -220)p.vy+=850*dt;a.recoil=Math.max(0,(a.recoil||0)-dt);if(!a.recoil){let grade=a.ground?clamp((p.slope||0)*dx,-1,1):0;p.vx+=(dx*270*(1+grade*.18)-p.vx)*Math.min(1,dt*(dx?17:23));}p.vy=Math.min(720,p.vy+1050*dt);let [bx,by]=move(p,p.vx*dt,p.vy*dt);if(bx)p.vx=0;a.ground=by&&p.vy>=0;if(by)p.vy=0;if(p.blob)p.roll=(p.roll||0)+(p.vx||0)*dt/Math.max(10,p.w*.42);if(p.y>H+50)hit()}else if(M===1||M===3){let l=Math.max(1,Math.hypot(dx,dy)),speed=M===3?260:230,acc=M===3?18:24;p.vx+=(dx/l*speed-p.vx)*Math.min(1,dt*acc);p.vy+=(dy/l*speed-p.vy)*Math.min(1,dt*acc);let [bx,by]=move(p,p.vx*dt,p.vy*dt);if(bx)p.vx=0;if(by)p.vy=0;p.x=clamp(p.x,15,W-15);p.y=clamp(p.y,15,H-15);if(M===3){a.shot-=dt;if(a.shot<=0){a.shot=.23;a.attack=.14;sfx('shot');a.bullets.push({x:p.x,y:p.y-15})}for(let b of a.bullets)b.y-=440*dt;a.bullets=a.bullets.filter(b=>b.y>0&&!solid(b.x,b.y)&&!window.shooterBulletHit?.(a,b)&&!a.enemies.some(e=>{if(!e.dead&&Math.hypot(e.x-b.x,e.y-b.y)<Math.max(15,e.w/2)){e.dead=true;a.score+=100;impact('shotHit',e.x,e.y,0,-1,.65);return true}return false}))}}else if(M===2){let gas=key('ArrowUp'),brake=key('ArrowDown'),drift=key('Space');p.reverseWait=brake&&Math.abs(p.vx)<3?(p.reverseWait||0)+dt:brake&&p.vx<0?.3:0;let target=gas&&!brake?310:brake&&p.reverseWait>.22?-85:0;let rate=target===0?(brake?360:drift?130:85):220;p.vx+=clamp(target-p.vx,-rate*dt,rate*dt);p.angle+=dx*2.8*dt*Math.sign(p.vx)*(Math.min(1,Math.abs(p.vx)/100))*(drift?1.4:1);p.travelAngle??=p.angle;let delta=Math.atan2(Math.sin(p.angle-p.travelAngle),Math.cos(p.angle-p.travelAngle));p.travelAngle+=delta*Math.min(1,dt*(drift?3:14));let [bx,by]=move(p,Math.cos(p.travelAngle)*p.vx*dt,Math.sin(p.travelAngle)*p.vx*dt);if(bx||by){p.vx*=-.25;p.travelAngle=p.angle;}p.y=clamp(p.y,15,H-15);if(Math.hypot(p.x-p.sx,p.y-p.sy)>Math.min(Math.min(W,H)*.28,Math.hypot(a.goals[0].x-p.sx,a.goals[0].y-p.sy)*.6))a.check=true}else{if(!p.vx&&!p.vy&&released('Space')){p.vx=65;p.vy=-(360+Math.min(1,releasePower)*290);a.launchPower=0}else if(!p.vx&&!p.vy){a.launchPower=key('Space')?Math.min(1,(a.launchPower||0)+dt):0}if(p.vx||p.vy){p.vy+=380*dt;rollBall(p,dt);if(p.y<14){p.y=14;p.vy=Math.abs(p.vy)}if(p.y>H+30)hit()}}for(let e of a.enemies){if(e.dead)continue;if(M===0){if(true){let vx=0,gap=p.x-e.x, close=Math.abs(gap)<65&&Math.abs(p.y-e.y)<42;e.recover=Math.max(0,e.recover-dt);e.strike=Math.max(0,e.strike-dt);if(e.wind>0){e.wind-=dt;if(e.wind<=0){e.wind=0;e.strike=.23;e.recover=.85;if(Math.abs(p.x-e.x)<75&&Math.abs(p.y-e.y)<45&&(p.x-e.x)*e.face>-10&&clearStrike(e,p))hit('enemy')}}else if(close&&!e.recover&&!e.blob){e.face=gap<0?-1:1;e.wind=.36}else if(!e.strike&&!close){const walk=e.custom&&!e.blob;vx=Math.abs(gap)<220?Math.sign(gap)*(walk?82:68):Math.cos(a.t*1.5+e.phase)*(walk?40:26);e.face=vx<0?-1:1;if(solid(e.x,e.y+29)){let edge=true;for(let k=-12;k<=20;k+=4)if(solid(e.x+Math.sign(vx)*22,e.y+29+k)){edge=false;break}if(edge)vx=0;}move(e,vx*dt,0)}e.vy=Math.min(500,(e.vy||0)+900*dt);let [,b]=move(e,0,e.vy*dt);if(b)e.vy=0;if(e.blob){e.roll=(e.roll||0)+((vx||0))*dt/Math.max(10,e.w*.42);e.wind=0;e.strike=0;}if(e.y>H+50)e.dead=true}else{let nx=e.base+Math.sin(a.t*1.6+e.phase)*35;if(!blocked(e,nx,e.y)){const prevX=e.x;e.face=nx<e.x?-1:1;e.x=nx;if(e.blob)e.roll=(e.roll||0)+(nx-prevX)/Math.max(10,e.w*.42)}}}if(M===1){let target=a.navTarget?.(e)||p,d=Math.hypot(target.x-e.x,target.y-e.y)||1;e.face=target.x<e.x?-1:1;move(e,(target.x-e.x)/d*48*dt,(target.y-e.y)/d*48*dt)}if(near(p,e)){if(M===4){let vx=p.x-e.x,vy=p.y-e.y,d=Math.hypot(vx,vy)||1;if(!e.cool){p.vx=clamp(vx/d*300,-500,500);p.vy=vy/d*370-100;}if(!e.cool){a.score+=30;e.cool=.4;impact('bumper',e.x,e.y,vx/d,vy/d,.8)}}else if(M===0){if(p.vy>100&&p.y<e.y-14){e.dead=true;p.vy=-Math.max(310,250+Math.abs(p.vy)*.38);a.score+=120;impact('pop',e.x,e.y,0,1,.95);burst(e.x,e.y,'#f46a6a',18)}else hit('enemy')}else hit('enemy')}e.cool=Math.max(0,(e.cool||0)-dt)}if(a.finished)return;for(let c of a.coins)if(!c.dead&&near(p,c)){c.dead=true;a.score+=50;sfx('coin');burst(c.x,c.y,'#e6ba18',15)}for(let q of a.goals){if(near(p,q)){if(M===4){if(!q.cool){a.score+=100;p.vy=-Math.abs(p.vy);q.cool=.6;impact('bumper',q.x,q.y,0,-1,.8)}}else if(M!==3&&(M!==2||a.check)){finish('성공! 내 그림 게임 클리어!');return}}q.cool=Math.max(0,(q.cool||0)-dt)}if(M===3&&a.t>=45)finish('45초 생존 성공!');else if(a.t>=60)finish('체험 완료!');let score=`${a.score}점 · ♥ ${a.life} · ${Math.max(0,Math.ceil((M===3?45:60)-a.t))}초`;if($('score').textContent!==score)$('score').textContent=score}
let soundCtx=null;function unlockSound(){try{soundCtx??=new (window.AudioContext||window.webkitAudioContext)();if(soundCtx.state==='suspended')soundCtx.resume().catch(()=>{})}catch{}}document.addEventListener('pointerdown',unlockSound,{once:true});document.addEventListener('keydown',unlockSound,{once:true});function beep(freq,kind='sine',duration=.09){if(!soundCtx||soundCtx.state!=='running')return;let t=soundCtx.currentTime,o=soundCtx.createOscillator(),v=soundCtx.createGain();o.type=kind;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(freq*.8,t+duration);v.gain.setValueAtTime(.055,t);v.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(v);v.connect(soundCtx.destination);o.start(t);o.stop(t+duration)}function burst(x,y,color,n){if(!game)return;for(let i=0;i<n;i++){let a=Math.random()*Math.PI*2,v=35+Math.random()*140;game.fx.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,t:.25+Math.random()*.3,color})}}function sprite(o,angle=0){if(!window.drawSceneActor(o,angle))window.drawDefaultSprite(o,angle)}
function drawObjects(group){for(const o of group)if(!o.dead){if(o.wind>0){g.fillStyle='#e94343';g.font='bold 20px sans-serif';g.textAlign='center';g.fillText('!',o.x,o.y-36)}sprite(o)}}
function draw(){g.fillStyle='#fffdf5';g.fillRect(0,0,W,H);if(!game){g.fillStyle='#e6dfcd';for(let x=18;x<W;x+=24)for(let y=18;y<H;y+=24)g.fillRect(x,y,1.5,1.5);g.textAlign='center';g.fillStyle='#263b59';g.font='bold 55px sans-serif';g.fillText('내 그림이 게임으로!',W/2,235);g.font='24px sans-serif';g.fillText('카메라에 그림을 보여 주세요',W/2,290);return}let a=game;window.beginActorFrame();if(a.enemies.length>12&&(!a.detailAt||a.t>=a.detailAt)){
 a.detailAt=a.t+.4;
 // Select the four closest custom actors without sorting/allocating the
 // entire enemy array during a live frame.
 const nearby=[];
 for(const e of a.enemies){if(!e.actor||e.dead)continue;
  const d=(e.x-a.p.x)**2+(e.y-a.p.y)**2;
  let pos=nearby.findIndex(q=>d<q.d);
  if(pos<0)pos=nearby.length;
  if(pos<4)nearby.splice(pos,0,{e,d});
  if(nearby.length>4)nearby.pop();
 }
 for(const e of a.enemies)if(e.actor)e.lightMotion=!nearby.some(q=>q.e===e);
}if(a.background)g.drawImage(a.background,0,0,W,H);if(a.mode===3&&a.shooter){window.drawShooterBackdrop?.(a)}else g.drawImage(a.terrain,0,0);if(a.fix){g.fillStyle='#333';g.fillRect(0,H-30,W,30)}drawObjects(a.goals);drawObjects(a.coins);drawObjects(a.enemies);if(a.mode===2)sprite(a.p,a.p.angle);else if(!a.inv||a.inv>1.12||Math.floor(a.inv*10)%2===0)sprite(a.p);g.fillStyle='#2985df';for(let b of a.bullets)g.fillRect(b.x-2,b.y-9,4,12);if(a.mode===4){g.save();g.lineJoin='round';g.lineCap='round';for(let i=0;i<2;i++){g.beginPath();g.moveTo(i?W*.82:W*.18,H-50);g.lineTo(i?W*.51:W*.49,flipperY(i));g.strokeStyle='#334760';g.lineWidth=13;g.stroke();g.strokeStyle='#fffdf5';g.lineWidth=7;g.stroke();}g.restore()}for(let f of a.fx){g.globalAlpha=Math.min(1,f.t*4);g.fillStyle=f.color;g.beginPath();g.arc(f.x,f.y,3,0,7);g.fill()}g.globalAlpha=1;if(a.finished){g.fillStyle='#12243cc9';g.fillRect(0,0,W,H);g.fillStyle='#fff3b0';g.font=`bold ${Math.min(48,W/15)}px sans-serif`;g.textAlign='center';g.fillText($('status').textContent,W/2,H*.45);g.font=`${Math.min(26,W/23)}px sans-serif`;g.fillText(a.score+'점 · 새 그림을 준비해 주세요',W/2,H*.56)}}
let accumulator=0;window.resetGameFrameClock=()=>{last=0;accumulator=0;dirty=true};function tick(t){let dt=last?Math.min(.133,Math.max(0,(t-last)/1000)):0;last=t;if(window.refreshVictoryFrame?.(t))dirty=true;if(active&&game&&!document.hidden){accumulator+=dt;let steps=0;while(active&&accumulator>=1/60&&steps++<8){update(1/60);accumulator-=1/60}if(accumulator>=1/60)accumulator%=1/60;}else accumulator=0;if(!C.hidden&&(active||dirty)){draw();dirty=false;}requestAnimationFrame(tick)}requestAnimationFrame(tick);
function exampleArt(mode,w=W,h=H){let c=cv(w,h),x=c.getContext('2d');x.scale(w/980,h/550);x.fillStyle='#fff';x.fillRect(0,0,980,550);x.strokeStyle='#222';x.lineWidth=9;x.lineCap='round';x.lineJoin='round';let line=pts=>{x.beginPath();pts.forEach(([a,b],i)=>i?x.lineTo(a,b):x.moveTo(a,b));x.stroke()},dot=(a,b,color,r=15)=>{x.fillStyle=color;x.beginPath();x.ellipse(a,b,r*Math.min(w/980,h/550)/(w/980),r*Math.min(w/980,h/550)/(h/550),0,0,7);x.fill()};if(mode===0&&h>w){line([[0,510],[100,510],[220,490]]);line([[260,455],[360,440],[480,455]]);line([[520,400],[740,400]]);line([[760,345],[980,345]]);dot(90,490,'#206bda',22);dot(620,382,'#dd333a',17);dot(900,327,'#159b52',23);for(let [a,b] of [[350,435],[600,380],[850,325]])dot(a,b,'#e7c318',15)}else if(mode===0){line([[0,510],[100,510],[220,443],[340,443]]);line([[390,420],[540,420]]);line([[590,355],[720,355]]);line([[770,290],[980,290]]);dot(70,485,'#206bda');dot(660,330,'#dd333a');dot(910,260,'#159b52');for(let [a,b] of [[260,412],[470,390],[650,320],[830,258]])dot(a,b,'#e7c318',10)}else if(mode===1){line([[260,0],[260,360],[460,360],[460,140],[700,140],[700,450]]);dot(70,100,'#206bda');dot(910,80,'#159b52');dot(560,450,'#dd333a');dot(360,460,'#e7c318')}else if(mode===2){line([[35,35],[945,35],[945,515],[35,515],[35,35]]);line([[200,165],[780,165],[780,390],[200,390],[200,165]]);dot(120,100,'#206bda');dot(880,460,'#159b52');dot(510,90,'#e7c318');dot(870,275,'#dd333a')}else if(mode===3){dot(490,470,'#206bda');for(let i=0;i<6;i++)dot(100+i*145,90+(i%2)*70,'#dd333a');dot(890,50,'#159b52');dot(330,240,'#e7c318')}else if(mode===5){line([[12,15],[968,15]]);line([[12,535],[968,535]]);x.strokeStyle='#2475df';x.lineWidth=13;line([[65,215],[65,345]]);x.strokeStyle='#e94343';line([[915,205],[915,335]]);dot(490,274,'#e7c318',16)}else{line([[25,520],[25,25],[955,25],[955,520]]);line([[25,520],[275,470]]);line([[705,470],[955,520]]);dot(490,480,'#206bda');dot(490,120,'#159b52',24);for(let i=0;i<5;i++)dot(150+i*170,240+(i%2)*100,'#dd333a',22);dot(490,350,'#e7c318')}return c}
function example(mode){start(mode,exampleArt(mode,980,550))}
function frame(s){let w=s.videoWidth||s.naturalWidth||s.width,h=s.videoHeight||s.naturalHeight||s.height;if(!w||!h)throw Error('카메라 준비 중');let r=Math.min(1,900/Math.max(w,h)),c=cv(Math.round(w*r),Math.round(h*r));c.getContext('2d').drawImage(s,0,0,c.width,c.height);return c}
function inspect(source,force=false){let p=parse(project(frame(source)));const resolvedMode=p.mode<0?window.guessDrawingGenre(p.art):p.mode;if(force){start(resolvedMode,p.art);latched=true;return}let tiny=cv(16,9),ctx=tiny.getContext('2d');ctx.drawImage(p.art,0,0,16,9);let d=ctx.getImageData(0,0,16,9).data,sig=resolvedMode+':';for(let i=0;i<d.length;i+=4)sig+=Math.min(d[i],d[i+1],d[i+2])<210?'1':'0';let diff=0;for(let i=0;i<sig.length;i++)if(sig[i]!==stable[i])diff++;count=diff<6?count+1:1;stable=sig;miss=0;if(count>=2&&!latched&&!active){$('cammsg').textContent='그림 인식 완료!';start(resolvedMode,p.art);latched=true}else $('cammsg').textContent=latched?'그림을 치워 주세요':'그림을 그대로 유지해 주세요'}
// Opening the Camera tab starts capture automatically. Guard pending permission
// prompts so switching away cannot reopen a camera in the background.
let cameraRequest=null,cameraVersion=0;
window.invalidatePaperCamera=()=>{cameraVersion++;};
window.activatePaperCamera=async()=>{
 if(stream||$('paperPanel').hidden)return;
 if(cameraRequest)return cameraRequest;
 const version=++cameraVersion;
 $('cammsg').textContent='카메라 연결 중...';
 cameraRequest=(async()=>{
  let acquired=null;
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw Error('unsupported');
   acquired=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},facingMode:'environment'},audio:false});
   if(version!==cameraVersion||$('paperPanel').hidden){acquired.getTracks().forEach(t=>t.stop());return;}
   stream=acquired;$('video').srcObject=stream;
   $('video').play().catch(()=>{});
   $('camera').textContent='카메라 끄기';
   $('cammsg').textContent='A4 용지를 비춰 주세요 · 자동 인식';
   latched=false;count=0;stable='';miss=0;
  }catch(e){if(version===cameraVersion){$('camera').textContent='카메라 다시 켜기';$('cammsg').textContent='카메라 권한을 허용해 주세요 · HTTPS 필요';}}
  finally{cameraRequest=null;}
 })();return cameraRequest;
};
$('camera').onclick=()=>{if(stream){window.invalidatePaperCamera();stream.getTracks().forEach(t=>t.stop());stream=null;$('video').srcObject=null;$('camera').textContent='카메라 켜기';$('cammsg').textContent='카메라가 꺼졌어요';return}window.activatePaperCamera()};
setInterval(()=>{if(!stream||!$('auto').checked||$('paperPanel').hidden)return;try{if(active)return;inspect($('video'))}catch(e){count=0;if(++miss>=2)latched=false;$('cammsg').textContent=e.message}},650);
$('scan').onclick=()=>{try{inspect($('video'),true);$('cammsg').textContent='인식 완료'}catch(e){$('cammsg').textContent=e.message}};$('file').onchange=async e=>{let f=e.target.files[0];if(!f)return;let url=URL.createObjectURL(f);try{let im=new Image();im.src=url;await im.decode();inspect(im,true);$('cammsg').textContent='사진 인식 완료'}catch(e){$('cammsg').textContent=e.message}finally{URL.revokeObjectURL(url);e.target.value=''}};
$('reset').onclick=()=>{active=false;game=null;latched=false;count=0;stable='';$('status').textContent='그림을 보여 주세요!';$('score').textContent='';$('controls').textContent='새 그림을 준비해 주세요.'};$('full').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else return}catch{}};
const rotateGame=$('rotateGame');
function updateRotateLabel(){if(!rotateGame)return;const landscape=matchMedia('(orientation: landscape)').matches;rotateGame.textContent=landscape?'↺ 세로':'⤾ 가로';rotateGame.setAttribute('aria-label',landscape?'세로 화면으로 전환':'가로 화면으로 전환')}
updateRotateLabel();addEventListener('orientationchange',updateRotateLabel);addEventListener('resize',updateRotateLabel);
rotateGame.onclick=async()=>{
 const landscape=matchMedia('(orientation: landscape)').matches,target=landscape?'portrait':'landscape';
 // screen.orientation.lock() is usually available only in fullscreen and
 // not on iOS Safari. Never rotate the game canvas itself or distort art.
 try{
  if(!document.fullscreenElement&&document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();
  if(typeof screen.orientation?.lock!=='function')throw Error('unavailable');
  await screen.orientation.lock(target);
  $('controls').textContent=help[game?.mode??0];
 }catch(e){
  $('controls').textContent=target==='landscape'?'가로 자동 회전을 켜고 휴대폰을 옆으로 돌려 주세요.':'휴대폰을 세로로 돌려 주세요.';
 }
 updateRotateLabel();
};names.forEach((n,i)=>{let b=document.createElement('button');b.textContent=n;b.onclick=()=>example(i);$('examples').append(b)});const keyboard=new Set(),touchKeys=new Map(),aliases={KeyA:'ArrowLeft',KeyD:'ArrowRight',KeyW:'ArrowUp',KeyS:'ArrowDown',KeyZ:'Space'},valid=new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','KeyX']),presses=new Map(),releases=new Map(),heldSince=new Map();let releasePower=0,stick=null;
function pending(k){return (presses.get(k)||0)>performance.now()}function consume(k){let yes=pending(k);presses.delete(k);return yes}function released(k){let r=releases.get(k);releases.delete(k);if(!r||r.until<performance.now())return false;releasePower=r.power;return true}
function syncInput(){let old=new Set(keys);keys.clear();for(let k of keyboard)keys.add(game?.mode===5&&(k==='KeyW'||k==='KeyS')?k:(aliases[k]||k));for(let k of touchKeys.values())if(k)keys.add(k);let now=performance.now();for(let k of keys)if(!old.has(k)){presses.set(k,now+220);heldSince.set(k,now)}for(let k of old)if(!keys.has(k)){releases.set(k,{until:now+240,power:(now-(heldSince.get(k)??now))/1000});heldSince.delete(k)}for(let b of document.querySelectorAll('[data-key]'))b.classList.toggle('pressed',keys.has(b.dataset.key))}
function inputAxes(){let x=+key('ArrowRight')-+key('ArrowLeft'),y=+key('ArrowDown')-+key('ArrowUp');if(stick){x=clamp(x+stick.x,-1,1);y=clamp(y+stick.y,-1,1)}return [x,y]}
function clearInput(){keyboard.clear();touchKeys.clear();stick=null;syncInput();presses.clear();releases.clear();heldSince.clear();let knob=$('stickKnob');if(knob)knob.style.transform='translate(-50%,-50%)'}
window.addEventListener('keydown',e=>{let k=aliases[e.code]||e.code;if(valid.has(k)&&active){e.preventDefault();keyboard.add(e.code);syncInput()}});window.addEventListener('keyup',e=>{keyboard.delete(e.code);syncInput()});window.addEventListener('blur',clearInput);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearInput()});
const touch=$('touch');function buttonAt(e){let b=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-key]');return b&&touch.contains(b)&&!b.hidden?b.dataset.key:null}
touch.addEventListener('pointerdown',e=>{if(!active)return;let k=buttonAt(e);if(!k)return;e.preventDefault();touch.setPointerCapture(e.pointerId);touchKeys.set(e.pointerId,k);syncInput()});touch.addEventListener('pointermove',e=>{if(!touchKeys.has(e.pointerId))return;touchKeys.set(e.pointerId,buttonAt(e));syncInput()});function releaseTouch(e){if(touchKeys.delete(e.pointerId))syncInput()}for(let n of ['pointerup','pointercancel','lostpointercapture'])touch.addEventListener(n,releaseTouch);
function flipperY(i){return H-35-50*(game?.flippers?.[i]?.pos||0)}
