'use strict';
// Game genre suggestion and two-player rally game. All drawing is processed locally.
(()=>{
  const originalStart=start, originalUpdate=update, originalDraw=draw;
  // An inexpensive coarse segmentation pass. A suggestion, not ML image understanding.
  function guessGenre(source){
    const thumb=cv(156,100),tc=thumb.getContext('2d',{willReadFrequently:true});
    tc.drawImage(source,0,0,thumb.width,thumb.height);
    const {data}=tc.getImageData(0,0,156,100),balance=source.paperSource?paperWhiteBalance(data,156,100):[1,1,1],labels=new Uint8Array(15600),stat=Array.from({length:6},()=>({n:0,x:0,y:0,minX:156,minY:100,maxX:0,maxY:0}));
    let blackSide=[0,0,0,0],blackCenter=0;
    for(let y=0;y<100;y++)for(let x=0;x<156;x++){
      const k=y*156+x,i=k*4,c=color(Math.min(255,data[i]*balance[0]),Math.min(255,data[i+1]*balance[1]),Math.min(255,data[i+2]*balance[2]));labels[k]=c;
      if(!c)continue;
      const s=stat[c];s.n++;s.x+=x;s.y+=y;s.minX=Math.min(s.minX,x);s.maxX=Math.max(s.maxX,x);s.minY=Math.min(s.minY,y);s.maxY=Math.max(s.maxY,y);
      if(c===1){if(x<12)blackSide[0]++;if(x>143)blackSide[1]++;if(y<12)blackSide[2]++;if(y>87)blackSide[3]++;if(x>25&&x<131&&y>20&&y<80)blackCenter++}
    }
    const blobs=(c,min=5)=>comps(labels,156,100,c,min).sort((a,b)=>b.n-a.n);
    const blue=blobs(2),red=blobs(3),yellow=blobs(5),green=blobs(4);
    // Fine green marker strokes can vanish at 156x100. Trust the completed
    // full-resolution analysis if available; otherwise check a sharper
    // downsample once. A green *component*, not isolated JPEG noise, wins.
    let hasGoal=green.length>0;
    if(!hasGoal){
      const cached=window.preparedActorScene;
      if(cached?.art===source&&cached.scene?.o?.[4]?.length)hasGoal=true;
      else{
        const fine=cv(390,220),fg=fine.getContext('2d',{willReadFrequently:true});
        fg.drawImage(source,0,0,390,220);
        const fdata=fg.getImageData(0,0,390,220).data,mask=new Uint8Array(390*220),wb=source.paperSource?paperWhiteBalance(fdata,390,220):[1,1,1];
        for(let i=0;i<mask.length;i++)mask[i]=color(Math.min(255,fdata[i*4]*wb[0]),Math.min(255,fdata[i*4+1]*wb[1]),Math.min(255,fdata[i*4+2]*wb[2]));
        hasGoal=comps(mask,390,220,4,7).some(o=>o.n>=8&&Math.max(o.x1-o.x0,o.y1-o.y0)>=3);
      }
    }
    const b=blue[0],r=red[0],z=yellow[0],ratio=o=>(o.y1-o.y0+1)/Math.max(1,o.x1-o.x0+1);
    const center=o=>[(o.x0+o.x1)/2/156,(o.y0+o.y1)/2/100];
    // Hand-drawn paddles on opposite sides + a central ball -> two-player rally.
    if(!hasGoal&&b&&r&&z&&center(b)[0]<.31&&center(r)[0]>.69&&ratio(b)>1.9&&ratio(r)>1.9&&center(z)[0]>.24&&center(z)[0]<.76)return 5;
    // A course with a left-side player, an exit flag on the right, and
    // irregular black terrain is a platformer, not pinball. Red circles above
    // platforms are enemies; they are NOT sufficient evidence of bumpers.
    const leftStart=b&&center(b)[0]<.28&&center(b)[1]>.38;
    const rightGoal=green.some(o=>center(o)[0]>.72);
    const hasCourse=stat[1].n>75&&stat[1].maxX-stat[1].minX>92;
    // A green destination ALWAYS describes an exploration objective in AUTO
    // mode: prefer platforming; only a clearly enclosed corridor layout is a maze.
    // Deliberate selection of racing/shooting still bypasses auto detection.
    if(hasGoal){
      let longWalls=0,lastWall=-20;
      for(let x=17;x<139;x++){
        // Check for sustained vertical internal walls, ignoring short steps
        // and diagonal ramps that should produce a platformer.
        let longest=0,run=0;
        for(let y=13;y<87;y++){
          let wall=false;
          for(let dx=-1;dx<=1;dx++)if(labels[y*156+x+dx]===1){wall=true;break}
          run=wall?run+1:0;longest=Math.max(longest,run);
        }
        if(longest>=28&&x-lastWall>=6){longWalls++;lastWall=x;}
      }
      const intricateMaze=longWalls>=2&&blackCenter>38&&stat[1].maxY-stat[1].minY>45&&stat[1].n>120;
      return intricateMaze?1:0;
    }
    // Racing tracks have top AND bottom closure through the centre. A
    // pinball table has an open lower drain, so side walls alone cannot
    // distinguish them.
    let topMid=0,bottomMid=0;
    for(let yy=0;yy<100;yy++)for(let xx=45;xx<111;xx++){
      if(labels[yy*156+xx]!==1)continue;
      if(yy<12)topMid++;if(yy>87)bottomMid++;
    }
    if(blackSide.every(v=>v>13)&&topMid>20&&bottomMid>20&&stat[1].n>200)return 2;
    // An enclosed pinball table has a ball near the horizontal centre,
    // multiple interior bumpers, and substantial vertical side walls.
    const sideCoverage=(left)=>{
      let rows=0;
      for(let row=12;row<91;row+=8){
        let hit=false;
        for(let x=left?0:146;x<(left?10:156);x++){
          if(labels[row*156+x]===1){hit=true;break}
        }
        if(hit)rows++;
      }
      return rows;
    };
    const centralBall=b&&center(b)[0]>.32&&center(b)[0]<.68&&center(b)[1]>.65;
    if(centralBall&&red.length>=3&&sideCoverage(true)>=5&&sideCoverage(false)>=5&&!rightGoal)return 4;
    if(leftStart&&hasCourse)return 0;
    // In a shooting scene, isolated black bars are descending obstacles,
    // not permanent ground. Only a broad connected course implies platforming.
    const hasLongPlatform=comps(labels,156,100,1,6).some(o=>(o.x1-o.x0+1)>76&&(o.y1-o.y0+1)>12);
    if(b&&center(b)[1]>.53&&red.length>=2&&!hasLongPlatform&&stat[1].n<700)return 3;
    // Maze: connected interior walls reaching across the field.
    if(stat[1].n>120&&blackCenter>55&&stat[1].maxY-stat[1].minY>58&&stat[1].maxX-stat[1].minX>62&&b&&center(b)[1]<.65)return 1;
    // A sparse sketch with multiple red objects is more likely to be shooting.
    if(red.length>=4&&stat[1].n<100)return 3;
    return 0;
  }
  window.guessDrawingGenre=guessGenre;
  function getMarker(o,index){return (o||[]).sort((a,b)=>b.n-a.n)[index]||null}
  function preparePong(art){
    const scene=analyze(art),p1=getMarker(scene.o[2],0),p2=getMarker(scene.o[3],0),ball=getMarker(scene.o[5],0);
    W=art.width;H=art.height;C.width=W;C.height=H;
    const top=25,bottom=H-25, paddleH=clamp(H*.16,64,130),paddleW=clamp(W*.028,14,25);
    const halfW=W*.055;
    // Per-side paddle positions always stay inside their respective half.
    const left={x:halfW,y:clamp(p1?.y||H/2,top+paddleH/2,bottom-paddleH/2),w:paddleW,h:paddleH,custom:!!p1&&p1.im?.height>12,im:p1?.im,vy:0,target:null};
    const right={x:W-halfW,y:clamp(p2?.y||H/2,top+paddleH/2,bottom-paddleH/2),w:paddleW,h:paddleH,custom:!!p2&&p2.im?.height>12,im:p2?.im,vy:0,target:null};
    // Scores, sound and particles all use the existing offline game infrastructure.
    game={mode:5,m:scene.m,terrain:scene.terrain,solidIndex:buildSolidIndex(scene.m),p:left,
      enemies:[],goals:[],coins:[],life:3,fx:[],bullets:[],score:0,t:0,finished:false,won:false,
      point:[0,0],paddles:[left,right],ball:{x:W/2,y:H/2,vx:0,vy:0,r:Math.max(9,Math.min(W,H)*.018),trail:[],im:ball?.im},serve:.85,serveTo:Math.random()<.5?-1:1,
      goalAt:5,top,bottom,prevSound:0,background:$('paperPanel').hidden?window.getBackground?.():null};
    active=true;dirty=true;clearInput();window.showGame?.(5);$('controls').textContent='1P (파랑) W/S · 2P (빨강) ↑/↓ · 모바일은 화면 좌우에서 드래그';
    $('status').textContent='2인용 공 튕기기 · 5점 승리';$('score').textContent='1P 0 : 0 2P';
    document.activeElement?.blur();
  }
  start=function(mode,art){
    const auto=mode===-1;
    if(auto)mode=guessGenre(art);
    window.rememberGame?.(mode,art);
    if(mode===5)preparePong(art);else originalStart(mode,art);
    if(auto){$('status').textContent='그림 분석 → '+names[mode]+' 생성';}
    // Prevent the expensive build interval from being mistaken for elapsed
    // gameplay time on the first rendered frame (all six genres, retry too).
    window.resetGameFrameClock?.();
  };
  function sfxSafe(name){try{sfx(name)}catch{}}
  function resetBall(a,to){const b=a.ball;b.x=W/2;b.y=H/2;b.vx=0;b.vy=0;b.trail.length=0;a.serve=.75;a.serveTo=to;}
  function serve(a){let b=a.ball,dir=a.serveTo;let vel=330+W*.11; b.vx=dir*vel;b.vy=(Math.random()-.5)*vel*.7;a.serve=0;}
  function pointFor(a,side){a.point[side]++;a.score=a.point[0]*100+a.point[1]*100;burst(W/2,H/2,side?'#e94343':'#2475df',14);sfxSafe('coin');
    if(a.point[side]>=a.goalAt){finish((side?'2P':'1P')+' 승리! · 5점 획득');return;}resetBall(a,side?1:-1);
  }
  const touchSet=[null,null];
  function updatePong(dt){
    const a=game;a.t+=dt;
    for(const f of a.fx){f.x+=f.vx*dt;f.y+=f.vy*dt;f.t-=dt;}a.fx=a.fx.filter(f=>f.t>0);
    const pressed=[[key('KeyW'),key('KeyS')],[key('ArrowUp'),key('ArrowDown')]];
    for(let i=0;i<2;i++){
      const p=a.paddles[i],v=p.vy,up=pressed[i][0],dn=pressed[i][1];
      // Direct 2-finger dragging and keyboard both work with a single canvas.
      if(p.target!==null){let d=p.target-p.y;p.vy=clamp(d*16,-630,630)}
      else {const desire=(Number(dn)-Number(up))*440;p.vy+=(desire-p.vy)*Math.min(1,dt*22)}
      p.y=clamp(p.y+p.vy*dt,a.top+p.h/2,a.bottom-p.h/2);
    }
    if(a.serve>0){a.serve-=dt;if(a.serve<=0)serve(a);return;}
    const b=a.ball,sp=Math.hypot(b.vx,b.vy);
    if(sp>850){b.vx*=850/sp;b.vy*=850/sp}
    const steps=Math.max(1,Math.ceil(Math.max(Math.abs(b.vx),Math.abs(b.vy))*dt/4)),h=dt/steps;
    for(let t=0;t<steps;t++){
      let nx=b.x+b.vx*h,ny=b.y+b.vy*h;
      if(ny-b.r<a.top){ny=a.top+b.r;b.vy=Math.abs(b.vy);sfxSafe('wall')}
      if(ny+b.r>a.bottom){ny=a.bottom-b.r;b.vy=-Math.abs(b.vy);sfxSafe('wall')}
      // Deflect from player-drawn black walls, if any.
      const normal=ballContact(nx,ny);
      if(normal){const dot=b.vx*normal[0]+b.vy*normal[1];if(dot<0){b.vx-=1.85*dot*normal[0];b.vy-=1.85*dot*normal[1];sfxSafe('wall');}nx=b.x+b.vx*h*.4;ny=b.y+b.vy*h*.4}
      for(let i=0;i<2;i++){
        const p=a.paddles[i],sign=i?-1:1,edge=p.x+sign*(p.w/2);
        if((i?b.vx>0:b.vx<0)&&Math.abs(nx-p.x)<b.r+p.w*.65&&Math.abs(ny-p.y)<p.h*.52+b.r){
          const offset=clamp((ny-p.y)/(p.h*.5),-1,1),speed=Math.min(780,Math.hypot(b.vx,b.vy)*1.055+12);
          b.vx=sign*speed*Math.max(.55,Math.cos(offset*.95));b.vy=speed*Math.sin(offset*.95)+p.vy*.18;
          nx=p.x+sign*(p.w/2+b.r+2);burst(nx,ny,i?'#e94343':'#2475df',7);sfxSafe('flipper');
        }
      }
      b.x=nx;b.y=ny;
      if(b.x< -b.r*2){pointFor(a,1);return}
      if(b.x> W+b.r*2){pointFor(a,0);return}
    }
    b.trail.unshift({x:b.x,y:b.y});if(b.trail.length>7)b.trail.length=7;
    if(a.t>=90){const winner=a.point[0]===a.point[1]?'무승부!':(a.point[0]>a.point[1]?'1P':'2P')+' 승리!';finish(winner);return}
    $('score').textContent=`1P ${a.point[0]} : ${a.point[1]} 2P · ${Math.max(0,Math.ceil(90-a.t))}초`;
  }
  update=function(dt){if(game?.mode===5){updatePong(dt);return}originalUpdate(dt)};
  function drawPong(){
    const a=game,b=a.ball;g.fillStyle='#fafaf3';g.fillRect(0,0,W,H);
    if(a.background)g.drawImage(a.background,0,0,W,H);
    // Soft arena stripes and crisp center divider.
    g.fillStyle='rgba(36,117,223,.035)';g.fillRect(0,a.top,W/2,a.bottom-a.top);
    g.fillStyle='rgba(233,67,67,.035)';g.fillRect(W/2,a.top,W/2,a.bottom-a.top);
    g.strokeStyle='#7d9a92';g.lineWidth=2;g.setLineDash([10,13]);g.beginPath();g.moveTo(W/2,a.top);g.lineTo(W/2,a.bottom);g.stroke();g.setLineDash([]);
    g.strokeStyle='#a8b4ab';g.lineWidth=3;g.beginPath();g.moveTo(0,a.top);g.lineTo(W,a.top);g.moveTo(0,a.bottom);g.lineTo(W,a.bottom);g.stroke();
    if(a.terrain)g.drawImage(a.terrain,0,0);
    for(let i=0;i<2;i++){
      const p=a.paddles[i],col=i?'#e94343':'#2475df';
      g.save();g.translate(p.x,p.y);
      g.strokeStyle=col;g.lineWidth=4;g.lineCap='round';g.lineJoin='round';
      if(p.custom&&p.im?.width>0){let k=Math.min(p.w*2.2/p.im.width,p.h/p.im.height);g.drawImage(p.im,-p.im.width*k/2,-p.im.height*k/2,p.im.width*k,p.im.height*k);}
      else {g.beginPath();g.moveTo(0,-p.h/2);g.lineTo(0,p.h/2);g.stroke();g.beginPath();g.moveTo(-p.w*.2,-p.h*.4);g.lineTo(-p.w*.2,p.h*.4);g.stroke();}
      g.restore();
    }
    for(let i=b.trail.length-1;i>=0;i--){let p=b.trail[i];g.beginPath();g.arc(p.x,p.y,b.r*(1-i/b.trail.length)*.85,0,Math.PI*2);g.fillStyle=`rgba(227,179,40,${.15*(1-i/b.trail.length)})`;g.fill();}
    g.fillStyle='#ffe07a';g.strokeStyle='#b98b24';g.lineWidth=3;g.beginPath();g.arc(b.x,b.y,b.r,0,Math.PI*2);g.fill();g.stroke();
    g.textAlign='center';g.font=`bold ${Math.max(24,Math.min(54,W*.062))}px sans-serif`;
    g.fillStyle='#2475df';g.fillText(a.point[0],W*.42,a.top+50);g.fillStyle='#e94343';g.fillText(a.point[1],W*.58,a.top+50);
    g.font=`${Math.min(17,W*.024)}px sans-serif`;g.fillStyle='#67776d';g.fillText('W / S',W*.15,a.top+23);g.fillText('↑ / ↓',W*.85,a.top+23);
    if(a.serve>0&&!a.finished){g.font=`bold ${Math.min(26,W*.045)}px sans-serif`;g.fillStyle='#566b63';g.fillText('준비!',W/2,H*.66)}
    for(const f of a.fx){g.globalAlpha=Math.min(1,f.t*4);g.fillStyle=f.color;g.beginPath();g.arc(f.x,f.y,3,0,Math.PI*2);g.fill()}g.globalAlpha=1;
    if(a.finished){g.fillStyle='rgba(22,36,53,.87)';g.fillRect(0,0,W,H);g.fillStyle='#fff6d5';g.textAlign='center';g.font=`bold ${Math.min(W*.06,48)}px sans-serif`;g.fillText($('status').textContent,W/2,H*.46);g.font=`${Math.min(W*.04,29)}px sans-serif`;g.fillText(`${a.point[0]} : ${a.point[1]}`,W/2,H*.55)}
  }
  draw=function(){if(game?.mode===5){drawPong();return}originalDraw()};
  // Drag with a finger in either half of the game canvas to control both paddles.
  const pointerOwner=new Map();
  function drag(e){if(!game||game.mode!==5||game.finished)return;let index=pointerOwner.get(e.pointerId);if(index===undefined)return;const r=C.getBoundingClientRect();game.paddles[index].target=clamp((e.clientY-r.top)*H/r.height,game.top,game.bottom)}
  C.addEventListener('pointerdown',e=>{if(!active||game?.mode!==5)return;e.preventDefault();const rect=C.getBoundingClientRect();const idx=(e.clientX-rect.left)<rect.width/2?0:1;if([...pointerOwner.values()].includes(idx))return;pointerOwner.set(e.pointerId,idx);try{C.setPointerCapture(e.pointerId)}catch{}drag(e)});
  C.addEventListener('pointermove',drag);
  for(const type of ['pointerup','pointercancel','lostpointercapture'])C.addEventListener(type,e=>{const idx=pointerOwner.get(e.pointerId);if(idx!==undefined){if(game?.mode===5)game.paddles[idx].target=null;pointerOwner.delete(e.pointerId)}});
  window.addEventListener('blur',()=>{pointerOwner.clear();if(game?.mode===5)for(let p of game.paddles)p.target=null});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){pointerOwner.clear();if(game?.mode===5)for(let p of game.paddles)p.target=null}});
  window.pongTest={guess:guessGenre,serve,pointFor};
})();
