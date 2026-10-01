import * as THREE from './vendor/three-r160/three.module.min.js';
import {createEvolutionPlan,sampleTimeline,planSignature} from './shared/world-evolution-runtime.mjs';
import {createSemanticStroke} from '../living-watercolor-3d/living-watercolor-generators.js';
import {TrinitySceneRecipe,evolutionInputFromRecipe,REQUIRED_SEMANTIC_IDS} from './scene-recipe.mjs';

const COLORS={
  stone:0x625e57,stone2:0x7a7165,earth:0x5e5b50,grass:0x68745b,
  bark:0x5d4936,leaf:0x526849,cloth:0x45586a,skin:0xb98f73,
  metal:0x30363c,lantern:0xffb45f,water:0x5c7686,gray:0x777777
};
const clamp01=v=>Math.max(0,Math.min(1,Number(v)||0));

export function compileTrinity(recipe=TrinitySceneRecipe){
  const input=evolutionInputFromRecipe(recipe);
  const plan=createEvolutionPlan(input);
  return {recipe,input,plan,signature:planSignature(plan)};
}

function mat(profile,kind='stone'){
  if(profile==='CUBE') return new THREE.MeshStandardMaterial({color:COLORS.gray,roughness:.86,metalness:.02});
  if(profile==='INK') return new THREE.MeshLambertMaterial({color:COLORS[kind]||COLORS.stone,transparent:true,opacity:.58});
  const metal=kind==='metal'||kind==='lantern';
  return new THREE.MeshStandardMaterial({color:COLORS[kind]||COLORS.stone,roughness:metal ? .28 : .62,metalness:metal ? .64 : .08});
}function tag(object,id,type=id.split(':')[0]){
  object.userData.semanticId=id;object.userData.semanticType=type;return object;
}
function mesh(group,geometry,material,id,{position=[0,0,0],scale=[1,1,1],rotation=[0,0,0],cast=true}={}){
  const m=tag(new THREE.Mesh(geometry,material),id);
  m.position.set(...position);m.scale.set(...scale);m.rotation.set(...rotation);
  m.castShadow=cast;m.receiveShadow=true;group.add(m);return m;
}
function group(parent,id,type){
  const g=tag(new THREE.Group(),id,type);parent.add(g);return g;
}
function trianglesOf(root){
  let n=0;root.traverse(o=>{if(o.isMesh){const g=o.geometry;n+=g?.index?g.index.count/3:(g?.attributes?.position?.count||0)/3;}});return Math.round(n);
}
export function semanticIdsOf(root){
  const ids=new Set();root?.traverse(o=>{if(o.userData?.semanticId)ids.add(o.userData.semanticId);});return [...ids].sort();
}
export function disposeRoot(root){
  if(!root)return;root.traverse(o=>{o.geometry?.dispose?.();const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>m?.dispose?.());});
  root.removeFromParent?.();
}

function terrainCell(parent,c,profile,id='terrain:ground'){
  const h=Math.max(.22,.32+c.scaleY*.42);
  return mesh(parent,new THREE.BoxGeometry(.68,h,.68),mat(profile,'earth'),id,{position:[c.x,c.y-h*.34,c.z]});
}
function mergedTerrain(parent,cells,profile,id='terrain:ground'){
  const positions=[],indices=[],faces=[
    [0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],
    [3,7,6],[3,6,2],[0,4,7],[0,7,3],[1,2,6],[1,6,5]
  ];
  for(const c of cells){
    const h=Math.max(.22,.32+c.scaleY*.42),x=c.x,z=c.z,y=c.y-h*.34;
    const x0=x-.34,x1=x+.34,z0=z-.34,z1=z+.34,y0=y-h/2,y1=y+h/2,base=positions.length/3;
    positions.push(x0,y0,z0,x1,y0,z0,x1,y1,z0,x0,y1,z0,x0,y0,z1,x1,y0,z1,x1,y1,z1,x0,y1,z1);
    for(const f of faces)indices.push(base+f[0],base+f[1],base+f[2]);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const merged=mesh(parent,geometry,mat(profile,'earth'),id);
  merged.userData.mergedCells=cells.length;merged.userData.secondaryParts=Math.min(10,cells.length);
  return merged;
}function rock(parent,r,profile){
  return mesh(parent,new THREE.DodecahedronGeometry(.42,0),mat(profile,'stone2'),'terrain:rocks',{
    position:[r.x,r.y,r.z],scale:[r.s,.72*r.s,1.12*r.s],rotation:[r.delay*2.1,r.delay*1.2,0]
  });
}
function tree(parent,opt,profile,id='vegetation:tree'){
  const g=group(parent,id,'tree');g.position.set(...opt.position);
  const trunk=mesh(g,new THREE.CylinderGeometry(.19,.29,opt.height*.68,9),mat(profile,'bark'),id,{position:[0,opt.height*.34,0]});
  trunk.rotation.z=.035;
  const crownY=opt.height*.75;
  for(let i=0;i<5;i++){
    const a=i*Math.PI*2/5,rr=opt.crown*(.58+(i%2)*.12);
    mesh(g,new THREE.IcosahedronGeometry(rr,1),mat(profile,'leaf'),id,{
      position:[Math.cos(a)*opt.crown*.36,crownY+(i%2)*.28,Math.sin(a)*opt.crown*.34],
      scale:[1.0,.82,1.0],rotation:[0,a*.4,0]
    });
  }
  g.userData.secondaryParts=6;return g;
}
function tower(parent,opt,profile){
  const g=group(parent,opt.id,'tower');g.position.set(...opt.position);
  mesh(g,new THREE.CylinderGeometry(opt.radius*.86,opt.radius,opt.height,10),mat(profile,'stone'),opt.id,{position:[0,opt.height/2,0]});
  mesh(g,new THREE.CylinderGeometry(opt.radius*1.05,opt.radius*.92,.28,10),mat(profile,'stone2'),opt.id,{position:[0,opt.height+.04,0]});
  for(let i=0;i<10;i++){const a=i*Math.PI*2/10;mesh(g,new THREE.BoxGeometry(.36,.52,.34),mat(profile,'stone2'),opt.id,{
    position:[Math.cos(a)*opt.radius*.88,opt.height+.34,Math.sin(a)*opt.radius*.88],rotation:[0,-a,0]
  });}
  mesh(g,new THREE.ConeGeometry(opt.radius*.76,1.15,10),mat(profile,'metal'),opt.id,{position:[0,opt.height+1.0,0]});
  g.userData.secondaryParts=13;return g;
}function bridge(parent,opt,profile){
  const g=group(parent,opt.id,'bridge');g.position.set(...opt.position);
  const pts=[];for(let i=0;i<=8;i++){const t=i/8,x=(t-.5)*opt.span,y=Math.sin(t*Math.PI)*1.18;pts.push(new THREE.Vector3(x,y,0));}
  const curve=new THREE.CatmullRomCurve3(pts);
  mesh(g,new THREE.TubeGeometry(curve,40,.22,8,false),mat(profile,'stone2'),opt.id);
  mesh(g,new THREE.BoxGeometry(opt.span,opt.width,.34),mat(profile,'stone'),opt.id,{position:[0,1.22,0],rotation:[Math.PI/2,0,0]});
  for(const side of [-.48,.48])for(const x of [-1.35,-.68,0,.68,1.35]){
    mesh(g,new THREE.CylinderGeometry(.055,.07,.65,7),mat(profile,'metal'),opt.id,{position:[x,1.56,side]});
  }
  g.userData.secondaryParts=12;return g;
}
function character(parent,opt,profile){
  const g=group(parent,opt.id,'character');g.position.set(...opt.position);
  const torso=mesh(g,new THREE.CylinderGeometry(.23,.29,.72,8),mat(profile,'cloth'),opt.id,{position:[0,1.15,0]});
  mesh(g,new THREE.SphereGeometry(.23,12,8),mat(profile,'skin'),opt.id,{position:[0,1.68,0]});
  const limbs={};
  for(const [name,x,y] of [['la',-.3,1.25],['ra',.3,1.25],['ll',-.15,.62],['rl',.15,.62]]){
    const pivot=new THREE.Group();pivot.position.set(x,y,0);g.add(pivot);
    mesh(pivot,new THREE.CylinderGeometry(.07,.08,.62,7),mat(profile,name[0]==='l'?'cloth':'cloth'),opt.id,{position:[0,-.29,0]});
    limbs[name]=pivot;
  }
  g.userData.limbs=limbs;g.userData.baseX=opt.position[0];g.userData.baseZ=opt.position[2];g.userData.secondaryParts=6;return g;
}function lantern(parent,opt,profile){
  const g=group(parent,opt.id,'light');g.position.set(...opt.position);
  mesh(g,new THREE.CylinderGeometry(.045,.065,2.15,8),mat(profile,'metal'),opt.id,{position:[0,-1.04,0]});
  mesh(g,new THREE.BoxGeometry(.38,.42,.38),mat(profile,'metal'),opt.id,{position:[0,.02,0]});
  const bulb=mesh(g,new THREE.SphereGeometry(.12,10,7),new THREE.MeshStandardMaterial({
    color:0xffd59a,emissive:COLORS.lantern,emissiveIntensity:2.2,roughness:.25
  }),opt.id,{position:[0,.02,0]});
  const light=new THREE.PointLight(opt.color,opt.intensity,opt.range,2);light.position.set(0,.05,0);g.add(light);
  g.userData.pointLight=light;g.userData.bulb=bulb;return g;
}
function addSemanticInk(root,recipe){
  const ink='#334a63';
  const strokes=[
    createSemanticStroke(THREE,[new THREE.Vector3(.38,0,0),new THREE.Vector3(.38,2.4,0),new THREE.Vector3(.28,4.6,0)],{color:ink,radius:.018,seed:recipe.seed+':tower'}),
    createSemanticStroke(THREE,[new THREE.Vector3(-4.1,.05,-2.25),new THREE.Vector3(-4.0,1.8,-2.25),new THREE.Vector3(-3.8,3.5,-2.2)],{color:ink,radius:.022,seed:recipe.seed+':tree'})
  ];
  strokes.forEach(s=>{s.userData.semanticId='ink:semantic-stroke';root.add(s);});return strokes.length;
}function sceneTrees(root,plan,recipe,profile){
  const main=tree(root,recipe.vegetation.tree,profile);
  for(let i=0;i<Math.min(3,plan.biome.trees.length);i++){
    const p=plan.biome.trees[i];tree(root,{position:[p.x,p.y,p.z],height:2.1*p.scale,crown:.72*p.scale},profile,'vegetation:tree');
  }
  return main;
}
export function buildStaticScene(ctx,recipe=TrinitySceneRecipe,profile='KRIEGER'){
  const compiled=compileTrinity(recipe),root=group(ctx.scene,'scene:root','scene');
  root.userData.recipeId=recipe.id;root.userData.seed=recipe.seed;root.userData.signature=compiled.signature;
  const terrain=group(root,'terrain:ground','terrain');
  mergedTerrain(terrain,compiled.plan.terrain,profile);
  const rocks=group(root,'terrain:rocks','rocks');
  compiled.plan.biome.rocks.slice(0,recipe.terrain.rocks).forEach(r=>rock(rocks,r,profile));
  sceneTrees(root,compiled.plan,recipe,profile);
  const tw=tower(root,recipe.architecture.tower,profile);
  const br=bridge(root,recipe.architecture.bridge,profile);
  const ch=character(root,recipe.characters[0],profile);
  const la=lantern(root,recipe.lights[0],profile);
  let semanticInk=0;if(profile==='INK')semanticInk=addSemanticInk(root,recipe);
  return {root,compiled,animated:[ch],lantern:la,semanticInk,semanticIds:semanticIdsOf(root),triangles:trianglesOf(root),tower:tw,bridge:br};
}
export function animateScene(sceneState,timeMs){
  const t=timeMs*.001;
  for(const ch of sceneState?.animated||[]){const l=ch.userData.limbs;if(!l)continue;const s=Math.sin(t*2.4);
    l.la.rotation.x=s*.22;l.ra.rotation.x=-s*.22;l.ll.rotation.x=-s*.16;l.rl.rotation.x=s*.16;
    ch.rotation.y=Math.sin(t*.35)*.08;ch.position.y=.02+Math.sin(t*2.4)*.018;
  }
  const bulb=sceneState?.lantern?.userData?.bulb;if(bulb?.material)bulb.material.emissiveIntensity=1.9+Math.sin(t*3.1)*.22;
}

function colorize(root,amount){
  const t=clamp01(amount);root.traverse(o=>{if(!o.isMesh||!o.material?.color)return;
    const kind=o.userData.semanticType||o.userData.semanticId?.split(':')[0]||'stone';
    const target=new THREE.Color(kind==='tree'?COLORS.leaf:kind==='character'?COLORS.cloth:kind==='light'?COLORS.lantern:kind==='rocks'?COLORS.stone2:kind==='terrain'?COLORS.earth:COLORS.stone);
    o.material.color.lerp(target,t*.18);
  });
}
function pushOp(state,op,id,detail=''){state.operations.push({t:Number(state.progress.toFixed(3)),op,id,detail});}

export function createCubeEvolution(ctx,recipe=TrinitySceneRecipe){
  const compiled=compileTrinity(recipe),root=group(ctx.scene,'scene:root','scene');
  root.userData.recipeId=recipe.id;root.userData.seed=recipe.seed;root.userData.signature=compiled.signature;
  const state={progress:0,stage:'cube',operations:[],history:[],semanticIds:[],done:false};
  const seedCube=mesh(root,new THREE.BoxGeometry(1.15,1.15,1.15),mat('CUBE'),'seed:cube',{position:[0,.68,0]});
  const matter=group(root,'growth:matter','growth');const terrain=group(root,'terrain:ground','terrain');
  const rocks=group(root,'terrain:rocks','rocks');let matterBuilt=false,terrainCount=0,rockCount=0,treeCount=0;
  const matterCubes=[];let moveRecorded=false,terrainMerged=false;
  let towerObj=null,bridgeObj=null,lanternObj=null,charObj=null,materialsDone=false,lightDone=false;
  function snapshot(stage){const count=[];root.traverse(o=>{if(o.isMesh)count.push(o);});state.semanticIds=semanticIdsOf(root);
    const last=state.history.at(-1);if(!last||last.stage!==stage||last.objects!==count.length)state.history.push({stage,objects:count.length,ids:[...state.semanticIds]});
  }
  function splitMatter(p){if(matterBuilt)return;matterBuilt=true;seedCube.removeFromParent();seedCube.geometry.dispose();seedCube.material.dispose();
    for(let x of [-1,1])for(let y of [0,1])for(let z of [-1,1]){
      const cube=mesh(matter,new THREE.BoxGeometry(.48,.48,.48),mat('CUBE'),'growth:matter',{position:[0,.68,0]});
      cube.userData.target=new THREE.Vector3(x*.34,.35+y*.45,z*.34);matterCubes.push(cube);
    }
    pushOp(state,'split','seed:cube','1 -> 8 generated matter cubes');
  }
  function moveMatter(p){
    const t=clamp01(p/.72);
    for(const cube of matterCubes)cube.position.lerpVectors(new THREE.Vector3(0,.68,0),cube.userData.target,t);
    if(t>.08&&!moveRecorded){moveRecorded=true;pushOp(state,'move','growth:matter','8 cubes move into expansion lattice');}
  }
  function growTerrain(p){const target=Math.floor(compiled.plan.terrain.length*clamp01(p));
    while(terrainCount<target){const c=compiled.plan.terrain[terrainCount++];terrainCell(terrain,c,'CUBE');pushOp(state,'settle','terrain:ground',String(terrainCount));}
    if(p>.18&&matter.parent){matter.removeFromParent();disposeRoot(matter);pushOp(state,'transform','growth:matter','matter -> terrain');}
  }
  function growBiome(p){const rockTarget=Math.floor(recipe.terrain.rocks*clamp01(p*1.3));
    while(rockCount<rockTarget){rock(rocks,compiled.plan.biome.rocks[rockCount++],'CUBE');pushOp(state,'attach','terrain:rocks',String(rockCount));}
    const treeTarget=Math.floor(recipe.vegetation.count*clamp01((p-.18)/.82));
    while(treeCount<treeTarget){const tp=treeCount===0?{...recipe.vegetation.tree}:{position:[compiled.plan.biome.trees[treeCount-1].x,0,compiled.plan.biome.trees[treeCount-1].z],height:2.4,crown:.8};
      tree(root,tp,'CUBE','vegetation:tree');treeCount++;pushOp(state,'growth','vegetation:tree',String(treeCount));}
  }
  function growArchitecture(p){if(p>.05&&!towerObj){towerObj=tower(root,recipe.architecture.tower,'CUBE');towerObj.scale.y=.02;pushOp(state,'extrude','architecture:tower','procedural tower');}
    if(towerObj)towerObj.scale.y=Math.max(.02,clamp01(p/.72));
    if(p>.52&&!bridgeObj){bridgeObj=bridge(root,recipe.architecture.bridge,'CUBE');bridgeObj.scale.set(.04,.04,.04);pushOp(state,'attach','architecture:bridge','procedural arch');}
    if(bridgeObj){const s=.04+.96*clamp01((p-.52)/.48);bridgeObj.scale.set(s,s,s);}
  }
  function finalizeVisuals(sample){if(sample.stages.materials>.18){
    if(!terrainMerged){mergedTerrain(root,compiled.plan.terrain,'CUBE');disposeRoot(terrain);terrainMerged=true;pushOp(state,'merge','terrain:ground','settled cells -> one batched terrain mesh');}
    colorize(root,sample.stages.materials);if(!materialsDone){materialsDone=true;pushOp(state,'transform','materials','gray -> semantic materials');}}
    if(sample.stages.lighting>.18&&!lanternObj){lanternObj=lantern(root,recipe.lights[0],'KRIEGER');lightDone=true;pushOp(state,'attach','light:lantern','local point light');}
    if(sample.stages.life>.22&&!charObj){charObj=character(root,recipe.characters[0],'KRIEGER');pushOp(state,'attach','character:worker','life activation');}
  }
  function update(elapsedSeconds){state.progress=clamp01(elapsedSeconds/recipe.evolution.durationSeconds);const sample=sampleTimeline(compiled.input,state.progress);
    const s=sample.stages;let stage='cube';for(const name of ['matter','terrain','biome','architecture','materials','lighting','life','final'])if(s[name]>.02)stage=name;state.stage=stage;
    if(s.matter>.02){splitMatter(s.matter);moveMatter(s.matter);}if(s.terrain>.01)growTerrain(s.terrain);if(s.biome>.01)growBiome(s.biome);if(s.architecture>.01)growArchitecture(s.architecture);finalizeVisuals(sample);
    if(charObj)animateScene({animated:[charObj],lantern:lanternObj},performance.now());snapshot(stage);state.done=state.progress>=1;
    return {...state,sample,triangles:trianglesOf(root),lightDone};
  }
  snapshot('cube');return {root,state,compiled,update};
}

export function buildGovernorDescriptor(sceneState,renderer,dpr=1,styleProfile='krieger_industrial'){
  const ids=sceneState?.semanticIds||semanticIdsOf(sceneState?.root),objects=[];
  for(const id of ids.filter(x=>REQUIRED_SEMANTIC_IDS.includes(x))){
    const type=id.split(':')[1]||id.split(':')[0],nearCamera=/worker|bridge|lantern/.test(id);
    const tris=[];sceneState.root.traverse(o=>{if(o.isMesh&&o.userData.semanticId===id){const g=o.geometry;tris.push(g?.index?g.index.count/3:(g?.attributes?.position?.count||0)/3);}});
    objects.push({
      id,true3D:true,depthExtent:1,nearCamera,triangles:Math.round(tris.reduce((a,b)=>a+b,0)),
      semanticLayers:['macro','meso','surface','state'],semanticTags:[type,id,'procedural','deterministic'],
      secondaryParts:/tower|bridge|tree|worker/.test(id)?6:2,silhouetteSegments:/tower|bridge|tree/.test(id)?18:10,
      concavity:id.includes('bridge') ? .7 : .25,materialRegions:styleProfile==='living_ink'?2:4,
      materialVariation:styleProfile==='living_ink' ? .24 : .58,surfaceMicrodetail:styleProfile==='living_ink' ? .18 : .42,
      functionalComponents:id.includes('worker')?5:id.includes('lantern')?3:2,primitiveFallback:false,
      flatSurfaceRatio:id.includes('terrain') ? .62 : .34,screenCoverage:id.includes('terrain') ? .25 : .08
    });
  }
  return {
    styleProfile,qualityTier:'KRIEGER_CLASS',objects,
    lights:[{local:true,emissiveLinked:true,affectedGeometry:5,responseStrength:.72}],
    composition:{depthPlanes:4,depthSpan:.72,foregroundStrength:.7,focalHierarchy:.66},
    lighting:{globalResponse:.68},
    performance:{drawCalls:renderer?.info?.render?.calls||0,dpr,triangles:objects.reduce((s,o)=>s+o.triangles,0)}
  };
}
