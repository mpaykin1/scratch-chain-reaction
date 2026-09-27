// Visual-only bridge: the original World Server voxel shape generator feeds a
// static lightweight isometric Canvas layer; it NEVER computes game resources.
import {buildWorldShape} from './world-shape-library.mjs';

const PALETTE={
  1:['#8ca75d','#58793a','#718e4e'],2:['#c3a07a','#916848','#a77e55'],
  3:['#9b9b9f','#62626f','#777786'],4:['#d4b47c','#9d805a','#b59a6a'],
  5:['#b07c4e','#714b37','#8f5d3e'],6:['#7ba65d','#396f44','#588b50'],
  7:['#dee5eb','#a1b0c2','#bdcbdb'],8:['#8dd9e6','#427ca4','#65a9bf'],
  9:['#dbf5fc','#7fb5d1','#abd8e8'],10:['#b48a79','#805a55','#9f7165'],
  11:['#c99f78','#90694f','#ad8161'],12:['#4c525b','#242d39','#353f4c'],
  13:['#a6acb3','#606977','#818b95']
};
const key=(x,y,z)=>x+','+y+','+z;
function polygon(ctx,points,color){
  ctx.beginPath();ctx.moveTo(...points[0]);
  for(const point of points.slice(1))ctx.lineTo(...point);
  ctx.closePath();ctx.fillStyle=color;ctx.fill();
}
export function sceneBlocks(placed,{coarse=false}={}){
  const voxels=[],maxBlocks=coarse?450:900;
  if(Number(placed?.city)>0){
    voxels.push(...buildWorldShape({type:'house',scale:.48},
      {origin:{x:-8,y:0,z:0},maxBlocks}));
  }
  if(Number(placed?.forest)>0){
    const trees=coarse?1:2;
    for(let i=0;i<trees;i++)voxels.push(...buildWorldShape({
      type:'tree',scale:.45,seed:13+i*17},
      {origin:{x:5+i*8,y:0,z:i*3},maxBlocks}));
  }
  return voxels.filter(v=>v.blockType!==0);
}
export function drawIsometric(ctx,voxels,{width=320,height=220,padding=9}={}){
  if(!voxels?.length||width<=2*padding||height<=2*padding)return {faces:0,voxels:0};
  const occupied=new Set(voxels.map(v=>key(v.x,v.y,v.z)));
  const xOf=v=>v.x-v.z,yOf=v=>(v.x+v.z)*.53-v.y*1.16;
  const xs=voxels.map(xOf),ys=voxels.map(yOf);
  const minX=Math.min(...xs)-1,maxX=Math.max(...xs)+1;
  const minY=Math.min(...ys)-1,maxY=Math.max(...ys)+1.1;
  const scale=Math.min((width-2*padding)/(maxX-minX),
    (height-2*padding)/(maxY-minY));
  const offsetX=(width-(maxX+minX)*scale)/2;
  const offsetY=(height-(maxY+minY)*scale)/2;
  const p=(x,y)=>[offsetX+x*scale,offsetY+y*scale];
  let faces=0;
  for(const v of [...voxels].sort((a,b)=>(a.x+a.z+a.y)-(b.x+b.z+b.y))){
    const c=xOf(v),h=yOf(v),colors=PALETTE[v.blockType]||PALETTE[3];
    if(!occupied.has(key(v.x,v.y+1,v.z))){
      polygon(ctx,[p(c,h-1),p(c+1,h-.47),p(c,h+.06),p(c-1,h-.47)],colors[0]);faces++;
    }
    if(!occupied.has(key(v.x+1,v.y,v.z))){
      polygon(ctx,[p(c,h+.06),p(c+1,h-.47),p(c+1,h+.55),p(c,h+1.06)],colors[1]);faces++;
    }
    if(!occupied.has(key(v.x,v.y,v.z+1))){
      polygon(ctx,[p(c-1,h-.47),p(c,h+.06),p(c,h+1.06),p(c-1,h+.55)],colors[2]);faces++;
    }
  }
  return {faces,voxels:voxels.length};
}
export function createWorldServerGraphics(host,{win=window,doc=document}={}){
  if(!host)return {update(){},destroy(){}};
  const canvas=doc.createElement('canvas');
  canvas.className='world-server-isometric';canvas.setAttribute('aria-hidden','true');
  canvas.dataset.source='World_server/shared/world-shape-library.mjs';
  canvas.hidden=true;host.appendChild(canvas);
  const ctx=canvas.getContext('2d',{alpha:true});
  let placed={},signature='';
  const coarse=Boolean(win.matchMedia?.('(pointer:coarse)').matches);
  function paint(){
    if(!ctx||canvas.hidden)return;
    const rect=canvas.getBoundingClientRect(),ratio=Math.min(2,win.devicePixelRatio||1);
    const width=Math.round(rect.width),height=Math.round(rect.height);
    if(!width||!height)return;
    canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
    ctx.setTransform(ratio,0,0,ratio,0,0);
    drawIsometric(ctx,sceneBlocks(placed,{coarse}),{width,height});
  }
  function update(value){
    const next={city:Number(value?.city)||0,forest:Number(value?.forest)||0};
    const nextSignature=JSON.stringify(next);
    if(nextSignature===signature)return;
    signature=nextSignature;placed=next;canvas.hidden=!(next.city||next.forest);
    if(!canvas.hidden)paint();
  }
  win.addEventListener('resize',paint);
  return {update,destroy(){win.removeEventListener('resize',paint);canvas.remove();}};
}
