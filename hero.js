'use strict';
// One drawing, one scene. Same-colour marks become independent actors.
(()=>{
const cache=new Map(),rigs=new Map(),MAX_FRAMES=180,TAU=Math.PI*2;
window.beginActorFrame=()=>{}; // All heavy pose generation runs before gameplay.
// Join nearby disconnected ink (e.g. a detached head or eyes), not whole neighbouring figures.
window.groupActorInk=function(parts,v){
 if(v!==2&&v!==3)return parts;
 const groups=parts.slice().sort((a,b)=>b.n-a.n).map(p=>({...p}));
 const width=p=>p.x1-p.x0+1,height=p=>p.y1-p.y0+1;
 for(let i=0;i<groups.length;i++){
  const a=groups[i];if(!a)continue;
  for(let j=i+1;j<groups.length;j++){
   const b=groups[j];if(!b)continue;
   const w=width(a),h=height(a),bw=width(b),bh=height(b),gapX=Math.max(0,a.x0-b.x1-1,b.x0-a.x1-1),gapY=Math.max(0,a.y0-b.y1-1,b.y0-a.y1-1),overlap=Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0)+1;
   const tiny=b.n<=a.n*.18&&Math.max(bw,bh)<Math.max(w,h)*.43&&Math.hypot(gapX,gapY)<=Math.min(8,Math.max(3,Math.max(w,h)*.10));
   const head=overlap>Math.min(w,bw)*.40&&gapY<=Math.min(14,Math.max(3,Math.max(h,bh)*.17))&&((b.y1<a.y0+Math.min(h,bh)*.30&&bw<=w*1.1&&bh<=h*.85)||(a.y1<b.y0+Math.min(h,bh)*.30&&w<=bw*1.1&&h<=bh*.85));
   // Separate substantial side-by-side drawings, even if close.
   if(!tiny&&!head)continue;
   a.ids=a.ids.concat(b.ids);a.n+=b.n;a.x0=Math.min(a.x0,b.x0);a.y0=Math.min(a.y0,b.y0);a.x1=Math.max(a.x1,b.x1);a.y1=Math.max(a.y1,b.y1);groups[j]=null;
  }
 }
 return groups.filter(Boolean).sort((a,b)=>b.n-a.n);
};
// Detect the character's WHOLE silhouette, not just its rounded head.
// A blob needs a nearly closed, centred outline over ALL directions. A
// stick figure normally has gaps / limbs away from that outline.
window.classifyActorShape=function(o){
 const w=o.x1-o.x0+1,h=o.y1-o.y0+1,small=Math.min(w,h),large=Math.max(w,h),ink=o.ids;
 if(!ink||ink.length<18||large<26||small<7)return 'default';
 const n=ink.length,fill=n/(w*h),ratio=small/large;
 // Thin lines are position markers, not playable custom characters.
 let sx=0,sy=0,sxx=0,syy=0,sxy=0;
 for(const id of ink){let x=id%W,y=Math.floor(id/W);sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y}
 const vx=sxx/n-(sx/n)**2,vy=syy/n-(sy/n)**2,cov=sxy/n-(sx/n)*(sy/n),sum=vx+vy;
 const linearity=sum>0?(sum-Math.sqrt((vx-vy)**2+4*cov**2))/(sum+Math.sqrt((vx-vy)**2+4*cov**2)):0;
 if(linearity<.012||small<8)return 'default';
 // Circular/oval actors: good radial continuity around the true bounding
 // centre. A round head with limbs cannot pass the angular coverage test.
 if(small>=23&&ratio>=.66&&fill>=.09&&fill<=.90){
  const bins=32,outer=new Float32Array(bins),counts=new Uint16Array(bins);
  let rim=0,outerInk=0;const cx=(o.x0+o.x1)/2,cy=(o.y0+o.y1)/2,rx=w/2,ry=h/2;
  for(const id of ink){
   const x=id%W,y=Math.floor(id/W),px=(x-cx)/rx,py=(y-cy)/ry,r=Math.hypot(px,py);
   const b=Math.min(bins-1,Math.floor((Math.atan2(py,px)+Math.PI)/(2*Math.PI)*bins));
   if(r>outer[b])outer[b]=r;
   if(r>=.70&&r<=1.21){rim++;counts[b]++}
   if(r>1.18)outerInk++;
  }
  let present=0,total=0,mean=0;
  for(let i=0;i<bins;i++){if(outer[i]>=.69)present++;if(counts[i]>0)total++;mean+=outer[i]}
  mean/=bins;let variance=0;for(let i=0;i<bins;i++)variance+=(outer[i]-mean)**2;
  const deviation=Math.sqrt(variance/bins),rimRatio=rim/n;
  if(present>=29&&total>=26&&deviation<.175&&outerInk/n<.075&&(fill>=.46||rimRatio>.57))return 'blob';
 }
 return 'human';
};
window.isActorDrawing=o=>window.classifyActorShape(o)!=='default';
window.isBlobActor=o=>window.classifyActorShape(o)==='blob';
function prepare(o,mode){
 if(!o.custom||!o.im)return;
 const src=o.im,scale=Math.min(1,92/src.width,116/src.height),w=Math.max(1,Math.round(src.width*scale)),h=Math.max(1,Math.round(src.height*scale)),art=cv(w,h),ctx=art.getContext('2d',{willReadFrequently:true});ctx.drawImage(src,0,0,w,h);
 const image=ctx.getImageData(0,0,w,h),d=image.data;let hash=2166136261;for(let i=0;i<d.length;i++){hash=Math.imul(hash^d[i],16777619)}
 const blob=!!o.blob;
 const id=`${blob?'blob:':''}${w}x${h}:${hash>>>0}`;let rig=rigs.get(id);if(!rig){rig={art,w,h,id,continuous:false,blob};rigs.set(id,rig)}
 else if(blob)rig.blob=true;
 o.actor=rig;
}
function pose(r,state,f){
 const w=r.w,h=r.h,src=r.pixels||(r.pixels=r.art.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data);
 const outC=cv(168,168),outG=outC.getContext('2d');
 const out=outG.createImageData(168,168),d=out.data;
 const TA=Math.PI*2,cycle=Math.sin(f*TA),co=Math.cos(f*TA),arc=Math.sin(clamp(f,0,1)*Math.PI);
 const sc=98/Math.max(w,h),inv=1/sc;
 const smooth=(x)=>{x=clamp(x,0,1);return x*x*(3-2*x)};
 const rise=(v,a,b)=>smooth((v-a)/(b-a));
 const band=(v,lo,mid,hi)=>rise(v,lo,mid)*(1-rise(v,mid,hi));
 let tilt=0,bob=0;
 if(state==='run'){tilt=.10;bob=-Math.abs(cycle)*2.7}
 else if(state==='attack'){tilt=.12*arc;bob=-1.5*arc}
 else if(state==='hit'){tilt=-.24*arc;bob=0}
 else if(state==='jump'){tilt=-.06;bob=-3.5}
 else if(state==='land'){tilt=0;bob=3*arc}
 else if(state==='dance'){tilt=.12*cycle;bob=-Math.abs(cycle)*5}
 else if(state==='wind'){tilt=-.10*arc}
 const cs=Math.cos(-tilt),sn=Math.sin(-tilt);
 // Target -> source coordinate mapping: the whole ink drawing remains one
 // raster, with a smooth displacement field rather than cut apart sprites.
 for(let yy=16;yy<155;yy++)for(let xx=16;xx<152;xx++){
  let rx=(xx-84)*inv,ry=(yy-84-bob)*inv;
  const x=rx*cs-ry*sn+w/2,y=rx*sn+ry*cs+h/2;
  if(x< -w*.24||x>w*1.24||y< -h*.26||y>h*1.22)continue;
  let u=x/w,v=y/h,side=Math.tanh((u-.5)*5),dx=0,dy=0;
  const arm=band(v,.24,.43,.70),legs=rise(v,.55,.90);
  if(state==='run'){
   dx+=w*(.025*cycle+.14*side*cycle*arm+.19*side*cycle*legs);
   dy+=h*(.085*side*co*legs-.065*side*co*arm);
  }else if(state==='jump'){
   dx+=w*(.09*side*arm+.07*side*legs);
   dy+=h*(-.09*arm-.12*legs);
  }else if(state==='attack'){
   dx+=w*(.06*arc+.29*arc*arm*rise(u,.35,.80));
   dy+=h*(-.11*arc*arm*rise(u,.35,.80)+.025*arc*legs);
  }else if(state==='hit'){
   dx-=w*.12*arc*(1-v);
   dy+=h*.035*arc*arm;
  }else if(state==='dance'){
   dx+=w*(.07*cycle*(1-v)+.13*side*cycle*arm);
   dy-=h*(.10*arm+.045*legs)*Math.abs(co);
  }else if(state==='wind'){
   dx-=w*.10*arc*arm;
   dy+=h*.045*arc*arm;
  }else if(state==='land'){
   dx+=w*.07*arc*(legs+.3);
   dy+=h*.06*arc*rise(v,.50,.94);
  }else{
   dx+=w*.006*cycle*(1-v);
  }
  const sx=x-dx,sy=y-dy;
  if(sx<0||sy<0||sx>=w-1||sy>=h-1)continue;
  const x0=sx|0,y0=sy|0,tx=sx-x0,ty=sy-y0;
  const k=(yy*168+xx)*4;
  const i0=(y0*w+x0)*4,i1=i0+4,i2=i0+w*4,i3=i2+4;
  const weights=[(1-tx)*(1-ty),tx*(1-ty),(1-tx)*ty,tx*ty];
  const ids=[i0,i1,i2,i3];
  let a=0,rr=0,gg=0,bb=0;
  for(let n=0;n<4;n++){
   let weight=weights[n],id=ids[n],aw=weight*src[id+3];
   if(aw<=0)continue;
   a+=aw;rr+=src[id]*aw;gg+=src[id+1]*aw;bb+=src[id+2]*aw;
  }
  if(a>.3){d[k]=rr/a;d[k+1]=gg/a;d[k+2]=bb/a;d[k+3]=Math.min(255,Math.round(a))}
 }
 outG.putImageData(out,0,0);
 let bottom=0;for(let y=167;y>=0&&!bottom;y--)for(let x=0;x<168;x++)if(d[(y*168+x)*4+3]>90){bottom=y;break}
 return {c:outC,bottom:bottom||Math.round(84+sc*h/2)};
}
// 1 human figure + a few nearby distinct monsters get cached continuous-warp animation.
// Additional unique enemies use inexpensive whole-ink motions; no expensive
// 168x168 readbacks during gameplay.
window.prewarmActors=function(a){
 if(a.mode>=2)return; // vehicles, ships and pinball use the original image directly
 const targets=[];if(a.p.actor&&a.mode<2)targets.push(a.p.actor);
 const sorted=a.enemies.filter(e=>e.actor).sort((a,b)=>(a.x-game.p.x)**2+(a.y-game.p.y)**2-(b.x-game.p.x)**2-(b.y-game.p.y)**2);
 for(const e of sorted){if(targets.includes(e.actor))continue;if(targets.length>=3)break;targets.push(e.actor)}
 for(const rig of targets){if(rig.blob){rig.prewarmed=true;continue}
  rig.continuous=true; // full-raster deformation; source ink remains connected
  let states=rig===a.p.actor?['idle','run','jump','attack','hit','land','dance']:['idle','run','wind','attack'];
  for(const state of states){const n=state==='idle'?1:10;
   for(let i=0;i<n;i++){const key=rig.id+':'+state+':'+i;if(!cache.has(key)){const f=pose(rig,state,n===1?(state==='jump'?.5:0):i/(n-1));cache.set(key,f);if(cache.size>MAX_FRAMES)cache.delete(cache.keys().next().value)}}}
  rig.prewarmed=true;
 }
 for(const e of a.enemies){if(e.actor&&!e.actor.prewarmed)e.lightMotion=true}
};
window.prepareActor=prepare;
window.resetActorCache=()=>{cache.clear();rigs.clear()};
function paintBlob(o,state,f,face,angle,ground){
 const r=o.actor;if(!r)return false;
 const size=Math.max(o.w,o.h),scale=size/Math.max(r.w,r.h);
 const wave=Math.sin(f*TAU),arc=Math.sin(f*Math.PI);
 let sx=1,sy=1,bob=0,rot=(o.roll||0)+(angle||0);
 if(state==='run'){sx+=.08*Math.abs(wave);sy-=.07*Math.abs(wave);bob=-Math.abs(wave)*2.5}
 else if(state==='jump'){sx-=.07;sy+=.10;bob=-3*Math.sin(f*Math.PI);rot+=(o.vx||0)*.0005}
 else if(state==='attack'){sx+=.12*arc;sy-=.08*arc;rot+=(face||1)*.22*arc}
 else if(state==='wind'){sx+=.07*arc;sy-=.05*arc;rot-=(face||1)*.13*arc}
 else if(state==='hit'){sx+=.12*arc;sy-=.09*arc;rot-=(face||1)*.24*arc}
 else if(state==='dance'){sx+=.08*Math.abs(wave);sy-=.09*Math.abs(wave);bob=-Math.abs(wave)*5;rot+=wave*.18}
 else if(state==='land'){sx+=.07*arc;sy-=.04*arc;bob=arc*2}
 // True damped spring offsets: squash -> positive overshoot -> settle.
 // Draw only; no rasterizing/allocating new animation frames per collision.
 sx=clamp(sx+(o.blobSpringX||0),.64,1.42);
 sy=clamp(sy+(o.blobSpringY||0),.64,1.42);
 g.save();g.translate(o.x,o.y);
 if(ground){g.fillStyle='rgba(25,40,50,.12)';g.beginPath();g.ellipse(0,o.h*.43+5,Math.max(8,o.w*.3)*(1+Math.max(0,sx-1)*.6),Math.max(3,o.h*.07),0,0,TAU);g.fill();}
 const anchor=ground?o.h*.43:0;
 // Keep the visible bottom of a landing blob pinned to the surface.
 g.translate(0,bob+(ground?(1-sy)*anchor:0));
 g.rotate(rot);g.scale((face||1)*sx,sy);
 const dy=ground?anchor-r.h*scale/2:-r.h*scale/2;
 g.drawImage(r.art,-r.w*scale/2,dy,r.w*scale,r.h*scale);
 g.restore();return true;
}
function paint(o,state,f,face,angle,ground){const r=o.actor;if(!r)return false;const M=game.mode;const drawnScale=M<2?(o.custom?1:1.18):1;let size=Math.max(o.w,o.h)*drawnScale,scale=size/Math.max(r.w,r.h);if(r.blob)return paintBlob(o,state,f,face,angle,ground);g.save();g.translate(o.x,o.y);g.rotate(angle||0);g.scale(face||1,1);
 if(M>=2||!r.continuous||o.lightMotion||!r.prewarmed){let a=Math.sin(f*TAU),b=state==='attack'||state==='hit'?Math.sin(f*Math.PI):0;let groundShift=M===0?o.h*.43-r.h*scale/2:0;g.translate(0,groundShift);if(M<2){g.rotate(state==='attack'?b*.32:state==='hit'?-b*.34:state==='run'?a*.15:0);g.scale(1+b*.13,1-b*.10+(state==='run'?Math.abs(a)*.08:0))}g.drawImage(r.art,-r.w*scale/2,-r.h*scale/2,r.w*scale,r.h*scale);
 }else{let count=state==='idle'?1:10,i=state==='idle'?0:clamp(Math.round(f*(count-1)),0,count-1),key=r.id+':'+state+':'+i,frame=cache.get(key);if(!frame){ // Never build a skeletal sprite during live play.
 let prev=r.lastFrame;if(prev){let k=size/98,dy=ground?o.h*.43-prev.bottom*k:-84*k;g.drawImage(prev.c,-84*k,dy,168*k,168*k)}else{g.drawImage(r.art,-r.w*scale/2,ground?o.h*.43-r.h*scale:-r.h*scale/2,r.w*scale,r.h*scale)}g.restore();return true}r.lastFrame=frame;let k=size/98,dy=ground?o.h*.43-frame.bottom*k:-84*k;g.drawImage(frame.c,-84*k,dy,168*k,168*k)}g.restore();return true}
window.drawSceneActor=(o,angle=0)=>{if(!o.actor)return false;let a=game,M=a.mode,p=o===a.p,state='idle',f=0,face=1;if(M===2)return paint(o,'idle',0,1,angle,false);if(M===3)return paint(o,'idle',0,1,p?clamp((o.vx||0)/600,-.25,.25):0,false);if(M===4)return paint(o,'idle',0,1,p?a.t*4:0,false);if(p){state=a.inv>1.12?'hit':a.attack>0?'attack':M===0&&!a.ground?'jump':M===0&&a.landLock>.03?'land':Math.hypot(o.vx||0,o.vy||0)>20?'run':'idle';face=a.attack>0?(a.attackDir||a.facing):a.facing;if(state==='attack')f=1-a.attack/.30;else if(state==='hit')f=(1.4-a.inv)/.28;else if(state==='land')f=1-a.landLock/.20;else if(state==='jump')f=.5;else f=(a.t*2.5)%1}else{state=o.strike>0?'attack':o.wind>0?'wind':o.recover>0?'idle':'run';face=o.face||1;f=state==='attack'?1-o.strike/.23:state==='wind'?1-o.wind/.36:(a.t*2+o.phase)%1}return paint(o,state,clamp(f,0,1),face,0,M===0)};
window.drawSceneWin=(x,y)=>{let p=game.p;if(!p.actor)return false;return paint({...p,x,y,w:68,h:80},'dance',(performance.now()/450)%1,1,0,false)};
})();
