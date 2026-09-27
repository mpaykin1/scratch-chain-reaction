// Cinematic spatial projection. Coordinates are in world CSS-pixel units, not DOM offsets.
export const SPATIAL_VERSION = 1;
export const MAX_COORD = 2 ** 40;
const ART = Object.freeze({city:'city',forest:'forest',energy:'energy',volcano:'volcano'});
const ICONS = Object.freeze({farm:'🌾',irrigation:'💧',recycling:'♻️',dragon:'🐉'});

export function createSpatial(legacyPlaced) {
  const spatial={version:SPATIAL_VERSION,worldId:'main',seed:270927,camera:{x:0,y:0},objects:[],nextId:1};
  // Older saves displayed only one sprite per kind and never recorded positions.
  const initial={city:[-145,90],forest:[110,75],energy:[30,-85],volcano:[240,-120]};
  for(const [kind,count] of Object.entries(legacyPlaced||{})){
    if(count>0 && initial[kind]){
      const [x,y]=initial[kind];spatial.objects.push({id:'legacy-'+kind,kind,x,y});
    }
  }
  return spatial;
}
export function validSpatial(s){
  if(!s||s.version!==SPATIAL_VERSION||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s.worldId||'')||
    !Number.isSafeInteger(s.seed)||s.seed<0||s.seed>0xffffffff||
    !s.camera||!Number.isFinite(s.camera.x)||!Number.isFinite(s.camera.y)||
    Math.abs(s.camera.x)>MAX_COORD||Math.abs(s.camera.y)>MAX_COORD||
    !Number.isSafeInteger(s.nextId)||s.nextId<1||!Array.isArray(s.objects)||s.objects.length>5000)return false;
  const ids=new Set();
  return s.objects.every(o=>o&&typeof o.id==='string'&&o.id.length<=64&&
    /^[a-z0-9-]+$/.test(o.id)&&!ids.has(o.id)&&ids.add(o.id)&&
    typeof o.kind==='string'&&/^[a-z][a-z0-9-]{0,39}$/.test(o.kind)&&
    Number.isFinite(o.x)&&Number.isFinite(o.y)&&
    Math.abs(o.x)<=MAX_COORD&&Math.abs(o.y)<=MAX_COORD);
}
export function worldToScreen(point,camera,view){
  return {x:point.x-camera.x+view.width/2,y:point.y-camera.y+view.height/2};
}
export function screenToWorld(point,camera,view){
  return {x:point.x-view.width/2+camera.x,y:point.y-view.height/2+camera.y};
}
export function dragCamera(camera,dx,dy){
  return {x:Math.max(-MAX_COORD,Math.min(MAX_COORD,camera.x-dx)),
    y:Math.max(-MAX_COORD,Math.min(MAX_COORD,camera.y-dy))};
}
export function footprint(kind,view){
  const share={city:.30,forest:.31,energy:.23,volcano:.30}[kind]||.16;
  const width=Math.min(320,Math.max(64,view.width*share));
  const height=width*({city:.69,forest:.70,energy:.80,volcano:.85}[kind]||.85);
  return {width,height};
}
function intersects(a,b,gap=0){return a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&
  a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;}
function objectRect(object,camera,view){
  const p=worldToScreen(object,camera,view),f=footprint(object.kind,view);
  return {x:p.x-f.width/2,y:p.y-f.height,width:f.width,height:f.height};
}
// Exhaustively search visible rings, not the origin; reject UI and object occlusion.
export function planVisiblePlacement(kinds,spatial,view,blocked=[]){
  if(!Array.isArray(kinds)||!kinds.length)return {objects:[]};
  if(spatial.objects.length+kinds.length>5000)return {error:'Достигнут лимит построек этого локального сохранения.'};
  const planned=[],margin=10;
  const occupied=spatial.objects.filter(o=>{
    const p=worldToScreen(o,spatial.camera,view);
    return p.x>-400&&p.y>-400&&p.x<view.width+400&&p.y<view.height+400;
  }).map(o=>objectRect(o,spatial.camera,view));
  for(const kind of kinds){
    const f=footprint(kind,view);let point=null;
    const rings=[0,.12,.24,.36,.48,.60,.72,.84,1];
    outer:for(const radius of rings){
      const n=radius===0?1:32;
      for(let j=0;j<n;j++){
        const angle=2*Math.PI*j/n,px=view.width/2+Math.cos(angle)*radius*view.width*.48;
        const py=view.height/2+Math.sin(angle)*radius*view.height*.46;
        const rect={x:px-f.width/2,y:py-f.height,width:f.width,height:f.height};
        if(rect.x<margin||rect.y<margin||rect.x+f.width>view.width-margin||
          rect.y+f.height>view.height-margin||blocked.some(b=>intersects(rect,b,8))||
          occupied.some(b=>intersects(rect,b,14)))continue;
        point={x:px,y:py};occupied.push(rect);break outer;
      }
    }
    if(!point)return {error:'На видимом участке нет свободного места. Передвинь карту или закрой панель.'};
    planned.push({kind,...screenToWorld(point,spatial.camera,view)});
  }
  return {objects:planned};
}
export function commitPlacement(spatial,plan){
  if(plan.error)throw Error(plan.error);
  for(const entry of plan.objects){
    spatial.objects.push({id:'obj-'+spatial.nextId++,kind:entry.kind,x:entry.x,y:entry.y});
  }
}
function visibleBlockers(host){
  const base=host.getBoundingClientRect();
  return [...host.querySelectorAll('.hud,.action-dock,#dialog:not(.hidden)')]
    .filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden')
    .map(el=>{const r=el.getBoundingClientRect();return {x:r.left-base.left,y:r.top-base.top,width:r.width,height:r.height};});
}
export function mountSpatialMap(host,getWorld,{onCameraChange=()=>{}}={}){
  const document=host.ownerDocument,ground=document.createElement('div'),layer=document.createElement('div');
  const surface=document.createElement('div');
  ground.className='map-ground';layer.id='spatialObjects';surface.id='mapSurface';
  surface.setAttribute('aria-label','Перемещать карту мышью или пальцем');
  host.insertBefore(ground,host.firstChild);
  host.insertBefore(layer,host.querySelector('#people')||null);
  host.insertBefore(surface,host.querySelector('.hud')||null);
  const nodes=new Map();let active=null,frame=0;
  const view=()=>({width:host.clientWidth,height:host.clientHeight});
  function render(){
    const spatial=getWorld().spatial;if(!spatial)return;
    const size=view();if(!size.width||!size.height)return;
    ground.style.backgroundPosition=(-(spatial.camera.x%140))+'px '+(-(spatial.camera.y%120))+'px';
    const visible=[];
    for(const obj of spatial.objects){
      const p=worldToScreen(obj,spatial.camera,size),f=footprint(obj.kind,size);
      if(p.x<-f.width||p.x>size.width+f.width||p.y<-f.height||p.y>size.height+f.height)continue;
      visible.push({obj,p,f});
    }
    const ids=new Set(visible.map(x=>x.obj.id));
    for(const [id,node] of nodes)if(!ids.has(id)){node.remove();nodes.delete(id);}
    visible.sort((a,b)=>a.obj.y-b.obj.y);
    for(const {obj,p,f} of visible){
      let node=nodes.get(obj.id);
      if(!node){
        if(ART[obj.kind]){node=document.createElement('img');node.src=new URL('./assets/'+ART[obj.kind]+'.webp',import.meta.url).href;node.alt='';node.decoding='async';}
        else{node=document.createElement('span');node.textContent=ICONS[obj.kind]||'✦';}
        node.className='spatial-object';node.setAttribute('aria-hidden','true');nodes.set(obj.id,node);
      }
      node.style.left=p.x+'px';node.style.top=p.y+'px';node.style.width=f.width+'px';node.style.height=f.height+'px';
      layer.appendChild(node);
    }
    const energy=visible.find(v=>v.obj.kind==='energy');
    const rotor=host.querySelector('#rotor');
    if(rotor){rotor.style.visibility=energy?'visible':'hidden';if(energy){rotor.style.left=(energy.p.x-20)+'px';rotor.style.top=(energy.p.y-energy.f.height*.85)+'px';}}
    const people=host.querySelector('#people');if(people)people.style.visibility=visible.some(v=>v.obj.kind==='city')?'visible':'hidden';
  }
  function requestRender(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;render();});}
  function pointerDown(event){
    if(active!==null||(event.pointerType==='mouse'&&event.button!==0))return;
    active={id:event.pointerId,x:event.clientX,y:event.clientY};
    surface.setPointerCapture(event.pointerId);
  }
  function pointerMove(event){
    if(!active||event.pointerId!==active.id)return;
    const dx=event.clientX-active.x,dy=event.clientY-active.y;
    active.x=event.clientX;active.y=event.clientY;
    getWorld().spatial.camera=dragCamera(getWorld().spatial.camera,dx,dy);
    requestRender();
  }
  function pointerEnd(event){
    if(!active||event.pointerId!==active.id)return;
    active=null;onCameraChange();requestRender();
  }
  surface.addEventListener('pointerdown',pointerDown);
  surface.addEventListener('pointermove',pointerMove);
  surface.addEventListener('pointerup',pointerEnd);
  surface.addEventListener('pointercancel',pointerEnd);
  window.addEventListener('resize',requestRender);
  return {
    render,plan:kinds=>planVisiblePlacement(kinds,getWorld().spatial,view(),visibleBlockers(host)),
    destroy(){if(frame)cancelAnimationFrame(frame);window.removeEventListener('resize',requestRender);
      surface.remove();layer.remove();ground.remove();}
  };
}
