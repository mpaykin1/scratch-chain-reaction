import * as THREE from './vendor/three-r160/three.module.min.js';
import {createNprContext} from './shared/living-ink-webgl-npr.mjs';
import {createLivingWatercolor3D,createWatercolorStyle} from '../living-watercolor-3d/living-watercolor-3d.js';
import {analyzeGraphicsQuality} from '../graphics-quality-governor/graphics-quality-governor.mjs';
import {TrinitySceneRecipe,REQUIRED_SEMANTIC_IDS,sameRecipeEvidence} from './scene-recipe.mjs';
import {
  buildStaticScene,createCubeEvolution,disposeRoot,animateScene,
  buildGovernorDescriptor,compileTrinity,semanticIdsOf
} from './scene-builder.mjs';

const canvas=document.getElementById('gl');
const ctx=createNprContext(canvas);
const {renderer,scene,camera}=ctx;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
window.renderer=renderer;
window.camera=camera;

const ui={
  buttons:[...document.querySelectorAll('[data-mode]')],
  debugButton:document.getElementById('debugButton'),
  debug:document.getElementById('debug'),
  grid:document.getElementById('debugGrid'),
  label:document.getElementById('modeLabel'),
  stage:document.getElementById('stage')
};let mode='KRIEGER',sceneState=null,cubeRun=null,cubeStarted=0,watercolor=null;
let yaw=3.72,pitch=-.20,inkEntryPose=null,inkStyleMoved=false;
const keys=Object.create(null),pointers=new Map(),move={x:0,y:0};
const observations={ink:false,growth:false,determinism:false,viewport:false};
const frameTimes=[];
let lastFrame=performance.now(),frames=0,startAt=lastFrame,lastDebug=0;

function poseCamera(){
  const cp=Math.cos(pitch);
  const dir=new THREE.Vector3(Math.sin(yaw)*cp,Math.sin(pitch),Math.cos(yaw)*cp);
  camera.lookAt(camera.position.clone().add(dir));
}
function resetCamera(){
  const portrait=innerWidth<innerHeight;
  if(portrait){camera.position.set(10.8,6.4,17);yaw=3.71;pitch=-.24;camera.fov=62;}
  else{camera.position.set(8.5,5.5,13.5);yaw=3.70;pitch=-.23;camera.fov=50;}
  camera.updateProjectionMatrix();poseCamera();
}
function setEnvironment(next){
  if(next==='INK'){
    scene.background=new THREE.Color(0xf6f1e7);scene.fog=new THREE.FogExp2(0xf6f1e7,.018);
    renderer.setClearColor(0xf6f1e7,1);
  }else if(next==='CUBE'){
    scene.background=new THREE.Color(0x15191c);scene.fog=new THREE.FogExp2(0x15191c,.025);
    renderer.setClearColor(0x15191c,1);
  }else{
    scene.background=new THREE.Color(0x111820);scene.fog=new THREE.FogExp2(0x111820,.027);
    renderer.setClearColor(0x111820,1);
  }
}function clearSceneState(){
  watercolor?.dispose?.();watercolor=null;
  if(sceneState?.root)disposeRoot(sceneState.root);
  if(cubeRun?.root&&cubeRun.root!==sceneState?.root)disposeRoot(cubeRun.root);
  sceneState=null;cubeRun=null;ui.stage.textContent='';
}
function enterInk(){
  sceneState=buildStaticScene(ctx,TrinitySceneRecipe,'INK');
  const style=createWatercolorStyle({
    seed:TrinitySceneRecipe.seed,inkColor:'#334a63',paperColor:'#f6f1e7',washColor:'#91a0ad',
    washOpacity:.62,washLayers:7,edgeWidth:.032,edgeJitter:.22,granulation:.34,
    bleed:.20,shadowWash:.12,pigmentPooling:.28,paperGap:.15,paintedLight:.52
  });
  watercolor=createLivingWatercolor3D({THREE,renderer,scene,camera,style,autoQuality:false});
  watercolor.apply(sceneState.root,{seed:TrinitySceneRecipe.seed});
  watercolor.addGroundWash(sceneState.root,{x:0,z:0,width:13,depth:11,opacity:.065,seed:TrinitySceneRecipe.seed+':ground'});
  watercolor.attachCompositor({replaceSource:true});
  const d=watercolor.diagnostics();observations.ink=d.materials>0&&d.outlines>0&&sceneState.semanticInk>=2;
  inkEntryPose={x:camera.position.x,z:camera.position.z,yaw,pitch};inkStyleMoved=false;
}
function enterKrieger(){sceneState=buildStaticScene(ctx,TrinitySceneRecipe,'KRIEGER');}
function enterCube(){
  cubeRun=createCubeEvolution(ctx,TrinitySceneRecipe);sceneState={root:cubeRun.root,semanticIds:['seed:cube']};
  cubeStarted=performance.now();observations.growth=false;
  const a=compileTrinity(TrinitySceneRecipe).signature,b=compileTrinity(TrinitySceneRecipe).signature;
  observations.determinism=a===b;
}export function setMode(next){
  if(!['KRIEGER','INK','CUBE'].includes(next))return;
  clearSceneState();mode=next;setEnvironment(next);
  if(next==='INK')enterInk();else if(next==='CUBE')enterCube();else enterKrieger();
  ui.buttons.forEach(b=>b.classList.toggle('active',b.dataset.mode===next));
  ui.label.textContent='TRINITY / '+next;
  window.dispatchEvent(new CustomEvent('trinitymodechange',{detail:{mode:next,recipeId:TrinitySceneRecipe.id,seed:TrinitySceneRecipe.seed}}));
}
ui.buttons.forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.mode)));
ui.debugButton.addEventListener('click',()=>{
  ui.debug.hidden=!ui.debug.hidden;ui.debugButton.classList.toggle('active',!ui.debug.hidden);
  updateDebug(performance.now(),true);
});

addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=true;if(['arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase()))e.preventDefault();});
addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false;});
canvas.addEventListener('pointerdown',e=>{
  const side=e.clientX<innerWidth*.47?'move':'look';
  pointers.set(e.pointerId,{side,sx:e.clientX,sy:e.clientY,lx:e.clientX,ly:e.clientY});
  try{canvas.setPointerCapture(e.pointerId);}catch{} e.preventDefault();
},{passive:false});canvas.addEventListener('pointermove',e=>{
  const p=pointers.get(e.pointerId);if(!p)return;
  if(p.side==='move'){
    move.x=Math.max(-1,Math.min(1,(e.clientX-p.sx)/55));
    move.y=Math.max(-1,Math.min(1,-(e.clientY-p.sy)/55));
  }else{
    yaw-=(e.clientX-p.lx)*.0042;
    pitch=Math.max(-.62,Math.min(.42,pitch-(e.clientY-p.ly)*.0032));
    p.lx=e.clientX;p.ly=e.clientY;poseCamera();
  }
  e.preventDefault();
},{passive:false});
function endPointer(e){
  const p=pointers.get(e.pointerId);if(p?.side==='move'){move.x=0;move.y=0;}
  pointers.delete(e.pointerId);try{canvas.releasePointerCapture(e.pointerId);}catch{}e.preventDefault();
}
canvas.addEventListener('pointerup',endPointer,{passive:false});
canvas.addEventListener('pointercancel',endPointer,{passive:false});

function updateMovement(dt){
  const forward=(keys.w||keys.arrowup?1:0)-(keys.s||keys.arrowdown?1:0)+move.y;
  const strafe=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0)+move.x;
  const f=Math.max(-1,Math.min(1,forward)),s=Math.max(-1,Math.min(1,strafe)),speed=3.0;
  const fx=Math.sin(yaw),fz=Math.cos(yaw),rx=Math.sin(yaw+Math.PI/2),rz=Math.cos(yaw+Math.PI/2);
  camera.position.x=Math.max(-16,Math.min(16,camera.position.x+(fx*f+rx*s)*speed*dt));
  camera.position.z=Math.max(-16,Math.min(19,camera.position.z+(fz*f+rz*s)*speed*dt));
  camera.position.y=Math.max(1.15,Math.min(7.5,camera.position.y));poseCamera();
  if(mode==='INK'&&inkEntryPose){
    const moved=Math.hypot(camera.position.x-inkEntryPose.x,camera.position.z-inkEntryPose.z)>.12||
      Math.abs(yaw-inkEntryPose.yaw)>.04||Math.abs(pitch-inkEntryPose.pitch)>.04;
    if(moved)inkStyleMoved=true;
  }
}function viewportEvidence(){
  try{
    const v=window.WorldServerGameViewport?.snapshot?.();
    if(v?.pass)observations.viewport=true;
    return v||null;
  }catch{return null;}
}
function meshMetrics(root){
  let objects=0,materials=new Set(),triangles=0;
  root?.traverse(o=>{
    if(!o.isMesh)return;
    objects++;
    const g=o.geometry;
    triangles+=g?.index?g.index.count/3:(g?.attributes?.position?.count||0)/3;
    for(const m of (Array.isArray(o.material)?o.material:[o.material])){
      if(m)materials.add(m.uuid||m.id||m.type);
    }
  });
  return {objects,materials:materials.size,triangles:Math.round(triangles)};
}
function userVisibilityScore(metrics,ids){
  const r=canvas.getBoundingClientRect(),vv=window.visualViewport;
  const vw=vv?.width||innerWidth,vh=vv?.height||innerHeight;
  const coverage=Math.min(1,(r.width*r.height)/Math.max(1,vw*vh));
  const content=metrics.objects>5&&renderer.info.render.calls>0?1:0;
  const semantic=Math.min(1,ids.filter(id=>REQUIRED_SEMANTIC_IDS.includes(id)).length/REQUIRED_SEMANTIC_IDS.length);
  const controls=ui.buttons.every(b=>{
    const q=b.getBoundingClientRect();
    return q.width>20&&q.height>20&&q.bottom>0&&q.right>0;
  })?1:0;
  return Math.round((coverage*.4+content*.2+semantic*.2+controls*.2)*100);
}
function capabilityState(metrics,ids,inkDiag,cube){
  const has=id=>ids.includes(id);
  const ops=new Set(cube?.operations?.map(o=>o.op)||[]);
  const growthOps=['split','move','extrude','merge','settle','attach','transform','growth'];
  return {
    GEOMETRY:metrics.triangles>500?'REAL':'PARTIAL',
    MATERIALS:metrics.materials>=4?'REAL':metrics.materials>0?'PARTIAL':'MISSING',
    LIGHTING:has('light:lantern')?'REAL':'PARTIAL',
    CHARACTER:has('character:worker')?'PARTIAL':'MISSING',
    ANIMATION:has('character:worker')?'PARTIAL':'MISSING',
    INK:inkDiag?.materials>0&&inkDiag?.outlines>0&&sceneState?.semanticInk>=2?'REAL':observations.ink?'REAL':'PARTIAL',
    GROWTH:growthOps.every(op=>ops.has(op))?'REAL':'PARTIAL',
    FX:has('light:lantern')?'PARTIAL':'MISSING',
    VIEWPORT:observations.viewport?'REAL':'PARTIAL',
    PERFORMANCE:metrics.drawCalls>0&&metrics.drawCalls<=180?'REAL':'PARTIAL',
    KRIEGER_RENDERER:'FALLBACK',
    KRIEGER_NATIVE_SCENE_AUTHORING:'MISSING'
  };
}
function cubeGates(cube){
  const hist=cube?.history||[],first=hist[0];
  const stages=new Set(hist.map(h=>h.stage)),ids=cube?.semanticIds||[];
  return {
    REAL_GROWTH_GATE:Boolean(first?.objects===1&&hist.some(h=>h.objects>1)),
    DETERMINISM_GATE:observations.determinism,
    INTERMEDIATE_STATE_GATE:stages.size>=4&&hist.some(h=>h.objects>1),
    FINAL_SEMANTIC_EQUIVALENCE_GATE:Boolean(cube?.done&&REQUIRED_SEMANTIC_IDS.every(id=>ids.includes(id)))
  };
}
function inkGates(inkDiag,ids){
  return {
    SEMANTIC_INK_GATE:Boolean(sceneState?.semanticInk>=2&&inkDiag?.outlines>0),
    WATERCOLOR_GATE:Boolean(inkDiag?.materials>0&&inkDiag?.paperTexture&&inkDiag?.washTexture),
    STYLE_PERSISTENCE_GATE:Boolean(observations.ink&&inkStyleMoved),
    DEPTH_READABILITY_GATE:['architecture:tower','architecture:bridge','vegetation:tree'].every(id=>ids.includes(id))
  };
}
function currentEvidence(now){
  const cube=cubeRun?.state||null;
  if(cubeRun)sceneState.semanticIds=cube.semanticIds||semanticIdsOf(cubeRun.root);
  const ids=sceneState?.semanticIds||semanticIdsOf(sceneState?.root);
  const mm=meshMetrics(sceneState?.root);
  const vp=viewportEvidence();
  const inkDiag=watercolor?.diagnostics?.()||null;
  const profile=mode==='INK'?'living_ink':'krieger_industrial';
  const descriptor=sceneState?.root?buildGovernorDescriptor(
    sceneState,renderer,vp?.metrics?.dpr||devicePixelRatio||1,profile
  ):null;
  const governor=descriptor?analyzeGraphicsQuality(descriptor,{styleProfile:descriptor.styleProfile}):null;
  const sorted=frameTimes.slice().sort((a,b)=>a-b);
  const p95=sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))]||0;
  const elapsed=Math.max(.001,(now-startAt)/1000);
  const metrics={...mm,drawCalls:renderer.info.render.calls,
    fps:Number((frames/elapsed).toFixed(1)),p95FrameMs:Number(p95.toFixed(2)),
    dpr:vp?.metrics?.dpr||devicePixelRatio||1,canvasResolution:canvas.width+'x'+canvas.height,
    viewportResolution:Math.round(vp?.metrics?.cssWidth||innerWidth)+'x'+Math.round(vp?.metrics?.cssHeight||innerHeight)};
  metrics.userVisibility=userVisibilityScore(metrics,ids);
  return {ids,metrics,vp,inkDiag,cube,governor};
}
function publicState(now=performance.now()){
  const ev=currentEvidence(now);
  const cubeG=cubeGates(ev.cube),inkG=inkGates(ev.inkDiag,ev.ids);
  if(cubeG.REAL_GROWTH_GATE)observations.growth=true;
  const caps=capabilityState(ev.metrics,ev.ids,ev.inkDiag,ev.cube);
  return {
    ready:true,mode,recipeId:TrinitySceneRecipe.id,seed:TrinitySceneRecipe.seed,
    sceneRecipeSame:sameRecipeEvidence(TrinitySceneRecipe,TrinitySceneRecipe),
    semanticIds:ev.ids,requiredSemanticIds:[...REQUIRED_SEMANTIC_IDS],
    signature:sceneState?.compiled?.signature||cubeRun?.compiled?.signature||compileTrinity(TrinitySceneRecipe).signature,
    metrics:ev.metrics,viewport:ev.vp,governor:ev.governor,
    ink:{diagnostics:ev.inkDiag,semanticStrokes:sceneState?.semanticInk||0,styleMoved:inkStyleMoved,gates:inkG},
    cube:ev.cube?{...ev.cube,gates:cubeG}:null,
    capabilities:caps,
    provenance:{kriegerNativeScene:false,sharedRecipe:true,hiddenFinishedScene:false}
  };
}
function statusHtml(status){
  const cls=String(status).toLowerCase();
  return '<span class="'+cls+'">'+status+'</span>';
}
function gateHtml(value){
  return '<span class="'+(value?'pass':'fail')+'">'+(value?'PASS':'FAIL')+'</span>';
}
function debugRows(state){
  const rows=[
    ['SCENE RECIPE',state.sceneRecipeSame?'SAME':'DIFFERENT'],
    ['SEED',state.seed],
    ...Object.entries(state.capabilities).map(([k,v])=>[k,statusHtml(v),true]),
    ['OBJECTS',state.metrics.objects],
    ['TRIANGLES',state.metrics.triangles],
    ['DRAW CALLS',state.metrics.drawCalls],
    ['FPS',state.metrics.fps],
    ['P95 FRAME MS',state.metrics.p95FrameMs],
    ['DPR',state.metrics.dpr],
    ['CANVAS',state.metrics.canvasResolution],
    ['VIEWPORT',state.metrics.viewportResolution],
    ['USER VISIBILITY',state.metrics.userVisibility+'%'],
    ['VIEWPORT GATE',gateHtml(Boolean(state.viewport?.pass)),true]
  ];
  const gates=mode==='INK'?state.ink.gates:mode==='CUBE'?state.cube?.gates:state.governor?.gates;
  for(const [k,v] of Object.entries(gates||{}))rows.push([k,gateHtml(Boolean(v)),true]);
  return rows;
}
function updateDebug(now,force=false){
  if(!force&&now-lastDebug<300)return;
  lastDebug=now;
  const state=publicState(now);
  window.__trinityLab=state;
  if(!ui.debug.hidden){
    ui.grid.innerHTML=debugRows(state).map(([k,v,raw])=>
      '<div class="key">'+k+'</div><div class="value">'+(raw?v:String(v))+'</div>'
    ).join('');
  }
  if(mode==='CUBE'&&state.cube){
    ui.stage.textContent=state.cube.stage.toUpperCase()+' · '+
      Math.round(state.cube.progress*100)+'% · '+state.metrics.objects+' OBJECTS';
  }else{
    ui.stage.textContent='';
  }
}
function frame(now){
  const dt=Math.min(.04,(now-lastFrame)/1000);
  lastFrame=now;frames++;
  frameTimes.push(dt*1000);
  if(frameTimes.length>180)frameTimes.shift();
  updateMovement(dt);
  if(mode==='CUBE'&&cubeRun){
    cubeRun.update((now-cubeStarted)/1000);
    sceneState.semanticIds=cubeRun.state.semanticIds;
  }else{
    animateScene(sceneState,now);
  }
  watercolor?.tick?.(now);
  ctx.render();
  watercolor?.present?.(now);
  updateDebug(now);
  requestAnimationFrame(frame);
}
window.__trinityLabControl={
  setMode,
  seekCube(seconds){
    if(mode!=='CUBE')setMode('CUBE');
    const value=Math.max(0,Math.min(
      TrinitySceneRecipe.evolution.durationSeconds,Number(seconds)||0
    ));
    cubeStarted=performance.now()-value*1000;
    const state=cubeRun.update(value);
    sceneState.semanticIds=state.semanticIds;
    updateDebug(performance.now(),true);
    return window.__trinityLab;
  },
  snapshot(){
    updateDebug(performance.now(),true);
    return window.__trinityLab;
  },
  resetCamera
};

resetCamera();
setMode('KRIEGER');
window.WorldServerGameViewport?.registerAdapter?.({
  camera,renderer,onResize:()=>ctx.resize()
});
window.WorldServerGameViewport?.sync?.();
updateDebug(performance.now(),true);
requestAnimationFrame(frame);
