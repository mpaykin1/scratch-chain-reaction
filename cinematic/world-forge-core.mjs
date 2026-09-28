// Deterministic World Forge metadata; cinematic's existing engine owns gameplay.
export const FORGE_TYPES=Object.freeze(['barren','grass','forest','river']);
export const TILE=Object.freeze({width:108,height:54,chunk:16});
export const MAX_BLOCKS=280;
export const RECIPES=Object.freeze({
 barren:{biome:'wasteland',geometry:'terrain',sprites:[],glb:'barren'},
 grass:{biome:'meadow',geometry:'grass',sprites:[],glb:null},
 forest:{biome:'forest',geometry:'trees',sprites:['forge-leaves.apng'],glb:'forest'},
 river:{biome:'river',geometry:'autotile',sprites:['forge-water.apng'],glb:'river'}
});
export function tileHash(seed,x,z){
 let n=(seed^Math.imul(x,374761393)^Math.imul(z,668265263))>>>0;
 n=Math.imul(n^(n>>>13),1274126177);
 return (n^(n>>>16))>>>0;
}
export function createForge(seed=270927){
 return {version:1,seed:seed>>>0,nextBlockId:1,camera:{x:0,y:0},blocks:[]};
}
export function validateForge(f){
 if(!f||f.version!==1||!Number.isSafeInteger(f.seed)||
 !Number.isSafeInteger(f.nextBlockId)||f.nextBlockId<1||
 !Number.isFinite(f.camera?.x)||!Number.isFinite(f.camera?.y)||
 !Array.isArray(f.blocks)||f.blocks.length>MAX_BLOCKS)return false;
 const ids=new Set(),tiles=new Set();
 return f.blocks.every(b=>{
 const key=b?.x+','+b?.z;
 if(!b||!FORGE_TYPES.includes(b.type)||typeof b.id!=='string'||
 ids.has(b.id)||tiles.has(key)||!Number.isSafeInteger(b.x)||
 !Number.isSafeInteger(b.z)||Math.abs(b.x)>100000||
 Math.abs(b.z)>100000||!Number.isSafeInteger(b.seed))return false;
 ids.add(b.id);tiles.add(key);return true;
 });
}
export function forgeOf(world){
 return validateForge(world?.forge)?world.forge:createForge();
}
export function placeForgeBlock(world,type,x,z){
 if(!FORGE_TYPES.includes(type)||!Number.isSafeInteger(x)||
 !Number.isSafeInteger(z)||Math.abs(x)>100000||Math.abs(z)>100000)
 throw Error('Некорректный блок или координаты');
 const f=forgeOf(world);
 if(f.blocks.length>=MAX_BLOCKS)throw Error('Лимит сохранённых блоков');
 if(f.blocks.some(b=>b.x===x&&b.z===z))throw Error('Здесь уже стоит блок');
 const id='wf-'+f.nextBlockId;
 const block={version:1,id,type,x,z,seed:tileHash(f.seed,x,z),
  biome:RECIPES[type].biome,recipe:RECIPES[type].geometry,
  visualState:'active',createdTurn:world?.state?.turn??0,
  simulationEventId:world?.history?.at(-1)?.id??null};
 return {...world,forge:{...f,nextBlockId:f.nextBlockId+1,
  blocks:[...f.blocks,block]}};
}
export function moveForgeCamera(world,x,y){
 if(!Number.isFinite(x)||!Number.isFinite(y)||
 Math.abs(x)>1e7||Math.abs(y)>1e7)throw Error('Камера вне карты');
 const f=forgeOf(world);
 return {...world,forge:{...f,camera:{x,y}}};
}
export function riverSockets(blocks,x,z){
 const water=new Set(blocks.filter(b=>b.type==='river').map(b=>b.x+','+b.z));
 return {north:water.has(x+','+(z-1)),east:water.has((x+1)+','+z),
 south:water.has(x+','+(z+1)),west:water.has((x-1)+','+z)};
}
export function tileToScreen(x,z,camera,viewport){
 return {x:(x-z)*TILE.width/2+viewport.width/2+camera.x,
  y:(x+z)*TILE.height/2+viewport.height/2+camera.y};
}
export function screenToTile(px,py,camera,viewport){
 const a=(px-viewport.width/2-camera.x)/(TILE.width/2);
 const b=(py-viewport.height/2-camera.y)/(TILE.height/2);
 return {x:Math.round((a+b)/2),z:Math.round((b-a)/2)};
}
export function visibleTileBounds(camera,viewport){
 const points=[[0,0],[viewport.width,0],[0,viewport.height],
 [viewport.width,viewport.height]].map(([x,y])=>screenToTile(x,y,camera,viewport));
 return {minX:Math.min(...points.map(p=>p.x))-2,
  maxX:Math.max(...points.map(p=>p.x))+2,
  minZ:Math.min(...points.map(p=>p.z))-2,
  maxZ:Math.max(...points.map(p=>p.z))+2};
}
