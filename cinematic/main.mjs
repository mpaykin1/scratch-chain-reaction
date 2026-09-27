import {createSheets,delegateGameEvents} from './ui.mjs';
import {startWalkers} from './walkers.mjs';
import {createView} from './render-ui.mjs';

import {createWorld,restoreWorld,serializeWorld,BUILD_EFFECTS,playBuild,playDecision,playIdea} from './chain-engine.mjs';
(()=>{'use strict';
const SAVE='chain-reaction-world-v1';
let saved=null;try{saved=restoreWorld(localStorage.getItem(SAVE));}catch{}
let world=saved||createWorld(),state=world.state,placed=world.placed,choiceCount=0;
function persist(){try{localStorage.setItem(SAVE,serializeWorld(world));}catch{}}
function sync(result){world=result.world;state=world.state;placed=world.placed;persist();render();}
const $=id=>document.getElementById(id);
const {render,panel,caption,embers}=createView(()=>({state,placed}));
const messages={city:['Город построен!','Жители получили дома, но теперь им нужны вода, пища и энергия.'],forest:['Мир меняется!','Лес вырос! Экология и запасы воды постепенно восстанавливаются.'],energy:['Мир меняется!','Электростанция заработала! Энергии стало больше, но бюджет и вода уменьшаются.'],volcano:['Осторожно!','Вулкан проснулся! Появилась геотермальная энергия — и опасная лава.']};
function build(kind,{fromIdea=false}={}){
  if(!Object.hasOwn(BUILD_EFFECTS,kind))return;
  const result=playBuild(world,kind);sync(result);
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
  const result=playDecision(world,id);sync(result);
  panel('Последствия выбора',result.events[0].text);
  window.dispatchEvent(new CustomEvent('worldAction',{detail:{kind:'choice'}}));
  closeSheets();
}
function submitIdea(input){
  const result=playIdea(world,input);
  if(!result.recognized){
    panel('Нужно уточнить идею',result.reason);closeSheets();return;
  }
  sync(result);
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
$('restart').onclick=()=>{world=createWorld();state=world.state;placed=world.placed;choiceCount=0;try{localStorage.removeItem(SAVE);}catch{}$('choiceTrigger').hidden=true;render();closeSheets();panel('Злой Джинн:','Этот мир пока пуст и ждёт твоего решения. Выбери, с чего начать, или поделись своей идеей!')};
$('fullscreenBtn').onclick=async()=>{if(document.fullscreenEnabled&&$('game').requestFullscreen){try{await $('game').requestFullscreen();closeSheets();return}catch(e){}}$('fullscreenHint').hidden=false;};
$('scratchLaunch').onclick=function(){this.href=new URL('../player/',location.href).href};
startWalkers($('people'));
// Desktop, iPad and iPhone fullscreen: CSS paints directly to 100dvh, rather than embedding a 4:3 iframe with white margins.
window.__chainReaction={build,getState:()=>({...state}),getPlaced:()=>({...placed}),getHistory:()=>world.history.map(e=>({...e})),submitIdea,decide,openChoices:()=>openSheet('choiceBox')};
// The native Scratch file uses identical starting resources and native event-driven sprite code.
render();
})();
