import {createWorld,restoreWorld,serializeWorld,BUILD_EFFECTS,playBuild,playDecision,playIdea,getGenieChoices,advanceTick} from './chain-engine.mjs';
(()=>{'use strict';
const SAVE='chain-reaction-world-v1';
let saved=null;try{saved=restoreWorld(localStorage.getItem(SAVE));}catch{}
let world=saved||createWorld(),state=world.state,placed=world.placed,choiceCount=0;
let undoStack=[],lastFocus=null,saveWarningShown=false;
const reduceMotion=matchMedia('(prefers-reduced-motion:reduce)');
function persist(){try{localStorage.setItem(SAVE,serializeWorld(world));}
catch{if(!saveWarningShown){saveWarningShown=true;panel('Сохранение недоступно','Браузер не разрешил сохранить игру. Экспорт доступен через меню.');}}}
function remember(){undoStack.push(serializeWorld(world));if(undoStack.length>20)undoStack.shift();}
function sync(result){world=result.world;state=world.state;placed=world.placed;persist();render();}
const $=id=>document.getElementById(id);const cap=$('caption');const art={city:$('cityArt'),forest:$('forestArt'),energy:$('energyArt'),volcano:$('volcanoArt')};
const messages={city:['Город построен!','Жители получили дома, но теперь им нужны вода, пища и энергия.'],forest:['Мир меняется!','Лес вырос! Экология и запасы воды постепенно восстанавливаются.'],energy:['Мир меняется!','Электростанция заработала! Энергии стало больше, но бюджет и вода уменьшаются.'],volcano:['Осторожно!','Вулкан проснулся! Появилась геотермальная энергия — и опасная лава.']};
function render(){for(const [k,v]of Object.entries(state))document.querySelectorAll(`[data-stat="${k}"]`).forEach(n=>{n.textContent=String(v);n.closest('.stat').setAttribute('aria-label',n.previousElementSibling?.textContent+' '+v)});
for(const [k,v]of Object.entries(placed))art[k].classList.toggle('active',v>0);$('rotor').classList.toggle('on',placed.energy>0);$('scenery').classList.toggle('developed',Object.values(placed).reduce((a,b)=>a+b,0)>=4);$('undoTurn').disabled=undoStack.length===0;window.dispatchEvent(new CustomEvent('worldStateUpdate',{detail:{...state,placed:{...placed}}}))}
function panel(title,body){$('dialogTitle').textContent=title;$('dialogText').textContent=body;$('dialog').classList.remove('hidden')}
function caption(str){cap.textContent=str;cap.classList.remove('animate');if(!reduceMotion.matches){void cap.offsetWidth;cap.classList.add('animate')}}
function embers(){if(reduceMotion.matches)return;for(let j=0;j<9;j++){const e=document.createElement('i');e.className='spark';e.style.right=(8+Math.random()*20)+'%';e.style.top=(24+Math.random()*14)+'%';e.style.setProperty('--wx',(Math.random()*130-60)+'px');e.style.animationDelay=(Math.random()*1.5)+'s';$('game').appendChild(e);e.addEventListener('animationend',()=>e.remove(),{once:true});setTimeout(()=>e.remove(),5500)}}
function build(kind,{fromIdea=false}={}){
  if(!Object.hasOwn(BUILD_EFFECTS,kind))return;
  remember();const result=playBuild(world,kind);sync(result);
  caption('+'+({city:' ГОРОД',forest:' ЛЕС',energy:' ЭНЕРГИЯ',volcano:' ВУЛКАН'}[kind]));
  window.dispatchEvent(new CustomEvent('worldAction',{detail:{kind}}));
  if(kind==='volcano')embers();
  let [title,body]=messages[kind];
  const extra=result.events.filter(e=>['shortage','drought','pollution','delayed'].includes(e.type)).map(e=>e.text).join(' ');
  if(extra)body+=' '+extra;
  panel(title,body);$('choiceTrigger').hidden=false;
  if(!fromIdea){choiceCount++;closeSheets();}
}
const sheetIds=['choiceBox','ideaBox','menuBox'];
function activeSheet(){return sheetIds.map(id=>$(id)).find(sheet=>!sheet.hidden)}
function closeSheets(returnFocus=true){
  for(const id of sheetIds)$(id).hidden=true;
  for(const root of document.querySelectorAll('.hud,.action-dock,#dialog'))root.inert=false;
  if(returnFocus&&lastFocus?.isConnected)lastFocus.focus();
  if(returnFocus)lastFocus=null;
}
function openSheet(id){
  if(!activeSheet())lastFocus=document.activeElement;
  closeSheets(false);$(id).hidden=false;
  for(const root of document.querySelectorAll('.hud,.action-dock,#dialog'))root.inert=true;
  (id==='ideaBox'?$('ideaText'):$(id).querySelector('button:not([disabled])'))?.focus();
}
function showChoices(){
  const {resource,choices}=getGenieChoices(world);
  const names={power:'энергии',water:'воды',food:'еды',eco:'экологии'};
  $('choiceTitle').textContent='Злой Джинн: дефицит '+names[resource];
  for(const button of document.querySelectorAll('[data-decision]')){
    const choice=choices[Number(button.dataset.decision)];
    button.textContent=choice.label;button.dataset.choiceId=String(choice.id);
  }
  openSheet('choiceBox');
}
function renderHistory(){
  const list=$('historyList');list.replaceChildren();
  for(const event of world.history.slice(-20).reverse()){
    const li=document.createElement('li');li.textContent='Ход '+event.tick+': '+event.text;list.appendChild(li);
  }
  if(!list.children.length){const li=document.createElement('li');li.textContent='Мир ждёт первого решения.';list.appendChild(li);}
}
function decide(id){
  remember();const result=playDecision(world,id);sync(result);
  const delayed=result.events.filter(event=>event.type==='delayed').map(event=>event.text).join(' ');
  const crises=result.events.filter(event=>['shortage','drought','pollution'].includes(event.type)).map(event=>event.text).join(' ');
  panel('Последствия выбора',[result.choice.message,delayed,crises].filter(Boolean).join(' '));
  window.dispatchEvent(new CustomEvent('worldAction',{detail:{kind:'choice'}}));
  closeSheets();
}
function submitIdea(input){
  const result=playIdea(world,input);
  if(!result.recognized){
    panel('Нужно уточнить идею',result.reason);closeSheets();return;
  }
  remember();sync(result);
  const names={city:'город',forest:'лес',energy:'энергетика',volcano:'вулкан',irrigation:'орошение',recycling:'очистка воды',farm:'ферма'};
  for(const kind of result.actions){
    window.dispatchEvent(new CustomEvent('worldAction',{detail:{kind}}));
    if(kind==='volcano')embers();
  }
  caption('+'+result.actions.map(x=>names[x]).join(', '));
  const effects=result.events.filter(e=>['shortage','drought','pollution','delayed'].includes(e.type)).map(e=>e.text).join(' ');
  panel('Джинн рассчитал идею','Распознано: '+result.actions.map(x=>names[x]).join(', ')+'. Изменения показателей уже применены. '+effects);
  $('choiceTrigger').hidden=false;closeSheets();
}
$('choiceTrigger').onclick=showChoices;$('closeDialog').onclick=()=>$('dialog').classList.add('hidden');$('askIdea').onclick=()=>openSheet('ideaBox');$('showHelp').onclick=()=>{renderHistory();openSheet('menuBox')};$('showMenu').onclick=()=>{renderHistory();openSheet('menuBox')};$('closeChoices').onclick=closeSheets;$('closeIdea').onclick=closeSheets;$('closeMenu').onclick=closeSheets;$('ideaFromChoices').onclick=()=>openSheet('ideaBox');
document.querySelectorAll('.option').forEach(b=>b.addEventListener('click',()=>b.dataset.action==='idea'?openSheet('ideaBox'):build(b.dataset.action)));
document.querySelectorAll('[data-decision]').forEach(b=>b.onclick=()=>decide(Number(b.dataset.choiceId)));
$('ideaForm').onsubmit=e=>{e.preventDefault();const t=$('ideaText').value.trim();if(t)submitIdea(t)};
$('restart').onclick=()=>{world=createWorld();state=world.state;placed=world.placed;choiceCount=0;undoStack=[];try{localStorage.removeItem(SAVE);}catch{}$('choiceTrigger').hidden=true;render();closeSheets();panel('Злой Джинн:','Этот мир пока пуст и ждёт твоего решения. Выбери, с чего начать, или поделись своей идеей!')};
$('fullscreenBtn').onclick=async()=>{if(document.fullscreenEnabled&&$('game').requestFullscreen){try{await $('game').requestFullscreen();closeSheets();return}catch(e){}}$('fullscreenHint').hidden=false;};
$('scratchLaunch').onclick=function(){this.href=new URL('../player/',location.href).href};
const walkers=[],people=$('people');
const coarse=matchMedia('(pointer:coarse)').matches;
for(let i=0;i<(coarse?7:12);i++){
  const element=document.createElement('div');element.className='person';
  element.innerHTML='<div class="head"></div><div class="coat"></div><div class="legs"></div>';
  people.appendChild(element);
  walkers.push({e:element,x:8+Math.random()*84,y:38+Math.random()*34,
    v:(.3+Math.random()*.6)*(Math.random()<.5?-1:1),seed:Math.random()*10});
}
let frameId=0,last=0;const minStep=coarse?42:30;
function frame(now){
  if(document.hidden||reduceMotion.matches){frameId=0;return;}
  frameId=requestAnimationFrame(frame);
  if(now-last<minStep)return;
  const dt=Math.min(.06,(now-last)/1000);last=now;
  for(const w of walkers){
    w.x+=w.v*dt;if(w.x<7||w.x>95)w.v*=-1;
    w.e.style.left=w.x+'%';w.e.style.top=w.y+'%';
    w.e.style.transform='scale('+(.75+(w.y-30)/95)+') translateY('+Math.sin(now/145+w.seed)*1.9+'px)';
    w.e.style.setProperty('--gait',Math.sin(now/150+w.seed)*30+'deg');
  }
}
function toggleAnimation(){
  if(frameId)cancelAnimationFrame(frameId);
  frameId=0;last=performance.now();
  if(!document.hidden&&!reduceMotion.matches)frameId=requestAnimationFrame(frame);
  else for(const w of walkers){w.e.style.left=w.x+'%';w.e.style.top=w.y+'%';}
}
document.addEventListener('visibilitychange',toggleAnimation);
reduceMotion.addEventListener?.('change',toggleAnimation);
toggleAnimation();
function nextTurn(){
  remember();const result=advanceTick(world);sync(result);
  const changes=result.events.map(event=>event.text).join(' ')||'Мир прожил ещё один ход.';
  panel('Ход '+state.turn,changes+' Вода: '+state.water+', еда: '+state.food+'.');
  caption('ХОД '+state.turn);window.dispatchEvent(new CustomEvent('worldAction',{detail:{kind:'tick'}}));
}
function undo(){
  const previous=undoStack.pop();if(!previous)return;
  world=restoreWorld(previous)||createWorld();state=world.state;placed=world.placed;
  persist();render();closeSheets();$('choiceTrigger').hidden=state.turn===0;
  panel('Ход отменён','Состояние мира и отложенные последствия восстановлены.');
}
function exportSave(){
  const blob=new Blob([serializeWorld(world)],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='chain-reaction-save.json';document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('nextTurn').onclick=nextTurn;$('undoTurn').onclick=undo;$('exportSave').onclick=exportSave;
document.addEventListener('keydown',event=>{
  const sheet=activeSheet();if(!sheet)return;
  if(event.key==='Escape'){event.preventDefault();closeSheets();return;}
  if(event.key!=='Tab')return;
  const controls=[...sheet.querySelectorAll('button:not([disabled]),textarea:not([disabled]),a[href]')]
    .filter(element=>element.getClientRects().length>0);
  if(!controls.length)return;
  if(event.shiftKey&&document.activeElement===controls[0]){
    event.preventDefault();controls.at(-1).focus();
  }else if(!event.shiftKey&&document.activeElement===controls.at(-1)){
    event.preventDefault();controls[0].focus();
  }
});
// Desktop, iPad and iPhone fullscreen: CSS paints directly to 100dvh, rather than embedding a 4:3 iframe with white margins.
window.__chainReaction={build,getState:()=>({...state}),getPlaced:()=>({...placed}),getHistory:()=>world.history.map(e=>({...e})),submitIdea,decide,openChoices:showChoices,advance:nextTurn,undo};
// The native Scratch file uses identical starting resources and native event-driven sprite code.
render();$('choiceTrigger').hidden=state.turn===0;
})();
