import {BLOCK_TYPES,createFactoryWorld,placeBlock,tickFactoryWorld,serializeFactoryWorld,restoreFactoryWorld,terrainAt,generateChunk,connectedMask,worldToScreen,screenToWorld,viewportBounds,isVisibleTile,visibleChunks} from './world-block-factory.mjs';
import {createWorld as createEconomy,playBuild,quoteBuild,restoreWorld as restoreEconomy,serializeWorld as serializeEconomy} from './chain-engine.mjs';
import {parseIdeaActions} from './idea-parser.mjs';
const $=id=>document.getElementById(id),canvas=$('map'),ctx=canvas.getContext('2d',{alpha:false});
const params=new URLSearchParams(location.search),id=params.get('world')||'chain-main';
const WORLD_ID=/^[a-z0-9-]{1,64}$/.test(id)?id:'chain-main',SAVE='voxel-factory-v1-'+WORLD_ID;
let world=createFactoryWorld(270927,WORLD_ID),economy=createEconomy(),camera={x:0,z:0},selected='forest',dirty=true;
try{const s=JSON.parse(localStorage.getItem(SAVE));const w=restoreFactoryWorld(s?.blocks),e=restoreEconomy(s?.economy);if(w&&e&&w.world_id===WORLD_ID){world=w;economy=e;camera=s.camera||camera;}}catch{}
let width=1,height=1,scale=1,last=0,frames=0,frameFrom=performance.now();
const background=document.createElement('canvas'),bg=background.getContext('2d');
const cache=new Map(),label={city:'Город',forest:'Лес',volcano:'Вулкан',energy:'Энергия',river:'Река'};
const notice=text=>{$('events').textContent=text;};
function persist(){try{localStorage.setItem(SAVE,JSON.stringify({version:1,blocks:serializeFactoryWorld(world),economy:serializeEconomy(economy),camera}));}catch(e){notice('Не удалось сохранить мир: '+e.message);}}
function select(type){selected=type;document.querySelectorAll('[data-build]').forEach(b=>b.classList.toggle('active',b.dataset.build===type));notice('Выбран объект: '+label[type]+'. Нажми на видимый участок карты.');}
function resize(){width=canvas.clientWidth;height=canvas.clientHeight;scale=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);ctx.setTransform(scale,0,0,scale,0,0);dirty=true;}
window.addEventListener('resize',resize);resize();
function chunk(cx,cz){const key=cx+','+cz;if(!cache.has(key))cache.set(key,generateChunk(world.seed,cx,cz));return cache.get(key);}
function material(x,z){const cx=Math.floor(x/16),cz=Math.floor(z/16);return chunk(cx,cz).tiles[((z%16+16)%16)*16+(x%16+16)%16];}
const poly=(pts,color)=>{ctx.beginPath();ctx.moveTo(...pts[0]);for(const p of pts.slice(1))ctx.lineTo(...p);ctx.closePath();ctx.fillStyle=color;ctx.fill();};
function prism(x,y,w,rise,top,left='#384b39',right='#526148',d=w/2){
 poly([[x-w/2,y-rise],[x,y-rise+d/2],[x,y+d/2],[x-w/2,y]],left);
 poly([[x,y-rise+d/2],[x+w/2,y-rise],[x+w/2,y],[x,y+d/2]],right);
 poly([[x,y-rise-d/2],[x+w/2,y-rise],[x,y-rise+d/2],[x-w/2,y-rise]],top);
}
function ground(x,y,type){
 poly([[x-29,y],[x,y+14.5],[x,y+23],[x-29,y+8]],'#655449');
 poly([[x,y+14.5],[x+29,y],[x+29,y+8],[x,y+23]],'#78614c');
 poly([[x,y-14.5],[x+29,y],[x,y+14.5],[x-29,y]],BLOCK_TYPES[type].color);
}
function drawBlock(b,x,y,time){
 if(b.type==='forest'){
  prism(x-7,y,8,20,'#836048');
  prism(x-7,y-19,33,23,'#5da45c','#326e38','#478a3a',18);
  prism(x+12,y+2,7,15,'#9a7047');
  prism(x+12,y-15,25,20,'#72b967','#387a43','#559e51',16);
  return;
 }
 if(b.type==='burnt_forest'){prism(x-8,y,7,27,'#393634');prism(x+12,y,6,18,'#48423a');return;}
 if(b.type==='river'){
  ground(x,y,'river');const m=connectedMask(world,b,'water');
  ctx.strokeStyle='#c4edf0';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y);
  if(m&1)ctx.lineTo(x+13,y-7);
  if(m&2){ctx.moveTo(x,y);ctx.lineTo(x+13,y+7);}
  if(m&4){ctx.moveTo(x,y);ctx.lineTo(x-13,y+7);}
  if(m&8){ctx.moveTo(x,y);ctx.lineTo(x-13,y-7);}
  ctx.stroke();return;
 }
 if(b.type==='city'){
  prism(x-13,y+1,27,29,'#d6bc8e','#897866','#af987c');
  prism(x+13,y+5,26,36,'#e5d1ac','#9f8b77','#c2ad92');
  prism(x,y-5,16,15,'#bea88c');return;
 }
 if(b.type==='energy'){
  prism(x,y+4,36,24,'#bcbfc0','#596875','#819399');
  prism(x+5,y-22,10,31,'#e9d89d','#8b8970','#b7a579');
  ctx.fillStyle='#fee9a1';ctx.fillRect(x+2,y-59+Math.sin(time/400)*2,8,9);return;
 }
 if(b.type==='volcano'){
  prism(x,y+9,79,34,'#675550','#3b393b','#5c4543',39);
  prism(x,y-22,46,27,'#484140','#332e33','#4d4041',24);
  poly([[x,y-65],[x+16,y-52],[x,y-44],[x-16,y-52]],'#ff8429');return;
 }
 if(b.type==='road')prism(x,y,54,2,'#95816f','#6f6252','#84715c',19);
}
const metrics={fps:0,drawCalls:0,visibleTiles:0,cacheChunks:0};
function draw(time){
 const bounds=viewportBounds(camera,width,height),active=new Set(visibleChunks(bounds,1).map(c=>c.join(',')));
 for(const key of cache.keys())if(!active.has(key))cache.delete(key);
 if(dirty){ctx.fillStyle='#a3b3ab';ctx.fillRect(0,0,width,height);
 const occupied=new Map(world.blocks.filter(b=>b.type!=='villager').map(b=>[b.x+','+b.z,b]));
 let tiles=0;
 for(let sum=bounds.minX+bounds.minZ;sum<=bounds.maxX+bounds.maxZ;sum++){
  for(let x=bounds.minX;x<=bounds.maxX;x++){
   const z=sum-x;if(z<bounds.minZ||z>bounds.maxZ)continue;
   const s=worldToScreen(x,z,camera,width,height);
   if(s.x< -90||s.x>width+90||s.y< -100||s.y>height+90)continue;
   const b=occupied.get(x+','+z);
   ground(s.x,s.y,material(x,z));if(b)drawBlock(b,s.x,s.y,time);tiles++;
  }
 }
 metrics.visibleTiles=tiles;background.width=canvas.width;background.height=canvas.height;bg.drawImage(canvas,0,0);dirty=false;
 }else ctx.drawImage(background,0,0,width,height);
 for(const b of world.blocks.filter(b=>b.type==='volcano')){
  const river=world.blocks.filter(r=>r.type==='river').sort((a,c)=>(Math.abs(a.x-b.x)+Math.abs(a.z-b.z))-(Math.abs(c.x-b.x)+Math.abs(c.z-b.z)))[0];
  if(!river)continue;let x=b.x,z=b.z,reach=b.state.lavaReach||0;
  while(reach-->0&&(x!==river.x||z!==river.z)){
   if(x!==river.x)x+=Math.sign(river.x-x);else z+=Math.sign(river.z-z);
   const p=worldToScreen(x,z,camera,width,height);prism(p.x,p.y,15,6,'#f98636','#a73720','#d45824',8);
  }
 }
 for(const e of world.events.filter(e=>e.type==='steam')){
  const p=worldToScreen(e.x,e.z,camera,width,height);
  for(let i=0;i<3;i++){ctx.fillStyle='rgba(241,250,239,.55)';ctx.beginPath();ctx.arc(p.x+Math.sin(time/510+i)*8,p.y-14-((time/55+i*18)%70),6+i*3,0,Math.PI*2);ctx.fill();}
 }
 for(const b of world.blocks.filter(b=>b.type==='villager'&&!b.state.evacuated)){
  const p=worldToScreen(b.x+Math.sin(time/1700+b.seed)*.55,b.z+Math.cos(time/2100+b.seed)*.4,camera,width,height);
  ctx.fillStyle='#252b32';ctx.fillRect(p.x-3,p.y-13,6,12);ctx.fillStyle='#dec49f';ctx.beginPath();ctx.arc(p.x,p.y-16,4,0,Math.PI*2);ctx.fill();
 }
 metrics.cacheChunks=cache.size;metrics.drawCalls=metrics.visibleTiles*3+world.blocks.length*9;
 $('pos').textContent=Math.floor(camera.x)+','+Math.floor(camera.z)+' · '+world.turn;
}
const minFrame=matchMedia('(pointer:coarse)').matches?32:16;
function frame(t){requestAnimationFrame(frame);if(t-last<minFrame)return;last=t;draw(t);frames++;
 if(t-frameFrom>1000){metrics.fps=Math.round(frames*1000/(t-frameFrom));frames=0;frameFrom=t;$('fps').textContent='FPS: '+metrics.fps;}
}
requestAnimationFrame(frame);
function build(type,x,z){
 const bounds=viewportBounds(camera,width,height);
 if(!isVisibleTile(x,z,bounds))return notice('Строить можно только на видимом участке.');
 if(type!=='river'){
  const q=quoteBuild(economy,type);if(!q.allowed)return notice(q.reason);
 }
 try{placeBlock(world,type,x,z,bounds);}catch(e){return notice(e.message);}
 if(type!=='river')economy=playBuild(economy,type).world;
 dirty=true;persist();notice(label[type]+' создан: '+x+','+z+'. Мир сохранён локально.');
}
function nextTurn(){
 const events=tickFactoryWorld(world);if(events.some(e=>e.type==='forest_burned'))dirty=true;persist();
 const names={steam:'Лава достигла реки — появился пар!',forest_burned:'Лес загорелся!',resident_evacuated:'Жители покидают опасную зону!'};
 if(events.length)notice(events.map(e=>names[e.type]||e.type).join(' '));
 return events;
}
let drag=null;
canvas.addEventListener('pointerdown',e=>{
 if(e.button!==0&&e.pointerType==='mouse')return;
 drag={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove',e=>{
 if(!drag||drag.id!==e.pointerId)return;
 const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
 if(Math.abs(dx)+Math.abs(dy)>4)drag.moved=true;
 if(drag.moved){camera.x-=dx/58+dy/29;camera.z-=dy/29-dx/58;dirty=true;}
 drag.x=e.clientX;drag.y=e.clientY;
});
canvas.addEventListener('pointerup',e=>{
 if(!drag||drag.id!==e.pointerId)return;
 if(!drag.moved){const r=canvas.getBoundingClientRect();const p=screenToWorld(e.clientX-r.left,e.clientY-r.top,camera,width,height);build(selected,p.x,p.z);}
 drag=null;persist();
});
canvas.addEventListener('pointercancel',()=>{drag=null;persist();});
document.querySelectorAll('[data-build]').forEach(b=>b.onclick=()=>select(b.dataset.build));
$('nextTurn').onclick=()=>nextTurn();
$('reset').onclick=()=>{localStorage.removeItem(SAVE);world=createFactoryWorld(270927,WORLD_ID);economy=createEconomy();camera={x:0,z:0};dirty=true;persist();notice('Мир очищен. Вулканов нет; путники идут по пустой земле.');};
$('idea').onclick=()=>{$('ideaForm').hidden=false;$('ideaText').focus();};
$('closeIdea').onclick=()=>{$('ideaForm').hidden=true;};
$('ideaForm').onsubmit=e=>{
 e.preventDefault();const kinds=parseIdeaActions($('ideaText').value);
 const kind=kinds.find(k=>['city','forest','volcano','energy'].includes(k));
 $('ideaForm').hidden=true;
 if(kind)select(kind);else notice('Для первой версии доступны идеи о городе, лесе, вулкане и энергии.');
};
setInterval(()=>{if(world.blocks.some(b=>b.type==='volcano'))nextTurn();},2400);
select('forest');
if(world.turn>0){
 const labels={steam:'пар над рекой',forest_burned:'выгоревший лес',resident_evacuated:'эвакуация жителей'};
 const unique=[...new Set(world.events.filter(e=>labels[e.type]).map(e=>labels[e.type]))];
 if(unique.length)notice('Сохранённый мир · ход '+world.turn+': '+unique.join(', ')+'.');
}
window.__voxelFactory={getWorld:()=>structuredClone(world),getEconomy:()=>structuredClone(economy),getStats:()=>({...metrics}),getCamera:()=>({...camera})};
