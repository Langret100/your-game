'use strict';
// First-play identity helper: labels follow the actual controlled actor.
// Lightweight Canvas-only overlay. Nothing is stored or sent.
(()=>{
  const previousDraw=draw;
  const duration=3.7;
  const hints=['내 캐릭터','내 캐릭터','내 자동차','내 비행기','내 공'];
  function roundBox(ctx,x,y,w,h,r){
    r=Math.min(r,w/2,h/2);
    ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);
    ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
  }
  function bubble(actor,label,tone,headroom=0){
    if(!actor||!Number.isFinite(actor.x)||!Number.isFinite(actor.y))return;
    const time=game?.t||0;
    const alpha=time>2.75?Math.max(0,(duration-time)/.95):1;
    if(alpha<=0)return;
    const rect=C.getBoundingClientRect();
    // Draw at a readable physical size even when a landscape canvas is reduced on a portrait phone.
    const scale=Math.max(.15,Math.min(rect.width/W,rect.height/H));
    const fs=Math.round(clamp(17/scale,18,64));
    const ctx=g, pad=13, h=fs+17;
    ctx.save();ctx.font=`bold ${fs}px system-ui, sans-serif`;
    let w=Math.ceil(ctx.measureText(label).width)+pad*2;
    w=Math.min(w,W-20);
    const x=clamp(actor.x-w/2,10,Math.max(10,W-w-10));
    const targetAbove=actor.y-(headroom||Math.max(18,(actor.h||40)*.68));
    const above=targetAbove-h-35>8;
    const float=Math.sin(time*6)*3;
    const y=above?clamp(targetAbove-h-29+float,8,H-h-8):clamp(actor.y+Math.max(20,(actor.h||40)*.7)+29+float,8,H-h-8);
    const originX=clamp(actor.x,x+10,x+w-10);
    const originY=above?y+h:y;
    const targetY=above?targetAbove-6:actor.y+Math.max(20,(actor.h||40)*.65)+5;
    ctx.globalAlpha=alpha;
    // Connector and arrow deliberately point to the moving actor, not its start position.
    ctx.strokeStyle=tone;ctx.lineWidth=Math.max(3,fs*.11);ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(originX,originY);ctx.lineTo(actor.x,targetY);ctx.stroke();
    ctx.fillStyle=tone;ctx.beginPath();
    if(above){ctx.moveTo(actor.x,targetY+fs*.18);ctx.lineTo(actor.x-fs*.22,targetY-fs*.2);ctx.lineTo(actor.x+fs*.22,targetY-fs*.2)}
    else {ctx.moveTo(actor.x,targetY-fs*.18);ctx.lineTo(actor.x-fs*.22,targetY+fs*.2);ctx.lineTo(actor.x+fs*.22,targetY+fs*.2)}
    ctx.closePath();ctx.fill();
    ctx.shadowColor='rgba(9,30,48,.18)';ctx.shadowBlur=11;ctx.shadowOffsetY=3;
    ctx.fillStyle='#fffefa';roundBox(ctx,x,y,w,h,11);ctx.fill();
    ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    ctx.strokeStyle=tone;ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle=tone;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(label,x+w/2,y+h/2+1);
    ctx.restore();
  }
  draw=function(){
    previousDraw();
    const a=game;
    if(!a||a.finished||a.t>=duration||!C||C.hidden)return;
    if(a.mode===5){
      if(a.paddles?.length===2){
        bubble(a.paddles[0],'1P · 파랑 (W/S)','#246ad6',a.paddles[0].h/2+7);
        bubble(a.paddles[1],'2P · 빨강 (↑/↓)','#d34350',a.paddles[1].h/2+7);
      }
    }else{
      bubble(a.p,hints[a.mode]||'내 캐릭터','#246ad6');
    }
  };
})();
