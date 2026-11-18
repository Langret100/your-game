'use strict';
// Deterministic-feeling scrolling shooter. The child's enemy and obstacle ink
// is converted to reusable sprites ONCE on start; the running game only moves
// sprites and tests precomputed, coarse alpha masks. No networking / uploads.
(()=>{
 const previousStart=start,previousUpdate=update;
 const between=(n,min,max)=>Math.max(min,Math.min(max,n));
 const collide=(p,o)=>Math.abs(p.x-o.x)<(p.w+o.w)*.43&&Math.abs(p.y-o.y)<(p.h+o.h)*.43;
 function obstacleTemplates(a){
  const components=comps(a.m,W,H,1,60).sort((q,r)=>r.n-q.n);
  let result=[];
  for(const c of components){
   const bw=c.x1-c.x0+1,bh=c.y1-c.y0+1;
   if(bw<8||bh<2||bw>W*.90&&bh>H*.55)continue;
   const w=between(bw,24,Math.max(28,W*.27)),h=between(bh,12,Math.max(22,H*.16));
   const im=cv(Math.round(w),Math.round(h));
   im.getContext('2d').drawImage(a.terrain,c.x0,c.y0,bw,bh,0,0,im.width,im.height);
   const rgba=im.getContext('2d',{willReadFrequently:true}).getImageData(0,0,im.width,im.height).data;
   const sw=30,sh=20,mask=new Uint8Array(sw*sh);
   for(let j=0;j<sh;j++)for(let i=0;i<sw;i++){
     // alpha mask precomputed once; collision sampling never calls getImageData
     const px=between(Math.round((i+.5)*im.width/sw),0,im.width-1),py=between(Math.round((j+.5)*im.height/sh),0,im.height-1);
     mask[j*sw+i]=rgba[(py*im.width+px)*4+3]>65?1:0;
   }
   result.push({im,w,h,mask,sw,sh,x:c.x0+bw/2});
   if(result.length>=14)break;
  }
  // Sparse drawings can intentionally omit obstacles; still give the shooter
  // a recognisable lightweight moving hazard rather than a stationary arena.
  if(result.length===0){
    const im=cv(76,16),ctx=im.getContext('2d');
    ctx.strokeStyle='#333';ctx.lineWidth=5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(4,8);ctx.lineTo(72,8);ctx.stroke();
    result.push({im,w:76,h:16,mask:new Uint8Array(30*20).fill(1),sw:30,sh:20,x:W*.5});
  }
  return result;
 }
 function enemySpawn(a){
   const s=a.shooter,models=s.enemyTemplates;
   if(!models.length)return;
   const template=models[s.enemyIndex%models.length];
   const n=s.enemyIndex++,targetX=template.x||W*.5;
   const lane=between(targetX+(n%3-1)*W*.07,Math.max(18,template.w/2),W-Math.max(18,template.w/2));
   a.enemies.push({...template,x:lane,y:-template.h-12,base:lane,phase:n*1.31,dead:false,cool:0,fire:2.0+(n%3)*.6,
     scrollSpeed:96+Math.min(90,a.t*1.25)+(n%3)*13,vx:0,vy:0,face:1,wind:0,strike:0,recover:0,lightMotion:n>4});
 }
 function obstacleSpawn(a){
   const s=a.shooter,models=s.obstacleTemplates;
   if(!models.length)return;
   const n=s.obstacleIndex++,proto=models[n%models.length];
   const x=between(proto.x+(n%3-1)*W*.16,proto.w/2+5,W-proto.w/2-5);
   a.obstacles.push({...proto,x,y:-proto.h-10,dead:false,speed:115+Math.min(90,a.t*1.7)});
 }
 function obstacleHit(o,x,y){
   const u=(x-o.x+o.w/2)/o.w,v=(y-o.y+o.h/2)/o.h;
   if(u<0||u>=1||v<0||v>=1)return false;
   const i=between(Math.floor(u*o.sw),0,o.sw-1),j=between(Math.floor(v*o.sh),0,o.sh-1);
   return o.mask[j*o.sw+i]===1;
 }
 window.shooterBulletHit=(a,b)=>{
  if(a.mode!==3||!a.shooter)return false;
  for(const o of a.obstacles){if(o.dead)continue;
   if(obstacleHit(o,b.x,b.y-7)){o.dead=true;impact('shotHit',b.x,b.y,0,-1,.6);return true}
  }
  return false;
 };
 start=function(mode,art){
  previousStart(mode,art);
  const a=game;if(mode!==3||!a)return;
  const terrain=a.terrain;
  a.shooter={enemyTemplates:a.enemies.slice(),obstacleTemplates:obstacleTemplates(a),enemyIndex:0,obstacleIndex:0,
    enemyDelay:.30,obstacleDelay:1.65,scroll:0};
  a.obstacles=[];a.enemies=[];
  // The drawn black marks are recurring HAZARDS, no longer static invisible
  // blocking walls. Collision is performed against their visible sprites.
  a.m.fill(0);a.solidIndex=buildSolidIndex(a.m);
  a.terrain=terrain;a.goals=[];
  a.p.x=between(a.p.x,Math.max(15,a.p.w/2),W-Math.max(15,a.p.w/2));
  a.p.y=between(a.p.y,H*.61,H-Math.max(24,a.p.h/2));
  a.p.vx=0;a.p.vy=0;a.p.sx=a.p.x;a.p.sy=a.p.y;
  $('controls').textContent='화면 아래에서 이동 · 자동 발사 · 적과 장애물이 위에서 반복 등장';
 };
 update=function(dt){
  let a=game;
  if(a&&a.mode===3&&a.shooter&&!a.finished){
   const s=a.shooter;
   s.scroll=(s.scroll+dt*135*(a.motionScaleY||1))%H;
   s.enemyDelay-=dt;s.obstacleDelay-=dt;
   if(s.enemyDelay<=0){s.enemyDelay+=between(1.1-a.t*.009,.55,1.1);enemySpawn(a)}
   if(s.obstacleDelay<=0){s.obstacleDelay+=between(2.9-a.t*.012,1.5,2.9);obstacleSpawn(a)}
   for(const e of a.enemies){e.y+=e.scrollSpeed*(a.motionScaleY||1)*dt;e.x=between(e.base+Math.sin(a.t*1.5+e.phase)*23,e.w/2+4,W-e.w/2-4);
     e.face=Math.sin(a.t*1.5+e.phase)>0?1:-1;
     if(e.y>H+e.h)e.dead=true;
   }
   for(const o of a.obstacles){o.y+=o.speed*(a.motionScaleY||1)*dt;if(o.y>H+o.h)o.dead=true}
   // Keep active actors bounded, including sustained 45-second events.
   if(a.enemies.length>22)a.enemies=a.enemies.filter(e=>!e.dead).slice(-22);
   if(a.obstacles.length>12)a.obstacles=a.obstacles.filter(o=>!o.dead).slice(-12);
  }
  previousUpdate(dt);
  a=game;
  if(a&&a.mode===3&&a.shooter&&!a.finished){
   for(const o of a.obstacles)if(!o.dead&&collide(a.p,o)){
     const p=a.p,positions=[[p.x,p.y],[p.x-p.w*.28,p.y-p.h*.18],[p.x+p.w*.28,p.y-p.h*.18],
       [p.x-p.w*.28,p.y+p.h*.18],[p.x+p.w*.28,p.y+p.h*.18]];
     if(positions.some(([x,y])=>obstacleHit(o,x,y))){o.dead=true;impact('crash',p.x,p.y,0,-1,.7);hit('obstacle');break}
   }
   a.enemies=a.enemies.filter(e=>!e.dead);
   a.obstacles=a.obstacles.filter(o=>!o.dead);
  }
 };
 window.drawShooterBackdrop=a=>{
  const s=a.shooter;if(!s)return;
  // Scrolling speed streaks are decorative and inexpensive; the actual
  // obstacles are drawn at their collision-aligned positions.
  g.save();g.fillStyle='rgba(38,111,124,.12)';
  for(let i=0;i<21;i++){
    const x=(i*139+43)%W,y=(i*81+s.scroll*(.6+(i%3)*.17))%H;
    g.fillRect(x,y,1.8,10+(i%4)*9);
  }
  for(const o of a.obstacles)if(!o.dead){g.drawImage(o.im,o.x-o.w/2,o.y-o.h/2,o.w,o.h)}
  g.restore();
 };
})();
