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
