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
