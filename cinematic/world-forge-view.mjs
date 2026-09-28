import {TILE,tileHash,forgeOf,RECIPES,riverSockets,
 tileToScreen,screenToTile,visibleTileBounds} from './world-forge-core.mjs';

// Paint only the visible deterministic chunk window. No simulation lives here.
export function mountWorldForge(doc,bridge){
 const game=doc.getElementById('game');
 game.classList.add('world-forge-enabled');
 const canvas=doc.createElement('canvas');
 canvas.id='worldForgeMap';canvas.setAttribute('aria-label','Карта World Forge');
 game.insertBefore(canvas,game.querySelector('.hud'));
 const ctx=canvas.getContext('2d',{alpha:false});
 const effects=doc.createElement('div');
 effects.className='forge-effects';game.insertBefore(effects,game.querySelector('.hud'));
 const bar=doc.createElement('div');bar.className='forge-toolbar';
 bar.setAttribute('role','toolbar');bar.setAttribute('aria-label','World Forge');
 bar.innerHTML='<button type="button" data-forge-tool="pan">✋ Обзор</button>'+
 '<button type="button" data-forge-tool="forest">🌲 Лес</button>'+
 '<button type="button" data-forge-tool="river">💧 Река</button>'+
 '<span id="forgeStatus" role="status" aria-live="polite">Перетаскивай карту</span>';
 game.insertBefore(bar,game.querySelector('.action-dock'));
 const status=bar.querySelector('#forgeStatus'),sprites=new Map();
 const view={width:1,height:1},dpr=()=>Math.min(1.6,devicePixelRatio||1);
 let tool='pan',camera={...forgeOf({forge:bridge.forgeSnapshot()}).camera};
 let pointer=null,latest=0,lastSnapshot=null,dirty=true;
 const note=text=>{status.textContent=text;};
 function select(value){
  tool=value;for(const b of bar.querySelectorAll('button'))
   b.setAttribute('aria-pressed',String(b.dataset.forgeTool===tool));
  canvas.style.cursor=tool==='pan'?'grab':'crosshair';
  note(tool==='pan'?'Тяни карту мышью или пальцем':
   'Выбран '+(tool==='forest'?'лес':'речной участок')+'. Нажми на землю.');
 }
 bar.querySelectorAll('button').forEach(b=>b.onclick=()=>select(b.dataset.forgeTool));
 select('pan');
 function viewport(){
  const w=canvas.clientWidth,h=canvas.clientHeight,scale=dpr();
  if(!w||!h)return false;
  view.width=w;view.height=h;
  const px=Math.max(1,Math.floor(w*scale)),py=Math.max(1,Math.floor(h*scale));
  if(canvas.width!==px||canvas.height!==py){canvas.width=px;canvas.height=py;}
  ctx.setTransform(px/w,0,0,py/h,0,0);return true;
 }
 function diamond(x,y,fill,stroke){
  ctx.beginPath();ctx.moveTo(x,y-TILE.height/2);
  ctx.lineTo(x+TILE.width/2,y);ctx.lineTo(x,y+TILE.height/2);
  ctx.lineTo(x-TILE.width/2,y);ctx.closePath();
  ctx.fillStyle=fill;ctx.fill();
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}
 }
 function terrain(x,z,point,seed){
  const n=tileHash(seed,x,z);
  const tones=['#735646','#805e48','#8e6b50','#946d52','#775a49','#80644d'];
  const color=tones[n%tones.length];
  diamond(point.x,point.y,color,'#342f2b55');
  if(n%7===0){ctx.fillStyle='#bfab7855';
   ctx.fillRect(point.x-15,point.y+4,12,2);}
  if(n%11===0){ctx.fillStyle='#b8a07b';
   ctx.fillRect(point.x+10,point.y-1,5,3);}
 }
 function paintForest(block,point){
  diamond(point.x,point.y,'#49623d','#9ab172');
  let seed=block.seed;
  for(let i=0;i<4;i++){
   seed=tileHash(seed,i,block.x);
   const ox=(seed%49)-24,oy=((seed>>>8)%20)-10;
   const h=17+((seed>>>16)%18),px=point.x+ox,py=point.y+oy;
   ctx.fillStyle='#372d27';ctx.fillRect(px-3,py-h+12,6,h-7);
   ctx.fillStyle=['#315a39','#447a45','#5d8542'][seed%3];
   ctx.beginPath();ctx.moveTo(px,py-h-15);
   ctx.lineTo(px-13,py-h+12);ctx.lineTo(px+13,py-h+12);
   ctx.closePath();ctx.fill();
   ctx.fillStyle='#81a45d77';ctx.fillRect(px-2,py-h-9,4,5);
  }
 }
 function paintRiver(block,point,all){
  const joins=riverSockets(all,block.x,block.z);
  diamond(point.x,point.y,'#716b4e','#8c8053');
  const ends=[];
  if(joins.north)ends.push([-TILE.width/2,0]);
  if(joins.east)ends.push([0,-TILE.height/2]);
  if(joins.south)ends.push([TILE.width/2,0]);
  if(joins.west)ends.push([0,TILE.height/2]);
  if(!ends.length)ends.push([-TILE.width/2,0],[TILE.width/2,0]);
  if(ends.length===1)ends.push([0,0]);
  ctx.beginPath();
  for(const [dx,dy]of ends){ctx.moveTo(point.x,point.y);
   ctx.lineTo(point.x+dx,point.y+dy);}
  ctx.lineCap='butt';ctx.strokeStyle='#2c8baa';ctx.lineWidth=27;ctx.stroke();
  ctx.strokeStyle='#64bdd0';ctx.lineWidth=13;ctx.stroke();
  ctx.fillStyle='#75d8df';ctx.fillRect(point.x-13,point.y-2,16,2);
 }
