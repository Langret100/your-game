'use strict';
// Game genre suggestion and two-player rally game. All drawing is processed locally.
(()=>{
  const originalStart=start, originalUpdate=update, originalDraw=draw;
  // Genre detection consumes the SAME full-resolution analysis used by the
  // game. Never resize the child's drawing merely to guess its genre.
  // An explicit genre selection still overrides this suggestion.
  function sceneForGenre(source){
    const old=window.preparedActorScene;
    if(old?.art===source&&old.w===source.width&&old.h===source.height)return old.scene;
    W=source.width;H=source.height;
    const scene=analyze(source);
    window.preparedActorScene={art:source,w:W,h:H,scene};
    return scene;
  }
  function guessGenre(source){
    const scene=sceneForGenre(source),{m,o}=scene;
    const w=source.width,h=source.height;
    const player=o[2][0],red=o[3],green=o[4],yellow=o[5];
    const normX=p=>p.x/w,normY=p=>p.y/h;
    // Priority 1: a green destination is an exploration objective.
    // No amount of red enemies or sparse terrain may override it.
    if(green.length){
      // Distinguish a labyrinth from platforms using FULL-RES internal wall
      // continuity. A stepped platform may contain steep short sides, but a
      // maze usually contains multiple tall separated internal partitions.
      const y0=Math.round(h*.07),y1=Math.round(h*.93);
      const x0=Math.round(w*.12),x1=Math.round(w*.88);
      const wallXs=[];
      let verticalWeight=0;
      const stride=Math.max(2,Math.round(w/340));
      for(let x=x0;x<=x1;x+=stride){
        let longest=0,run=0;
        for(let y=y0;y<=y1;y++){
          const k=y*w+x;
          // Antialiasing gaps of at most a few pixels do not split a wall.
          let solid=false;
          for(let dx=-1;dx<=1;dx++)if(m[k+dx]===1){solid=true;break}
          run=solid?run+1:0;
          if(run>longest)longest=run;
        }
        if(longest>=h*.32){
          verticalWeight++;
          if(!wallXs.length||x-wallXs[wallXs.length-1]>w*.075)wallXs.push(x);
        }
      }
      // Two separate high partitions are required; a steep single hill is
      // a platformer. Long horizontal paths/ramps are the ordinary default.
      return wallXs.length>=2&&verticalWeight>=2?1:0;
    }
    // Priority 2: two tall side paddles and a centre ball imply pong.
    if(player&&red.length===1&&yellow.length){
      const opponent=red[0];
      const ar=p=>p.h/Math.max(1,p.w);
      if(normX(player)<.31&&normX(opponent)>.69&&ar(player)>1.9&&ar(opponent)>1.9&&yellow.some(p=>normX(p)>.24&&normX(p)<.76))return 5;
    }
    // Exact full-res black geometry; no resized RGB data / pixel threshold.
    const cols=[0,0,0,0],rows=[0,0],xL=Math.round(w*.065),xR=Math.round(w*.935);
    let topMid=0,bottomMid=0,blackCount=0,blackMinX=w,blackMaxX=-1;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      if(m[y*w+x]!==1)continue;
      blackCount++;blackMinX=Math.min(blackMinX,x);blackMaxX=Math.max(blackMaxX,x);
      if(x<xL)cols[0]++;if(x>xR)cols[1]++;
      if(y<h*.12)cols[2]++;if(y>h*.88)cols[3]++;
      if(x>w*.29&&x<w*.71){if(y<h*.12)topMid++;if(y>h*.88)bottomMid++;}
    }
    // Racing requires an actual enclosing course, not isolated step lines.
    if(cols.every(n=>n>Math.max(12,w*h*.0007))&&topMid>w*.12&&bottomMid>w*.12&&blackCount>w*h*.012)return 2;
    // Pinball needs side boundaries AND a central bottom ball, unlike a
    // left-to-right platform course with scattered red monsters.
    if(player&&red.length>=3&&normX(player)>.32&&normX(player)<.68&&normY(player)>.65){
      let leftRows=0,rightRows=0;
      for(let y=Math.round(h*.12);y<h*.91;y+=Math.max(3,Math.round(h*.08))){
        let L=false,R=false;
        for(let x=0;x<xL;x++)if(m[y*w+x]===1){L=true;break}
        for(let x=xR;x<w;x++)if(m[y*w+x]===1){R=true;break}
        if(L)leftRows++;if(R)rightRows++;
      }
      if(leftRows>=5&&rightRows>=5)return 4;
    }
    // A long drawn ground course (even a very thin pen line) is a
    // platformer. This inspects horizontal span of actual connected ink.
    const fullBlack=comps(m,w,h,1,12);
    const longPlatform=fullBlack.some(p=>p.x1-p.x0>w*.48 && p.y1-p.y0>h*.06);
    if(player&&normX(player)<.32&&blackCount>0&&blackMaxX-blackMinX>w*.51)return 0;
    // Shooting only when there is NO green objective and the scene resembles
    // vertical enemy waves, with no strong platform course.
    if(player&&normY(player)>.52&&red.length>=2&&!longPlatform)return 3;
    return 0;
  }
  window.guessDrawingGenre=guessGenre;
  function getMarker(o,index){return (o||[]).sort((a,b)=>b.n-a.n)[index]||null}
  function preparePong(art){
    const scene=analyze(art),p1=getMarker(scene.o[2],0),p2=getMarker(scene.o[3],0),ball=getMarker(scene.o[5],0);
    W=art.width;H=art.height;
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
    active=true;dirty=true;clearInput();window.showGame?.(5);resizeGameRender(true);$('controls').textContent='1P (파랑) W/S · 2P (빨강) ↑/↓ · 모바일은 화면 좌우에서 드래그';
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
