import {createSheets,delegateGameEvents} from './ui.mjs';
import {startWalkers} from './walkers.mjs';
import {createView} from './render-ui.mjs';
import {installPortableControls,parsePortableSave,downloadPortableSave} from './portable-save.mjs';

import {createWorld,restoreWorld,serializeWorld,BUILD_EFFECTS,playBuild,playDecision,playIdea,advanceTick} from './chain-engine.mjs';
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
function undo(){const prior=undoStack.pop();if(!prior)return false;const restored=restoreWorld(prior.world);if(!restored)return false;world=restored;state=world.state;placed=world.placed;pendingDecision=prior.pendingDecision;persist();render();$('choiceTrigger').hidden=!pendingDecision;$('undo').disabled=undoStack.length===0;closeSheets();panel('Последнее действие отменено','Мир вернулся к состоянию перед предыдущим решением.');return true;}

function persist(){try{localStorage.setItem(SAVE,serializeWorld(world));}catch{}}
function sync(result){world=result.world;state=world.state;placed=world.placed;persist();render();}
const $=id=>document.getElementById(id);
const {render,panel,caption,embers}=createView(()=>({state,placed,history:world.history}));
const messages={city:['Город построен!','Жители получили дома, но теперь им нужны вода, пища и энергия.'],forest:['Мир меняется!','Лес вырос! Экология и запасы воды постепенно восстанавливаются.'],energy:['Мир меняется!','Электростанция заработала! Энергии стало больше, но бюджет и вода уменьшаются.'],volcano:['Осторожно!','Вулкан проснулся! Появилась геотермальная энергия — и опасная лава.']};
function build(kind,{fromIdea=false}={}){
  if(!Object.hasOwn(BUILD_EFFECTS,kind))return;
  checkpoint();const result=playBuild(world,kind);sync(result);pendingDecision=true;
  caption('+'+({city:' ГОРОД',forest:' ЛЕС',energy:' ЭНЕРГИЯ',volcano:' ВУЛКАН'}[kind]));
  window.dispatchEvent(new CustomEvent('worldAction',{detail:{kind}}));
  if(kind==='volcano')embers();
  let [title,body]=messages[kind];
  const extra=result.events.filter(e=>['shortage','drought','pollution','delayed'].includes(e.type)).map(e=>e.text).join(' ');
  if(extra)body+=' '+extra;
  panel(title,body);$('choiceTrigger').hidden=false;
  if(!fromIdea){choiceCount++;closeSheets();}
}
const {closeSheets,openSheet}=createSheets(document);
function decide(id){
  if(!pendingDecision||!Number.isInteger(id)||id<0||id>3)return null;
  checkpoint();const result=playDecision(world,id);sync(result);pendingDecision=false;$('choiceTrigger').hidden=true;
  panel('Последствия выбора',result.events[0].text);
  window.dispatchEvent(new CustomEvent('worldAction',{detail:{kind:'choice'}}));
  closeSheets();
}
function submitIdea(input){
  const result=playIdea(world,input);
  if(!result.recognized){
    panel('Нужно уточнить идею',result.reason);closeSheets();return;
  }
  checkpoint();sync(result);pendingDecision=true;
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
$('choiceTrigger').onclick=()=>openSheet('choiceBox');$('closeDialog').onclick=()=>$('dialog').classList.add('hidden');$('askIdea').onclick=()=>openSheet('ideaBox');$('showHelp').onclick=()=>openSheet('menuBox');$('showMenu').onclick=()=>openSheet('menuBox');$('closeChoices').onclick=closeSheets;$('closeIdea').onclick=closeSheets;$('closeMenu').onclick=closeSheets;$('ideaFromChoices').onclick=()=>openSheet('ideaBox');
delegateGameEvents(document,{build,decide,openSheet});
$('ideaForm').onsubmit=e=>{e.preventDefault();const t=$('ideaText').value.trim();if(t)submitIdea(t)};
$('restart').onclick=()=>{world=createWorld();state=world.state;placed=world.placed;choiceCount=0;pendingDecision=false;undoStack.length=0;$('undo').disabled=true;try{localStorage.removeItem(SAVE);}catch{}$('choiceTrigger').hidden=true;render();closeSheets();panel('Злой Джинн:','Этот мир пока пуст и ждёт твоего решения. Выбери, с чего начать, или поделись своей идеей!')};
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
  persist();render();$('choiceTrigger').hidden=!pendingDecision;
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
window.__chainReaction={build,getState:()=>({...state}),getPlaced:()=>({...placed}),getHistory:()=>world.history.map(e=>({...e})),submitIdea,decide,undo,advance:nextTurn,importSave,openChoices:()=>openSheet('choiceBox')};
// The native Scratch file uses identical starting resources and native event-driven sprite code.
render();$('choiceTrigger').hidden=!pendingDecision;
})();
