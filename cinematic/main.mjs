import {createSheets,delegateGameEvents} from './ui.mjs';
import {startWalkers} from './walkers.mjs';
import {createView} from './render-ui.mjs';
import {installPortableControls,parsePortableSave,downloadPortableSave} from './portable-save.mjs';
import {interpretGameIdea} from './ai-client.mjs';

import {createWorld,restoreWorld,serializeWorld,BUILD_EFFECTS,playBuild,playDecision,playIdea,playCustomDecision,quoteBuild,quoteIdea,getDecisionOptions,advanceTick,getGenieChoices} from './chain-engine.mjs';
(()=>{'use strict';
const SAVE='chain-reaction-world-v1';
let saved=null;try{saved=restoreWorld(localStorage.getItem(SAVE));}catch{}
let world=saved||createWorld(),state=world.state,placed=world.placed,choiceCount=0;
function hasPendingChoice(saved){
  return saved.state.turn>0 &&
    saved.history.some(event=>event.type==='action'&&event.tick===saved.state.turn) &&
    !saved.history.some(event=>event.type==='decision'&&event.tick===saved.state.turn);
}
let pendingDecision=hasPendingChoice(world);
const undoStack=[];
function checkpoint(){undoStack.push({world:serializeWorld(world),pendingDecision});if(undoStack.length>20)undoStack.shift();$('undo').disabled=false;}
function undo(){const prior=undoStack.pop();if(!prior)return false;const restored=restoreWorld(prior.world);if(!restored)return false;world=restored;state=world.state;placed=world.placed;pendingDecision=prior.pendingDecision;persist();render();refreshChoices();$('choiceTrigger').hidden=!pendingDecision;$('undo').disabled=undoStack.length===0;closeSheets();panel('Последнее действие отменено','Мир вернулся к состоянию перед предыдущим решением.');return true;}

function persist(){try{localStorage.setItem(SAVE,serializeWorld(world));}catch{}}
function sync(result){world=result.world;state=world.state;placed=world.placed;persist();render();refreshChoices();}
const $=id=>document.getElementById(id);
const {render,panel,caption,embers}=createView(()=>({state,placed,history:world.history}));
const RESOURCE_NAMES={population:'Люди',power:'Энергия',water:'Вода',food:'Еда',eco:'Экология',budget:'Бюджет'};
function deltaSummary(before,after){
  const changed=Object.keys(RESOURCE_NAMES).filter(key=>before[key]!==after[key])
    .map(key=>RESOURCE_NAMES[key]+': '+(after[key]-before[key]>0?'+':'')+(after[key]-before[key]));
  return changed.length?'Фактически: '+changed.join('; ')+'.':'Показатели не изменились.';
}
function refreshChoices(){const scenario=getGenieChoices(world);$('choiceTitle').textContent='Злой Джинн: '+scenario.title;
  document.querySelectorAll('[data-decision]').forEach(button=>{button.textContent=scenario.choices[Number(button.dataset.decision)].label;});}
const messages={city:['Город построен!','Жители получили дома, но теперь им нужны вода, пища и энергия.'],forest:['Мир меняется!','Лес вырос! Экология и запасы воды постепенно восстанавливаются.'],energy:['Мир меняется!','Электростанция заработала! Энергии стало больше, но бюджет и вода уменьшаются.'],volcano:['Осторожно!','Вулкан проснулся! Появилась геотермальная энергия — и опасная лава.']};
function build(kind,{fromIdea=false}={}){
  if(!Object.hasOwn(BUILD_EFFECTS,kind))return;
  if(pendingDecision){openSheet('choiceBox');return;}
  const quote=quoteBuild(world,kind);
  if(!quote.allowed){panel('Недостаточно бюджета',quote.reason);return;}
  const before={...state};
  checkpoint();const result=playBuild(world,kind);sync(result);pendingDecision=true;
  caption('+'+({city:' ГОРОД',forest:' ЛЕС',energy:' ЭНЕРГИЯ',volcano:' ВУЛКАН'}[kind]));
  window.dispatchEvent(new CustomEvent('worldAction',{detail:{kind}}));
  if(kind==='volcano')embers();
  let [title,body]=messages[kind];
  const extra=result.events.filter(e=>['shortage','drought','pollution','hunger','delayed'].includes(e.type)).map(e=>e.text).join(' ');
  body+=' '+deltaSummary(before,state);
  if(extra)body+=' Цепная реакция: '+extra;
  panel(title,body);$('choiceTrigger').hidden=false;
  if(!fromIdea){choiceCount++;closeSheets();}
}
const sheets=createSheets(document),closeSheets=sheets.closeSheets;
function openSheet(id){if(id==='choiceBox')refreshChoices();sheets.openSheet(id);}
function decide(id){
  if(!pendingDecision||!Number.isInteger(id)||id<0||id>3)return null;
  const before={...state};checkpoint();const result=playDecision(world,id);sync(result);pendingDecision=false;$('choiceTrigger').hidden=true;
  const decision=result.events.find(event=>event.type==='decision');
  const chain=result.events.filter(event=>event.type!=='decision').map(event=>event.text).join(' ');
  panel('Последствия выбора',(decision?.text||'Решение принято.')+(chain?' '+chain:'')+' '+deltaSummary(before,state));
  window.dispatchEvent(new CustomEvent('worldAction',{detail:{kind:'choice'}}));
  closeSheets();
}
function submitIdea(input,meta=null){
  const quote=quoteIdea(world,input);
  if(!quote.allowed){
    panel(quote.actions.length?'Недостаточно бюджета':'Нужно уточнить идею',quote.reason);
    closeSheets();return false;
  }
  const asDecision=pendingDecision,before={...state};
  const result=asDecision?playCustomDecision(world,input):playIdea(world,input);
  if(!result.recognized){
    panel('Нужно уточнить идею',result.reason);closeSheets();return false;
  }
  checkpoint();sync(result);pendingDecision=!asDecision;
  if(meta?.original){
    const event=[...world.history].reverse().find(e=>(e.type==='action'||e.type==='decision')&&e.tick===state.turn);
    if(event){event.originalPrompt=String(meta.original).slice(0,800);event.aiProvider=String(meta.provider||'').slice(0,50);persist();}
  }
  const names={city:'город',forest:'лес',energy:'энергетика',volcano:'вулкан',irrigation:'орошение',recycling:'очистка воды',farm:'ферма'};
  for(const kind of result.actions){
    window.dispatchEvent(new CustomEvent('worldAction',{detail:{kind}}));
    if(kind==='volcano')embers();
  }
  caption('+'+result.actions.map(x=>names[x]).join(', '));
  const effects=result.events.filter(e=>['shortage','drought','pollution','hunger','delayed'].includes(e.type)).map(e=>e.text).join(' ');
  const notes=meta?(' Источник: '+String(meta.provider||'ИИ')+'.'+
    (meta.styles?.length?' Запрошен стиль '+meta.styles.join(', ')+', но пока показана базовая графика.':'')+
    (meta.unsupported?.length?' Пока не реализовано: '+meta.unsupported.join('; ')+'.':'')):'';
  panel(asDecision?'Твоё пятое решение':'Джинн рассчитал идею',
    'Распознано: '+result.actions.map(x=>names[x]).join(', ')+'. Стоимость: '+quote.cost+
    '. '+deltaSummary(before,state)+(effects?' Цепная реакция: '+effects:'')+notes);
  $('choiceTrigger').hidden=!pendingDecision;closeSheets();
  return true;
}
$('choiceTrigger').onclick=()=>openSheet('choiceBox');$('closeDialog').onclick=()=>$('dialog').classList.add('hidden');$('askIdea').onclick=()=>openSheet('ideaBox');$('showHelp').onclick=()=>openSheet('menuBox');$('showMenu').onclick=()=>openSheet('menuBox');$('closeChoices').onclick=closeSheets;$('closeIdea').onclick=closeSheets;$('closeMenu').onclick=closeSheets;$('ideaFromChoices').onclick=()=>openSheet('ideaBox');
delegateGameEvents(document,{build,decide,openSheet});
let aiPending=false;
$('ideaForm').onsubmit=async e=>{
  e.preventDefault();
  if(aiPending)return;
  const t=$('ideaText').value.trim();if(!t)return;
  const button=$('sendIdea'),status=$('aiProgress');
  aiPending=true;button.disabled=true;button.textContent='ИИ разбирает идею…';status.textContent='Проверяем сценарий';
  try{
    const idea=await interpretGameIdea(t,$('aiProvider').value,{...state,placed:{...placed}});
    if(!idea.commandText){
      closeSheets();panel('Идея пока не поддерживается',idea.unsupported.join('; ')||'ИИ не нашёл известного механизма. Мир не изменён.');return;
    }
    submitIdea(idea.commandText,{original:t,provider:idea.provider,styles:idea.styles,unsupported:idea.unsupported});
  }catch{
    // Offline compatibility: only pre-existing, deterministic keyword mechanics.
    const quote=quoteIdea(world,t);
    if(quote.actions.length)submitIdea(t,{original:t,provider:'офлайн'});
    else{closeSheets();panel('ИИ временно недоступен','Неизвестная идея не изменила мир. Попробуй позже или выбери известный объект.');}
  }finally{aiPending=false;button.disabled=false;button.textContent='Отправить идею ↗';status.textContent='';}
};
$('restart').onclick=()=>{world=createWorld();state=world.state;placed=world.placed;choiceCount=0;pendingDecision=false;undoStack.length=0;$('undo').disabled=true;try{localStorage.removeItem(SAVE);}catch{}$('choiceTrigger').hidden=true;render();refreshChoices();closeSheets();panel('Злой Джинн:','Этот мир пока пуст и ждёт твоего решения. Выбери, с чего начать, или поделись своей идеей!')};
$('undo').onclick=undo;
$('fullscreenBtn').onclick=async()=>{if(document.fullscreenEnabled&&$('game').requestFullscreen){try{await $('game').requestFullscreen();closeSheets();return}catch(e){}}$('fullscreenHint').hidden=false;};
$('scratchLaunch').onclick=function(){this.href=new URL('../player/',location.href).href};
// A build does not have to be followed by another build: time can advance independently.
function nextTurn(){
  checkpoint();
  const result=advanceTick(world);sync(result);
  pendingDecision=false;$('choiceTrigger').hidden=true;
  const messages=result.events.map(event=>event.text).join(' ')||'Мир прожил ещё один ход.';
  panel('Ход '+state.turn,messages+' Вода: '+state.water+', еда: '+state.food+'.');
  caption('ХОД '+state.turn);
  window.dispatchEvent(new CustomEvent('worldAction',{detail:{kind:'tick'}}));
}
function importSave(raw){
  const parsed=parsePortableSave(raw,restoreWorld);
  if(!parsed.world){panel('Импорт не выполнен',parsed.error);return false;}
  checkpoint();world=parsed.world;state=world.state;placed=world.placed;
  pendingDecision=hasPendingChoice(world);
  persist();render();refreshChoices();$('choiceTrigger').hidden=!pendingDecision;
  closeSheets();panel('Мир восстановлен','Сохранение загружено. Ход '+state.turn+'. Можно продолжать игру.');
  return true;
}
installPortableControls(document,{
  onTick:nextTurn,
  onExport:()=>downloadPortableSave(document,serializeWorld(world)),
  onImport:importSave,
  onError:message=>panel('Импорт не выполнен',message)
});
startWalkers($('people'));
// Desktop, iPad and iPhone fullscreen: CSS paints directly to 100dvh, rather than embedding a 4:3 iframe with white margins.
window.__chainReaction={build,getState:()=>({...state}),getPlaced:()=>({...placed}),getHistory:()=>world.history.map(e=>({...e})),getDecisionOptions:()=>getDecisionOptions(world),quoteBuild:kind=>quoteBuild(world,kind),quoteIdea:input=>quoteIdea(world,input),submitIdea,decide,undo,advance:nextTurn,importSave,openChoices:()=>openSheet('choiceBox')};
// The native Scratch file uses identical starting resources and native event-driven sprite code.
render();refreshChoices();$('choiceTrigger').hidden=!pendingDecision;
})();
