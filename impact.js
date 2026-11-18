'use strict';
// Procedural audio and bounded, event-driven feedback. No external media.
let noiseBuffer=null, master=null;
function sfx(kind,power=1){if(!soundCtx||soundCtx.state!=='running')return;try{let c=soundCtx,t=c.currentTime;if(!master){master=c.createDynamicsCompressor();master.threshold.value=-16;master.ratio.value=5;master.connect(c.destination)}const vol=clamp(power,.25,1);function tone(f,end,dur,amp,type='sine',delay=0){let o=c.createOscillator(),v=c.createGain(),at=t+delay;o.type=type;o.frequency.setValueAtTime(f,at);o.frequency.exponentialRampToValueAtTime(Math.max(25,end),at+dur);v.gain.setValueAtTime(.0001,at);v.gain.exponentialRampToValueAtTime(Math.max(.0002,amp*vol),at+.006);v.gain.exponentialRampToValueAtTime(.0001,at+dur);o.connect(v);v.connect(master);o.start(at);o.stop(at+dur+.01);o.onended=()=>{o.disconnect();v.disconnect()}}
function noise(dur,amp,freq,type='lowpass'){if(!noiseBuffer){noiseBuffer=c.createBuffer(1,Math.ceil(c.sampleRate*.4),c.sampleRate);let d=noiseBuffer.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1}let o=c.createBufferSource(),f=c.createBiquadFilter(),v=c.createGain();o.buffer=noiseBuffer;f.type=type;f.frequency.value=freq;v.gain.setValueAtTime(amp*vol,t);v.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(f);f.connect(v);v.connect(master);o.start(t);o.stop(t+dur);o.onended=()=>{o.disconnect();f.disconnect();v.disconnect()}}
switch(kind){case 'wall':tone(130,48,.12,.19);noise(.085,.19,1250);break;case 'crash':tone(108,32,.23,.25);noise(.19,.28,1700);break;case 'land':tone(105,46,.13,.12);noise(.10,.12,650);break;case 'swing':noise(.12,.12,2200,'bandpass');break;case 'strike':tone(165,47,.14,.26);noise(.095,.27,2500);tone(420,85,.06,.07,'triangle');break;case 'pop':tone(220,90,.10,.18,'triangle');tone(480,160,.09,.12,'triangle',.025);noise(.08,.22,1800);break;case 'hurt':tone(155,52,.22,.22,'triangle');noise(.12,.16,950);break;case 'shot':noise(.05,.05,3400,'highpass');tone(300,110,.055,.035,'triangle');break;case 'shotHit':tone(190,72,.09,.15);noise(.075,.18,2200);break;case 'bumper':tone(520,330,.13,.15,'triangle');tone(160,72,.10,.1);break;case 'flipper':noise(.055,.13,1900);tone(220,80,.10,.13);break;case 'jump':tone(160,320,.13,.065,'triangle');break;case 'boing':tone(190,375,.17,.07,'sine');tone(320,175,.12,.04,'triangle',.025);break;case 'coin':tone(660,720,.095,.075,'sine');tone(990,1040,.14,.07,'sine',.055);break;case 'win':[392,494,587,784].forEach((f,i)=>tone(f,f,.24,.085,'triangle',.11*i));break;case 'end':tone(230,90,.30,.10,'triangle');break;}}catch{}}
const impactStyles={wall:['#d6b78d',.18,3,0],crash:['#e99b49',.28,8,0.035],land:['#b8a68e',.20,3,0],strike:['#f5ad31',.25,7,.055],pop:['#f46a6a',.28,8,.065],hurt:['#e54b4b',.28,7,.045],shotHit:['#f2ab43',.18,2,.012],bumper:['#f4bd45',.23,4,.015],flipper:['#70b9e9',.18,3,0]};
function impact(kind,x,y,dx=0,dy=0,power=1){let a=game;if(!a||!Number.isFinite(x+y))return;let st=impactStyles[kind];if(!st)return;let [color,life,shake,stop]=st;power=clamp(power,.25,1);a.impacts??=[];if(a.impacts.length>=18)a.impacts.shift();a.impacts.push({kind,x,y,dx,dy,color,t:life,life,power});if((kind==='hurt'||kind==='bumper'||kind==='flipper')&&a.p?.blob&&Math.hypot(a.p.x-x,a.p.y-y)<Math.max(95,a.p.w*2.5)&&!(a.p.blobHitCooldown>0))blobKick(a.p,dx,dy,120+power*300);
a.camKick=Math.max(a.camKick||0,shake*power);a.freeze=Math.max(a.freeze||0,stop*power);sfx(kind,power);let n=Math.min(14,Math.round(5+power*8));if(a.fx.length<100)for(let i=0;i<n;i++){let ang=Math.atan2(dy,dx)+(Math.random()-.5)*Math.PI*1.4,v=45+Math.random()*195*power;a.fx.push({x,y,vx:Math.cos(ang)*v,vy:Math.sin(ang)*v,t:.15+Math.random()*.2,color})}}
// Collision-triggered jelly physics. A small damped oscillator runs once per
// physics tick. Contact gating prevents a resting blob from vibrating forever.
function blobKick(o,nx,ny,speed){
 if(!o?.blob||!o.actor?.blob)return false;
 const horizontal=Math.abs(nx)>Math.abs(ny);
 const magnitude=clamp((speed-35)/450,.22,1);
 const compress=.10+.19*magnitude;
 o.blobSpringX=clamp((o.blobSpringX||0)+(horizontal?-compress:compress*.82),-.38,.38);
 o.blobSpringY=clamp((o.blobSpringY||0)+(horizontal?compress*.82:-compress),-.38,.38);
 // Repeated hits retain a little momentum, but never accumulate without bound.
 o.blobSpringVX=clamp((o.blobSpringVX||0)*.35,-2.5,2.5);
 o.blobSpringVY=clamp((o.blobSpringVY||0)*.35,-2.5,2.5);
 o.blobHitCooldown=.12;
 return true;
}
function blobStep(o,dt){
 if(!o?.blob||!o.actor?.blob)return;
 o.blobHitCooldown=Math.max(0,(o.blobHitCooldown||0)-dt);
 // Underdamped spring (oscillating instead of monotonic easing), stable at 60Hz.
 const k=168,damping=10;
 for(const axis of ['X','Y']){
  const key='blobSpring'+axis,velocity='blobSpringV'+axis;
  let x=o[key]||0,v=o[velocity]||0;
  if(Math.abs(x)+Math.abs(v)<.0008){o[key]=o[velocity]=0;continue}
  v=(v-k*x*dt)*Math.exp(-damping*dt);
  x=clamp(x+v*dt,-.42,.42);
  o[key]=x;o[velocity]=v;
 }
}
(()=>{let baseMove=move,baseUpdate=update,baseDraw=draw,baseStart=start;const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;start=function(mode,art){baseStart(mode,art);Object.assign(game,{impacts:[],camKick:0,freeze:0,impactCooldown:0,wallContact:'',landLock:0})};move=function(p,dx,dy){
 let a=game,isPlayer=a&&p===a.p;
 const vx=p.vx||0,vy=p.vy||0,wasGround=a?.ground;
 const out=baseMove(p,dx,dy),[bx,by]=out,mode=a?.mode||0;
 const axis=bx?'x':by?'y':'';
 const floor=mode===0&&by&&dy>0;
 const speed=mode===0?Math.abs(bx?vx:vy):mode===2||mode===4?Math.hypot(vx,vy):Math.max(Math.hypot(vx,vy),Math.hypot(dx,dy)*60);
 const normalX=bx?-Math.sign(dx):0,normalY=by?-Math.sign(dy):0;
 if(p.blob&&(bx||by)){
  const contact=bx?'x'+Math.sign(dx):'y'+Math.sign(dy);
  p.blobContactNow=contact;
  const threshold=by&&dy>0?65:40;
  if(speed>threshold&&p.blobContactPrev!==contact&&!(p.blobHitCooldown>0)){
   if(blobKick(p,normalX,normalY,speed)&&isPlayer&&speed>125)sfx('boing',clamp(speed/530,.25,.8));
  }
 }
 if(!isPlayer||!active)return out;
 if(floor&&!wasGround&&vy>125&&!(a.landLock>0)){
  a.landLock=.20;impact('land',p.x,p.y+p.h*.43,0,-1,clamp(vy/580,.25,1));
 }
 if(axis&&(!floor||bx)&&speed>45&&a.wallContact!==axis&&!(a.impactCooldown>0)){
  a.impactCooldown=.17;
  const kind=mode===2?'crash':mode===4?'bumper':'wall';
  impact(kind,p.x-normalX*p.w*.4,p.y-normalY*p.h*.4,normalX,normalY,clamp(speed/300,.3,1));
 }
 a.wallContact=axis&&(!floor||bx)?axis:'';
 return out;
};
update=function(dt){
 const a=game;if(!a)return;
 a.camKick=Math.max(0,(a.camKick||0)-dt*32);
 a.impactCooldown=Math.max(0,(a.impactCooldown||0)-dt);
 a.landLock=Math.max(0,(a.landLock||0)-dt);
 for(const effect of a.impacts||[])effect.t-=dt;
 a.impacts=(a.impacts||[]).filter(effect=>effect.t>0);
 if(a.p?.blob)a.p.blobContactNow='';
 for(const e of a.enemies||[])if(e.blob)e.blobContactNow='';
 if(a.freeze>0)a.freeze=Math.max(0,a.freeze-dt);
 else baseUpdate(dt);
 blobStep(a.p,dt);
 if(a.p?.blob)a.p.blobContactPrev=a.p.blobContactNow||'';
 for(const e of a.enemies||[]){blobStep(e,dt);if(e.blob)e.blobContactPrev=e.blobContactNow||''}
};
draw=function(){let a=game;if(!a||a.finished){baseDraw();return}g.save();if(a.camKick>0&&!reduceMotion){g.fillStyle='#fffdf5';g.fillRect(0,0,W,H);g.translate((Math.random()-.5)*a.camKick*2,(Math.random()-.5)*a.camKick*2)}baseDraw();for(let p of a.impacts||[]){let f=1-p.t/p.life,alpha=1-f,r=8+f*32*p.power;g.save();g.translate(p.x,p.y);g.globalAlpha=alpha;g.strokeStyle=p.color;g.lineWidth=2.5;g.beginPath();g.arc(0,0,r,0,Math.PI*2);g.stroke();g.lineCap='round';if(p.kind==='strike'||p.kind==='hurt'||p.kind==='crash'||p.kind==='pop'){let a=Math.atan2(p.dy,p.dx);g.rotate(a);g.strokeStyle=p.kind==='hurt'?'#e54b4b':p.kind==='pop'?'#f46a6a':'#d99a25';g.lineWidth=3*alpha+.8;for(let j=-2;j<=2;j++){g.beginPath();g.moveTo(r*.25,j*5);g.lineTo(r*(1.0+f*.9),j*(8+f*9));g.stroke()}g.rotate(-a)}for(let i=0;i<7;i++){let ang=i*Math.PI*2/7+Math.atan2(p.dy,p.dx);g.beginPath();g.moveTo(Math.cos(ang)*r*.75,Math.sin(ang)*r*.75);g.lineTo(Math.cos(ang)*(r+12*p.power),Math.sin(ang)*(r+12*p.power));g.stroke()}if(p.kind==='strike'||p.kind==='hurt'||p.kind==='pop'){g.fillStyle=p.kind==='hurt'?'#ffdbdb':p.kind==='pop'?'#ffd3d3':'#fff5ba';g.globalAlpha=alpha*.85;g.beginPath();g.arc(0,0,7+5*alpha,0,Math.PI*2);g.fill()}g.restore()}g.restore()};})();
