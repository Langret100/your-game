'use strict';
// All enhancements stay on-device. No persistence or network calls.
(()=>{
const oldStart=start,oldUpdate=update,oldDraw=draw,oldFinish=finish;
let gridCache=new Map();
function navigation(a,target,body){const step=20,nx=Math.ceil(W/step),ny=Math.ceil(H/step),n=nx*ny,dist=new Int32Array(n).fill(-1),pass=new Uint8Array(n),q=new Int32Array(n);const xy=i=>({x:Math.min(W-15,i%nx*step+10),y:Math.min(H-15,Math.floor(i/nx)*step+10)}),idx=p=>clamp(Math.floor(p.y/step),0,ny-1)*nx+clamp(Math.floor(p.x/step),0,nx-1);let cacheKey=nx+'x'+ny+':'+body.w+':'+body.h;
 let cached=gridCache.get(cacheKey);
 if(!cached){for(let i=0;i<n;i++){let p=xy(i);pass[i]=!blocked(body,p.x,p.y)}cached=pass;gridCache.set(cacheKey,cached)}
 else pass.set(cached);let seed=idx(target);if(!pass[seed]){let best=Infinity;for(let i=0;i<n;i++)if(pass[i]){let p=xy(i),d=Math.hypot(p.x-target.x,p.y-target.y);if(d<best){seed=i;best=d}}}if(!pass[seed])return null;let h=0,t=1;q[0]=seed;dist[seed]=0;function adjacent(i){return [i%nx?i-1:-1,i%nx<nx-1?i+1:-1,i>=nx?i-nx:-1,i<n-nx?i+nx:-1]}while(h<t){let i=q[h++];for(let j of adjacent(i))if(j>=0&&pass[j]&&dist[j]<0){dist[j]=dist[i]+1;q[t++]=j}}return {reachable:p=>dist[idx(p)]>=0,next:p=>{let i=idx(p),best=i;for(let j of adjacent(i))if(j>=0&&dist[j]>=0&&(dist[best]<0||dist[j]<dist[best]))best=j;return best===i?target:xy(best)}}}
start=function(mode,art){gridCache.clear();oldStart(mode,art);let a=game;a.background=$('paperPanel').hidden?window.getBackground?.():null;a.hostile=[];a.navTimer=0;a.shake=0;a.lastLife=a.life;a.lastScore=0;a.jumpPower=470;a.rivals=[];a.adjusted=false;
if(mode===0){let heights=[];for(let x=12;x<W;x+=24){for(let y=12;y<H-1;y++){if(solid(x,y)&&!solid(x,y-1)&&!solid(x,y-8)){heights.push({x,y});break}}}let diff=0;for(let i=1;i<heights.length;i++)if(heights[i].x-heights[i-1].x<200)diff=Math.max(diff,Math.abs(heights[i].y-heights[i-1].y));a.jumpPower=clamp(Math.sqrt(2*1050*(diff+52)),470,760);if(a.jumpPower>480)a.adjusted=true}
if(mode===1||mode===2){let route=navigation(a,a.goals[0],a.p);
  if(mode===1&&!route?.reachable(a.p)){
    // Keep maze playable without editing the child's image: relocate ONLY the
    // logical exit marker to a reachable cell as close as possible to the drawing.
    const reachable=navigation(a,a.p,a.p),goal=a.goals[0];
    let choice=null,best=Infinity;
    for(let y=24;y<H-24;y+=16)for(let x=24;x<W-24;x+=16){
      const here={x,y,w:goal.w,h:goal.h};
      if(!reachable?.reachable(here)||blocked(here,x,y))continue;
      const away=Math.hypot(x-a.p.x,y-a.p.y);
      if(away<Math.min(95,W*.14))continue;
      const cost=Math.hypot(x-goal.x,y-goal.y)+Math.max(0,180-away)*.8;
      if(cost<best){best=cost;choice={x,y}}
    }
    if(choice){goal.x=choice.x;goal.y=choice.y;a.adjustedGoal=true;route=navigation(a,goal,a.p)}
  }
  if(!route?.reachable(a.p)){$('status').textContent='길이 막혀 있을 수 있어요 · 그림 수정 가능'}
  else if(a.adjustedGoal)$('status').textContent='나갈 수 있는 곳으로 출구 자동 보정!';if(mode===2&&route?.reachable(a.p)){a.route=route;for(let i=0;i<2;i++){let r={...a.p,x:a.p.x+12*(i+1),y:a.p.y+20*(i+1),w:24,h:24,angle:0,done:false};if(!blocked(r,r.x,r.y))a.rivals.push(r)}}}
// Pre-generate frequently used poses while the game is still preparing,
// rather than stalling the first seconds of actual play.
window.prewarmActors?.(a);
window.prewarmDefaultSprites?.(a.mode);
if(a.adjusted)$('status').textContent='발판 높이에 맞춰 점프 보정!';};
update=function(dt){let a=game,p=a.p;if(a.mode===1){const tile=Math.floor(p.x/20)+Math.floor(p.y/20)*Math.ceil(W/20);a.navTimer-=dt;
 // The collision map never changes during play. Recalculate BFS only when
 // the player changes navigation cells, not every 350 ms while stationary.
 if(!a.navTarget||(a.navCell!==tile&&a.navTimer<=0)){a.navCell=tile;let nav=navigation(a,p,a.enemies[0]||p);a.navTarget=e=>nav?.next(e)||p;a.navTimer=.30}}if(a.mode===0&&a.ground&&Math.abs(p.vx)>90&&Math.floor(a.t*12)!==Math.floor((a.t+dt)*12)){a.fx.push({x:p.x,y:p.y+p.h*.4,vx:-p.vx*.3,vy:-18,t:.25,color:'#b9a78b'})}oldUpdate(dt);if(a.finished)return;let M=a.mode;if(a.life<a.lastLife){a.shake=.18;a.lastLife=a.life}if(a.score>a.lastScore){if(a.score-a.lastScore>=100)a.shake=.10;a.lastScore=a.score}a.shake=Math.max(0,a.shake-dt);
if(M===3){for(let e of a.enemies){if(e.dead)continue;e.fire=(e.fire??(1.2+e.phase%2))-dt;if(e.fire<=0){e.fire=1.5+e.phase%1.4;let dx=p.x-e.x,dy=p.y-e.y,d=Math.hypot(dx,dy)||1;a.hostile.push({x:e.x,y:e.y,vx:dx/d*145,vy:dy/d*145});}}for(let b of a.hostile){b.x+=b.vx*dt;b.y+=b.vy*dt;if(Math.hypot(b.x-p.x,b.y-p.y)<14){b.dead=true;hit()}}a.hostile=a.hostile.filter(b=>!b.dead&&b.x>=0&&b.x<W&&b.y>=0&&b.y<H&&!solid(b.x,b.y));}
if(M===2&&a.route){for(let r of a.rivals){if(r.done)continue;let q=a.route.next(r),dx=q.x-r.x,dy=q.y-r.y,d=Math.hypot(dx,dy)||1;r.angle=Math.atan2(dy,dx);move(r,dx/d*105*dt,dy/d*105*dt);if(near(r,a.goals[0])){r.done=true;a.rivalTime=a.rivalTime||a.t}}}
if(M===4){for(let k=0;k<2;k++){let x1=W*(k?.82:.18),y1=H-50,x2=W*(k?.51:.49),y2=flipperY(k),dx=x2-x1,dy=y2-y1,len=dx*dx+dy*dy,t=clamp(((p.x-x1)*dx+(p.y-y1)*dy)/len,0,1),x=x1+t*dx,y=y1+t*dy,dist=Math.hypot(p.x-x,p.y-y);if(dist<18&&p.y<=y+8&&(p.vy>0||(a.flippers?.[k]?.vel||0)>0)){p.y=y-19;p.vy=-Math.max(150,Math.abs(p.vy)*.75,Math.max(0,a.flippers?.[k]?.vel||0)*105);p.vx+=(k?-1:1)*65;impact('flipper',x,y,k?-1:1,-1,.85);}}}
};
draw=function(){oldDraw();if(!game)return;let a=game;if(a.finished){if(a.won&&a.mode<2&&!window.drawSceneWin(W/2,H*.75))window.drawDefaultWin(W/2,H*.75);return;}g.save();if(a.mode===3){g.fillStyle='#e94343';for(let b of a.hostile||[]){g.beginPath();g.arc(b.x,b.y,5,0,7);g.fill()}}if(a.mode===2){for(let i=0;i<(a.rivals||[]).length;i++){let r=a.rivals[i];window.drawRivalSprite(r,i)}if(a.rivalTime){g.fillStyle='#263b59';g.font='bold 15px sans-serif';g.textAlign='left';g.fillText('경쟁자 도착 '+a.rivalTime.toFixed(1)+'초',12,25)}}if(a.shake>0){g.strokeStyle=`rgba(233,67,67,${a.shake*1.5})`;g.lineWidth=7;g.strokeRect(0,0,W,H)}g.restore()};
finish=function(msg){if(!game||game.finished)return;if(game?.mode===2&&msg.startsWith('성공'))msg=game.rivalTime?'완주 성공! 다음엔 1등에 도전!':'1등! 내 그림 경주 성공!';game.won=/성공|클리어|1등/.test(msg);game.winAt=performance.now();oldFinish(msg);};
// Reuse the existing game RAF, rather than running a second RAF forever.
let lastWin=0;window.refreshVictoryFrame=t=>{
 if(game?.finished&&game.won&&game.mode<2&&t-(game.winAt||0)<5000&&!C.hidden&&!document.hidden&&t-lastWin>33){lastWin=t;return true}
 return false;
};})();
