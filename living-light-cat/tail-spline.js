function catmull(p0,p1,p2,p3,t){
  const t2=t*t,t3=t2*t;
  return {
    x:0.5*((2*p1.x)+(-p0.x+p2.x)*t+(2*p0.x-5*p1.x+4*p2.x-p3.x)*t2+(-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
    y:0.5*((2*p1.y)+(-p0.y+p2.y)*t+(2*p0.y-5*p1.y+4*p2.y-p3.y)*t2+(-p0.y+3*p1.y-3*p2.y+p3.y)*t3)
  };
}

function sampleSpline(points,steps=10){
  const out=[];
  const pts=[points[0],...points,points[points.length-1]];
  for(let i=1;i<pts.length-2;i++){
    for(let j=0;j<steps;j++) out.push(catmull(pts[i-1],pts[i],pts[i+1],pts[i+2],j/steps));
  }
  out.push(points[points.length-1]);
  return out;
}

export function buildTailRibbon(rig){
  const p=rig.pose, sw=p.tailSwing, curl=p.tailCurl;
  const base=rig.tailBase;
  const controls=[
    {x:base.x,y:base.y},
    {x:-28+sw*5,y:248+sw*4},
    {x:58+sw*14,y:252+sw*10},
    {x:154+sw*28,y:232+sw*18},
    {x:230+sw*40,y:236+sw*30-curl*8},
    {x:267+sw*46,y:278+sw*38-curl*18},
    {x:230+sw*40,y:319+sw*30-curl*22},
    {x:145+sw*26,y:334+sw*20-curl*16},
    {x:57+sw*13,y:319+sw*10-curl*8},
    {x:-18+sw*6,y:286+sw*4}
  ];

  controls.forEach((q,i)=>{
    const u=i/(controls.length-1);
    q.y+=Math.sin(p.tailPhase*1.18-u*1.15)*u*13;
    q.x+=Math.cos(p.tailPhase*.82-u*.9)*u*5;
  });

  const center=sampleSpline(controls,11);
  const left=[],right=[];
  for(let i=0;i<center.length;i++){
    const prev=center[Math.max(0,i-1)], next=center[Math.min(center.length-1,i+1)];
    const dx=next.x-prev.x,dy=next.y-prev.y;
    const len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
    const u=i/(center.length-1);
    const width=18*(1-u)+7*u;
    left.push({x:center[i].x+nx*width,y:center[i].y+ny*width});
    right.push({x:center[i].x-nx*width,y:center[i].y-ny*width});
  }
  const path=new Path2D();
  path.moveTo(left[0].x,left[0].y);
  for(let i=1;i<left.length;i++) path.lineTo(left[i].x,left[i].y);
  for(let i=right.length-1;i>=0;i--) path.lineTo(right[i].x,right[i].y);
  path.closePath();
  return {path,center};
}