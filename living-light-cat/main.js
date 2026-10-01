import {CatRig2D} from './rig.js';
import {IdleBehaviorController} from './behavior-controller.js';
import {layoutForViewport} from './constraints.js';
import {buildTailRibbon} from './tail-spline.js';
import {buildBodySilhouette,buildWhiskers} from './silhouette-rebuilder.js';
import {mountTuner} from './tuner.js';

const canvas=document.getElementById('c');
const ctx=canvas.getContext('2d');
const rig=new CatRig2D();
const behavior=new IdleBehaviorController();
const params=new URLSearchParams(location.search);
const qa=params.get('qa');
const debug=params.get('debug')==='1';
let W=0,H=0,D=1,start=performance.now(),reaction=0;

function resize(){
  D=Math.min(2,devicePixelRatio||1); W=innerWidth; H=innerHeight;
  canvas.width=Math.round(W*D); canvas.height=Math.round(H*D);
  ctx.setTransform(D,0,0,D,0,0);
}
addEventListener('resize',resize,{passive:true}); resize();

function qaPose(name){
  const base={breath:0,headTurn:0,headTilt:0,tailSwing:0,tailCurl:.2,tailPhase:0,earTwitch:0};
  if(name==='head-left') return {...base,headTurn:-.22};
  if(name==='head-right') return {...base,headTurn:.22};
  if(name==='tail-left') return {...base,tailSwing:-1,tailPhase:1.3};
  if(name==='tail-right') return {...base,tailSwing:1,tailPhase:2.1};
  return base;
}

function glowStroke(path,strong=true){
  const passes=strong?
    [[24,'rgba(255,112,18,.07)',28],[10,'rgba(255,155,42,.18)',18],[4,'rgba(255,204,112,.72)',10],[1.35,'rgba(255,248,221,.98)',4]]:
    [[7,'rgba(255,155,42,.08)',10],[1.1,'rgba(255,213,145,.56)',4]];
  ctx.lineCap='round'; ctx.lineJoin='round'; ctx.globalCompositeOperation='lighter';
  for(const [width,color,blur] of passes){
    ctx.lineWidth=width; ctx.strokeStyle=color; ctx.shadowColor='rgba(255,180,72,.95)'; ctx.shadowBlur=blur; ctx.stroke(path);
  }
  ctx.globalCompositeOperation='source-over'; ctx.shadowBlur=0;
}

function render(now){
  const t=(now-start)/1000;
  if(qa) rig.setPose(qaPose(qa));
  else if(!debug){
    const pose=behavior.sample(t);
    if(now-reaction<900){
      const k=1-(now-reaction)/900;
      pose.headTurn+=0.055*k; pose.tailSwing=Math.max(-1,Math.min(1,pose.tailSwing+.28*k));
    }
    rig.setPose(pose);
  }

  ctx.clearRect(0,0,W,H);
  const layout=layoutForViewport(W,H);
  ctx.save();
  ctx.translate(layout.cx,layout.cy); ctx.scale(layout.scale*.92,layout.scale*.92);

  const tail=buildTailRibbon(rig).path;
  ctx.fillStyle='#000'; ctx.fill(tail); glowStroke(tail,true);

  const body=buildBodySilhouette(rig);
  ctx.fillStyle='#000'; ctx.fill(body);
  // Refill after tail glow so the attachment disappears naturally into the rump.
  ctx.fill(body); glowStroke(body,true);

  const whiskers=buildWhiskers(rig);
  whiskers.forEach(w=>glowStroke(w,false));
  ctx.restore();

  window.__LIVING_LIGHT_CAT__={ready:true,pose:{...rig.pose},viewport:{width:W,height:H},qa:qa||null};
  requestAnimationFrame(render);
}

addEventListener('pointerdown',()=>{reaction=performance.now()},{passive:true});
mountTuner(rig);
requestAnimationFrame(render);