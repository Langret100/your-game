'use strict';
// Original ink-line sprites. Shared raster frames, not per-actor vector rendering.
(()=>{
const cache=new Map(), N=24, TAU=Math.PI*2;
const lerp=(a,b,t)=>a+(b-a)*t;
const mix=(a,b,t)=>a.map((p,i)=>p.map((v,j)=>lerp(v,b[i][j],t)));
// Head, neck, hip, rear elbow/hand, front elbow/hand, rear knee/foot, front knee/foot.
const idle=[[0,-37],[0,-24],[0,7],[-12,-7],[-14,10],[12,-6],[14,10],[-9,25],[-11,46],[9,25],[11,46]];
const wind=[[-12,-36],[-10,-21],[-3,8],[-27,-9],[-41,-15],[-19,-18],[-34,-31],[-19,24],[-29,46],[15,22],[24,46]];
const punch=[[15,-34],[11,-19],[-3,8],[-14,-4],[-26,10],[32,-24],[59,-21],[-20,25],[-36,46],[21,22],[28,46]];
const follow=[[12,-31],[9,-17],[0,10],[-13,-1],[-23,14],[29,-6],[43,12],[-17,30],[-26,46],[18,29],[27,46]];
const hurt=[[-22,-25],[-16,-12],[2,10],[-27,-20],[-49,-28],[10,-18],[23,-39],[-12,26],[-27,42],[21,17],[40,26]];
const rising=[[5,-40],[1,-26],[-3,6],[-18,-29],[-29,-48],[16,-40],[27,-57],[-20,21],[-37,12],[20,14],[32,0]];
const falling=[[1,-40],[0,-25],[0,6],[-21,-17],[-41,-26],[23,-14],[42,-23],[-19,22],[-23,43],[16,26],[27,46]];
const land=[[8,-25],[5,-13],[0,18],[-18,-2],[-32,10],[22,-2],[38,10],[-23,27],[-16,46],[20,28],[27,46]];
function pose(state,f){const t=f/(N-1), q=Math.sin(f/N*TAU), r=Math.cos(f/N*TAU);
 if(state==='attack')return t<.20?mix(idle,wind,t/.20):t<.37?mix(wind,punch,(t-.20)/.17):t<.64?mix(punch,follow,(t-.37)/.27):mix(follow,idle,(t-.64)/.36);
 if(state==='hit')return t<.17?mix(idle,hurt,t/.17):mix(hurt,idle,(t-.17)/.83);
 if(state==='jump')return mix(rising,falling,t);
 if(state==='land')return t<.3?mix(idle,land,t/.3):mix(land,idle,(t-.3)/.7);
 if(state==='wind')return mix(idle,wind,t);
 if(state==='run')return [[10,-36-Math.abs(q)*5],[7,-23-Math.abs(q)*5],[0,7-Math.abs(q)*4],[-16-12*q,-9+5*r],[-23-21*q,-4+18*r],[16-12*q,-10-5*r],[22-21*q,-4-18*r],[-4+18*q,24-8*Math.max(0,-r)],[-32+38*q,46-23*Math.max(0,-r)],[4-18*q,24-8*Math.max(0,r)],[32-38*q,46-23*Math.max(0,r)]];
 if(state==='dance')return [[q*9,-40-Math.abs(r)*7],[q*6,-25],[-q*6,5],[-24,-29+r*9],[-38,-48+r*14],[24,-29-r*9],[38,-48-r*14],[-18-q*9,23],[-28-q*12,46-15*Math.max(q,0)],[18+q*9,23],[28+q*12,46-15*Math.max(-q,0)]];
 return idle.map(([x,y],i)=>[x,y+(i<7?Math.sin(f/N*TAU)*1.5:0)]);
}
function make(type,f){const c=cv(144,144),g=c.getContext('2d');g.translate(72,72);g.lineCap=g.lineJoin='round';const q=Math.sin(f/N*TAU), t=f/(N-1);
 const path=(pts,col,w=3,close=false,fill=null)=>{g.beginPath();pts.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));if(close)g.closePath();if(fill){g.fillStyle=fill;g.fill()}g.strokeStyle=col;g.lineWidth=w;g.stroke()};
 const ellipse=(x,y,rx,ry,col,w=3,fill=null)=>{g.beginPath();g.ellipse(x,y,rx,ry,0,0,TAU);if(fill){g.fillStyle=fill;g.fill()}g.strokeStyle=col;g.lineWidth=w;g.stroke()};
 const arc=(x,y,r,a,b,col,w=3)=>{g.beginPath();g.arc(x,y,r,a,b);g.strokeStyle=col;g.lineWidth=w;g.stroke()};
 const dot=(x,y,r,col)=>{g.fillStyle=col;g.beginPath();g.arc(x,y,r,0,TAU);g.fill()};
 const blue='#1767c4',navy='#194477',red='#dc3646',maroon='#8d2b3b',green='#198454',gold='#b47b07';
 if(type.startsWith('hero:')||type.startsWith('monster:')){const enemy=type.startsWith('monster:'),state=type.split(':')[1],p=pose(state,f),col=enemy?red:blue,back=enemy?maroon:navy;
   // Monster has a forward neck, claws, bent back, horns and an angular jaw.
   if(enemy){p[0][0]+=7;p[0][1]+=4;p[1][0]+=3;p[1][1]+=3;for(let i of [3,4,5,6])p[i][0]*=1.06;}
   const limb=(ids,k,w)=>path(ids.map(i=>p[i]),k,w);
   if(state==='attack'&&t>.20&&t<.67){const alpha=Math.sin((t-.20)/.47*Math.PI);for(let i=0;i<3;i++){const a=.12+(i*.07);g.globalAlpha=alpha*a;path([[p[1][0]+7,p[1][1]-2],[p[5][0]-i*6,p[5][1]-8-i*3],[p[6][0]-i*9,p[6][1]-9-i*4]],col,3)}g.globalAlpha=1;}
   limb([1,3,4],back,3.6);limb([2,7,8],back,4);limb([1,2],col,4.5);limb([2,9,10],col,4);limb([1,5,6],col,4);
   let hx=p[0][0],hy=p[0][1];path([p[1],[hx,hy+13]],col,3.8);
   if(enemy){path([[hx-13,hy-6],[hx-19,hy-24],[hx-5,hy-13]],col,3.3);path([[hx+7,hy-13],[hx+20,hy-24],[hx+16,hy-3]],col,3.3);path([[hx-15,hy-5],[hx-11,hy-14],[hx+8,hy-14],[hx+17,hy-4],[hx+12,hy+9],[hx+1,hy+15],[hx-13,hy+8]],col,3.7,true,'#fffdf5');path([[hx-9,hy-5],[hx-3,hy-2]],back,2.4);path([[hx+3,hy-2],[hx+10,hy-6]],back,2.4);path([[hx-3,hy+6],[hx+3,hy+9],[hx+10,hy+5]],back,2.4);for(let i of [4,6]){let [x,y]=p[i],sign=x>=p[1][0]?1:-1;for(let j=0;j<3;j++)path([[x,y],[x+sign*(6-j),y-5+j*5]],col,2.1)}}else{ellipse(hx,hy,13,14,col,3.7,'#fffdf5');dot(hx-4,hy-2,1.5,back);dot(hx+5,hy-2,1.5,back);arc(hx+1,hy+2,5,.18,Math.PI-.25,back,1.8);}
   for(let i of [8,10]){let [x,y]=p[i];path([[x-3,y],[x+6,y]],i===8?back:col,3.2)}
 }else if(type==='coin'){g.scale(.42+.58*Math.abs(Math.cos(f/N*TAU)),1);ellipse(0,0,31,39,gold,4,'#ffeeb0');ellipse(0,0,24,31,'#dfa51d',3);path([[0,-19],[0,19]],gold,5);path([[-14,-24],[-19,-14]],'#fffdf5',3);
 }else if(type==='flag'||type==='finish'){path([[-24,42],[-24,-44]],green,5);path([[-38,42],[-10,42]],green,3);let w=q*3;path([[-21,-43],[33,-29+w],[-21,-11]],green,4,true);if(type==='finish'){for(let i=0;i<3;i++)path([[-15+i*12,-34+i*2],[-10+i*12,-29+i*2]],green,5)}else path([[-11,-29],[-2,-22],[12,-35]],green,3.5);
 }else if(type.startsWith('car')){let col=type==='carR'?red:type==='carG'?green:blue;for(const x of [-28,21])for(const y of [-29,20])path([[x,y],[x+13,y],[x+13,y+10],[x,y+10]],'#334155',3,true);path([[-45,-21],[-20,-25],[23,-24],[43,-15],[43,15],[23,24],[-20,25],[-45,21]],col,4.5,true);path([[-9,-18],[12,-17],[22,0],[12,17],[-9,18],[-15,0]],col,3,true);path([[-35,-17],[-35,17]],col,3.5);path([[33,-11],[42,-11]],col,3);path([[33,11],[42,11]],col,3);path([[-30,0],[-20,0]],col,2.8);
 }else if(type==='ship'){path([[0,-51],[17,-12],[42,29],[15,18],[0,32],[-15,18],[-42,29],[-17,-12]],blue,4.5,true);path([[0,-34],[9,-8],[0,4],[-9,-8]],blue,3,true);for(let s of [-1,1])path([[s*14,11],[s*29,19]],navy,3);path([[-7,30],[0,46+q*9],[7,30]],gold,3);
 }else if(type==='ufo'){ellipse(0,9,46,18,red,4);arc(0,-3,24,Math.PI,TAU,red,4);path([[-24,-3],[24,-3]],red,3);for(let x of [-26,0,26]){ellipse(x,9,4,4,maroon,2.5);if(Math.abs(q)>.5)dot(x,9,2.2,red)}}
 else if(type==='ball'){ellipse(0,0,39,39,blue,4,'#f3fbff');g.save();g.rotate(f/N*TAU);arc(0,0,26,-1.2,.1,navy,3);arc(0,0,26,2.2,3.1,blue,3);g.restore();}
 else if(type==='bumper'||type==='target'){let col=type==='bumper'?red:green;ellipse(0,0,42,42,col,4);ellipse(0,0,27,27,col,3);if(type==='target'){path([[-12,0],[-3,10],[16,-12]],col,4)}else for(let i=0;i<8;i++){let a=i*TAU/8;path([[Math.cos(a)*31,Math.sin(a)*31],[Math.cos(a)*38,Math.sin(a)*38]],col,3)}}
 else if(type==='cone'){path([[0,-41],[29,29],[-29,29]],red,4,true);path([[-12,-6],[12,-6]],red,3);path([[-18,10],[18,10]],red,3);path([[-38,31],[38,31]],red,5)}
 return c;
}
function paint(o,type,frame=0,angle=0,face=1){frame=Math.max(0,Math.min(N-1,frame|0));const k=type+':'+frame;let c=cache.get(k);if(!c){c=make(type,frame);cache.set(k,c)}g.save();g.translate(o.x,o.y);g.rotate(angle||0);g.scale(face||1,1);if(/^(hero|monster):/.test(type)){let scale=o.h*.96/108;g.drawImage(c,-72*scale,-(72+3)*scale,144*scale,144*scale)}else{let w=o.w*1.6,h=o.h*1.6;g.drawImage(c,-w/2,-h/2,w,h)}g.restore()}
const phase=(t)=>Math.floor(Math.max(0,t)*N)%N, progress=t=>Math.round(clamp(t,0,1)*(N-1));
window.prewarmDefaultSprites=function(mode){const types=mode===0?['hero:idle','hero:run','hero:jump','hero:attack','hero:hit','hero:land','hero:dance','monster:run','monster:idle','monster:wind','monster:attack','coin','flag']:
 mode===1?['hero:idle','hero:run','hero:hit','hero:dance','monster:run','monster:idle','monster:wind','monster:attack','coin','flag']:
 mode===2?['carB','carG','carR','cone','coin','finish']:
 mode===3?['ship','ufo','coin','flag']:mode===4?['ball','bumper','target','coin']:[];
 for(const type of types)for(let frame=0;frame<(type==='coin'||type==='ship'||type==='ufo'||type==='ball'||type.includes(':')?N:1);frame++){
  const key=type+':'+frame;if(!cache.has(key))cache.set(key,make(type,frame));
 }
};
window.drawDefaultSprite=(o,angle=0)=>{const a=game,M=a.mode,p=o===a.p,t=a.t;let frame=phase(t*1.5+(o.phase||0)),type,face=1;if(o.v===5){type='coin';frame=phase(t*.75)}else if(o.v===4){type=M===4?'target':M===2?'finish':'flag';frame=0}else if(p){if(M===2){type='carB';frame=0}else if(M===3){type='ship';frame=phase(t*5);angle=clamp((o.vx||0)/600,-.32,.32)}else if(M===4){type='ball';frame=phase(t*Math.min(3,Math.hypot(o.vx||0,o.vy||0)/80))}else{let state=a.inv>1.12?'hit':a.attack>0?'attack':M===0&&!a.ground?'jump':M===0&&a.landLock>.03?'land':Math.hypot(o.vx||0,o.vy||0)>25?'run':'idle';type='hero:'+state;face=a.attack>0?(a.attackDir||a.facing):a.facing;if(state==='attack')frame=progress(1-a.attack/.30);else if(state==='hit')frame=progress((1.4-a.inv)/.28);else if(state==='jump')frame=progress(.5+(o.vy||0)/1000);else if(state==='land')frame=progress(1-a.landLock/.20);else if(state==='idle')frame=phase(t*.55)}}else{if(M===3)type='ufo';else if(M===4)type='bumper';else if(M===2)type='cone';else{let state=o.strike>0?'attack':o.wind>0?'wind':o.recover>0?'idle':'run';type='monster:'+state;face=o.face||1;if(state==='attack')frame=progress(.37+.63*(1-o.strike/.23));else if(state==='wind')frame=progress(1-o.wind/.36);else if(state==='idle')frame=0}if(M===2||M===4)frame=0}paint(o,type,frame,angle,face)};
window.drawDefaultWin=(x,y)=>paint({x,y,w:65,h:85},'hero:dance',phase(performance.now()/530));window.drawRivalSprite=(o,i)=>paint(o,i?'carG':'carR',0,o.angle);
// No eager sprite generation on page load. Only the selected genre's sprites
// are prepared once during the build step, before the first gameplay frame.
})();
