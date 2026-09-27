// Demand-loaded painterly terrain. The height/biome contract is vendored byte-for-byte
// from World Server; this module owns only graphics, never a second simulation.
import {hash32,sampleTerrain,SEA_LEVEL,TERRAIN_CONTRACT_VERSION} from './ws-terrain-contract.mjs';
export const CHUNK_PIXELS=384;
export const WORLD_PIXEL_PER_VOXEL=16;
export {TERRAIN_CONTRACT_VERSION};
const palettes={
  plains:[100,123,91],forest:[58,105,73],desert:[184,143,101],
  snow:[170,185,191],wetland:[64,119,129],islands:[83,131,122]
};
export function chunkCoord(p){return Math.floor(p/CHUNK_PIXELS);}
export function chunkKey(worldId,seed,cx,cy,lod=0){
  return worldId+':'+seed+':'+cx+':'+cy+':'+lod;
}
export function terrainAt(worldId,seed,worldX,worldY){
  // World ID is the persistence namespace. WS owns the actual seed for that ID.
  const x=worldX/WORLD_PIXEL_PER_VOXEL,z=worldY/WORLD_PIXEL_PER_VOXEL;
  return sampleTerrain(x,z,seed,'mixed');
}
export function visibleChunks(camera,view,margin=1,max=32){
  const x0=chunkCoord(camera.x-view.width/2),x1=chunkCoord(camera.x+view.width/2);
  const y0=chunkCoord(camera.y-view.height/2),y1=chunkCoord(camera.y+view.height/2);
  const all=[];
  for(let y=y0-margin;y<=y1+margin;y++)for(let x=x0-margin;x<=x1+margin;x++){
    const inside=x>=x0&&x<=x1&&y>=y0&&y<=y1;
    const dist=(x+.5-camera.x/CHUNK_PIXELS)**2+(y+.5-camera.y/CHUNK_PIXELS)**2;
    all.push({cx:x,cy:y,inside,dist,lod:inside?0:1});
  }
  all.sort((a,b)=>Number(b.inside)-Number(a.inside)||a.dist-b.dist||a.cy-b.cy||a.cx-b.cx);
  const visibleCount=(x1-x0+1)*(y1-y0+1);
  return all.slice(0,Math.max(max,visibleCount));
}
export function terrainSupports(kind,point,footprint,seed){
  if(kind==='dragon'||kind==='volcano')return true;
  const dx=footprint.width/3,dy=footprint.height/3;
  const spots=[[0,0],[-dx,-dy],[dx,-dy],[-dx,dy],[dx,dy]];
  const heights=spots.map(([x,y])=>terrainAt('main',seed,point.x+x,point.y+y).height);
  // The first pass is forgiving: large structures need stable ground, forests
  // can grow on steeper slopes, and wetlands support water interventions.
  if(['city','energy','forest','farm'].includes(kind)&&heights.some(h=>h<SEA_LEVEL))return false;
  const grade=Math.max(...heights)-Math.min(...heights);
  return grade<=(kind==='farm'?8:kind==='city'?12:19);
}
function fillCell(ctx,cx,cy,step,seed,worldId){
  const wx=cx*step+step/2,wy=cy*step+step/2;
  const s=terrainAt(worldId,seed,wx,wy);
  const base=s.height<SEA_LEVEL?[59,109,136]:palettes[s.biome]||palettes.plains;
  const grain=hash32(cx,cy,seed+4513)-.5;
  const shade=(s.height-26)*1.5+grain*29;
  const rgb=base.map((v,i)=>Math.max(0,Math.min(255,Math.round(v+shade*(i===2?.72:1)))));
  ctx.fillStyle='rgb('+rgb.join(',')+')';
  ctx.fillRect(cx*step,cy*step,step+.6,step+.6);
  const fleck=hash32(cx,cy,seed+8191);
  if(fleck>.35){
    ctx.fillStyle=s.height<SEA_LEVEL?'rgba(197,218,221,.35)':'rgba(247,231,185,.19)';
    ctx.beginPath();
    const ox=hash32(cx,cy,seed+301)*step,oy=hash32(cx,cy,seed+302)*step;
    ctx.ellipse(cx*step+ox,cy*step+oy,step*.23,step*.095,-.35,0,2*Math.PI);
    ctx.fill();
  }
}
export function paintChunk(canvas,{cx,cy,worldId,seed,lod=0,quality=1}){
  // High-DPI CSS scaling without rendering more than native iPhone can handle.
  const resolution=Math.max(.35,Math.min(1,quality*(lod? .65:1)));
  canvas.width=Math.ceil(CHUNK_PIXELS*resolution);
  canvas.height=Math.ceil(CHUNK_PIXELS*resolution);
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)return;
  ctx.setTransform(canvas.width/CHUNK_PIXELS,0,0,canvas.height/CHUNK_PIXELS,0,0);
  // Paint at absolute world-grid locations so neighboring chunks join seamlessly.
  const step=lod?48:24;
  const startX=cx*CHUNK_PIXELS,startY=cy*CHUNK_PIXELS;
  for(let y=0;y<CHUNK_PIXELS;y+=step)for(let x=0;x<CHUNK_PIXELS;x+=step){
    const cellX=Math.floor((startX+x)/step),cellY=Math.floor((startY+y)/step);
    ctx.save();ctx.translate(-startX,-startY);
    fillCell(ctx,cellX,cellY,step,seed,worldId);
    ctx.restore();
  }
}
export function mountChunkTerrain(host,getSpatial,requestMapRender){
  const doc=host.ownerDocument;
  const layer=doc.createElement('div');
  layer.id='terrainChunks';layer.setAttribute('aria-hidden','true');
  host.insertBefore(layer,host.querySelector('.map-ground')||host.firstChild);
  const mobile=matchMedia('(pointer:coarse)').matches;
  const maxLive=mobile?16:32,maxCache=mobile?4:10;
  const active=new Map(),cache=new Map();
  let destroyed=false,created=0,unloaded=0;
  function remember(key,item){
    cache.delete(key);cache.set(key,item);
    while(cache.size>maxCache)cache.delete(cache.keys().next().value);
  }
  function make(spec,spatial){
    const key=chunkKey(spatial.worldId,spatial.seed,spec.cx,spec.cy,spec.lod);
    let entry=cache.get(key);
    if(entry)cache.delete(key);
    else{
      const canvas=doc.createElement('canvas');
      canvas.className='terrain-chunk';canvas.dataset.chunk=key;
      paintChunk(canvas,{...spec,worldId:spatial.worldId,seed:spatial.seed,quality:mobile?.72:1});
      entry={canvas,lod:spec.lod};created++;
    }
    layer.appendChild(entry.canvas);
    return {key,...entry,cx:spec.cx,cy:spec.cy};
  }
  function render(){
    if(destroyed)return;
    const spatial=getSpatial(),width=host.clientWidth,height=host.clientHeight;
    if(!spatial||width<=0||height<=0)return;
    const specs=visibleChunks(spatial.camera,{width,height},1,maxLive);
    const desired=new Map(specs.map(s=>[chunkKey(spatial.worldId,spatial.seed,s.cx,s.cy,s.lod),s]));
    for(const [key,entry]of active){
      if(desired.has(key))continue;
      entry.canvas.remove();active.delete(key);unloaded++;remember(key,entry);
    }
    let newCount=0,missing=false;
    for(const [key,spec]of desired){
      let entry=active.get(key);
      if(!entry){
        if(newCount>=(mobile?1:2)){missing=true;continue;}
        entry=make(spec,spatial);active.set(key,entry);newCount++;
      }
      // Object/world coordinates are never mutated by camera translations.
      entry.canvas.style.left=(spec.cx*CHUNK_PIXELS-spatial.camera.x+width/2)+'px';
      entry.canvas.style.top=(spec.cy*CHUNK_PIXELS-spatial.camera.y+height/2)+'px';
    }
    if(missing)requestMapRender();
  }
  return{
    render,getStats:()=>({active:active.size,cached:cache.size,created,unloaded,limit:maxLive}),
    destroy(){destroyed=true;for(const e of active.values())e.canvas.remove();
      active.clear();cache.clear();layer.remove();}
  };
}
