// Same cinematic renderer; World Server D1 is the only authority for all decisions.
import {createSheets,delegateGameEvents} from './ui.mjs';
import {startWalkers} from './walkers.mjs';
import {createView} from './render-ui.mjs';

const API='https://world-server.mmmpaykin.workers.dev/api/chain';
const TOKEN='chain-world-browser-token-v1';
const $=id=>document.getElementById(id);
const sheets=createSheets(document);
const {openSheet,closeSheets}=sheets;
const renderView=createView(()=>({state:snapshot.state,placed:snapshot.placed,
  history:snapshot.history}));
const initialState={population:0,power:0,water:0,food:0,eco:0,budget:0,turn:0};
let snapshot={revision:-1,state:initialState,placed:{city:0,forest:0,energy:0,volcano:0},
  history:[],choices:[],story:{},linked:false};
let token='',busy=false,lastRevision=-1,linkForm=null;
const webapp=window.Telegram?.WebApp||null;
webapp?.ready();
webapp?.expand();
function show(title,description){renderView.panel(title,description);}
function setBusy(value){
  busy=value;
  for(const el of document.querySelectorAll('.action-dock button,[data-decision],#restart,#ideaForm button'))
    el.disabled=value;
}
async function request(path,method='GET',body){
  const response=await fetch(API+path,{method,
    headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
    cache:'no-store'});
  let result={};
  try{result=await response.json();}catch{}
  if(!response.ok){const error=new Error(result.error||'Нет связи с игровым сервером.');
    error.status=response.status;error.snapshot=result;throw error;}
  return result;
}
async function openSession(){
  const tgData=String(webapp?.initData||'');
  // A verified Telegram WebApp always binds to the private chat, not a cached guest world.
  const mode=localStorage.getItem('chain-session-mode');
  const existing=localStorage.getItem(TOKEN);
  if(existing&&(!tgData||mode==='telegram')){token=existing;return;}
  const created=await request('/session','POST',{initData:tgData});
  token=created.token;
  localStorage.setItem(TOKEN,token);
  localStorage.setItem('chain-session-mode',created.linked?'telegram':'guest');
}
function showDragon(){
  const dragon=$('dragonArt'),scene=snapshot.story||{};
  if(!dragon)return;
  dragon.hidden=!snapshot.placed.dragon;
  dragon.dataset.hp=String(scene.dragon?.hp??100);
  dragon.classList.toggle('dragon-hit',scene.last?.kind==='defense');
}
function render(){
  renderView.render();
  showDragon();
  const options=snapshot.choices||[];
  const title=options.length?'Злой Джинн: выбери следующий проект':'Злой Джинн: проживи день или предложи идею';
  $('choiceTitle').textContent=title;
  document.querySelectorAll('[data-decision]').forEach(button=>{
    const proposal=options[Number(button.dataset.decision)];
    button.hidden=!proposal;
    if(proposal)button.textContent=proposal.label+' 💰'+proposal.cost+' ⏳'+proposal.days;
  });
  $('undo').disabled=true;
  $('choiceTrigger').hidden=!options.length;
  if($('linkState'))$('linkState').textContent=snapshot.linked?
    '✅ Telegram и браузер используют один мир.':'Гостевой мир без регистрации. В Telegram отправь /link и введи код ниже.';
}
function accept(next,{notify=true}={}){
  const old=lastRevision;
  snapshot=next;lastRevision=next.revision;
  render();
  if(notify&&next.revision!==old){
    const last=next.story?.last;
    if(last?.kind==='defense'&&old>=0){
      $('dragonArt')?.classList.remove('dragon-hit');
      void $('dragonArt')?.offsetWidth;
      $('dragonArt')?.classList.add('dragon-hit');
    }
    if(next.notice)show(last?.title||'Мир изменился',next.notice);
    window.dispatchEvent(new CustomEvent('worldAction',{detail:{
      kind:last?.kind?.startsWith('dragon')?'dragon':
        last?.kind==='defense'?'combat':'tick'}}));
  }
}
async function refresh({notify=false}={}){
  if(busy||!token)return;
  try{
    const next=await request('/state');
    if(next.revision!==lastRevision)accept(next,{notify});
  }catch(error){
    if(error.status===401){localStorage.removeItem(TOKEN);token='';}
    show('Мир временно недоступен','Соединение с общей базой потеряно. Мы не создаём отдельную локальную копию: повтори подключение.');
  }
}
async function act(kind,properties={}){
  if(busy||!token)return;
  setBusy(true);
  try{
    const next=await request('/action','POST',{kind,revision:snapshot.revision,...properties});
    accept(next);closeSheets();
  }catch(error){
    if(error.status===409&&error.snapshot?.state)accept(error.snapshot,{notify:false});
    show('Ход не выполнен',error.message+
      (error.status===409?' Состояние мира обновлено, повтори решение.':''));
  }finally{setBusy(false);}
}
function build(type){return act('build',{type});}
function decide(i){
  const proposal=snapshot.choices?.[i];
  if(proposal)return act('choice',{type:proposal.type});
}
function open(id){if(id==='choiceBox')render();openSheet(id);}
$('choiceTrigger').onclick=()=>open('choiceBox');
$('closeDialog').onclick=()=>$('dialog').classList.add('hidden');
$('askIdea').onclick=()=>open('ideaBox');
$('showHelp').onclick=()=>open('menuBox');
$('showMenu').onclick=()=>open('menuBox');
$('closeChoices').onclick=closeSheets;
$('closeIdea').onclick=closeSheets;
$('closeMenu').onclick=closeSheets;
$('ideaFromChoices').onclick=()=>open('ideaBox');
delegateGameEvents(document,{build,decide,openSheet:open});
$('ideaForm').onsubmit=event=>{
  event.preventDefault();
  const text=$('ideaText').value.trim();
  if(text)act('idea',{text});
};
$('restart').onclick=()=>{
  if(confirm('Создать новый мир? Мир изменится и в Telegram, и в браузере.'))
    act('reset');
};
$('undo').onclick=()=>show('Общий мир','Отмена ходов отключена: изменения одновременно видны в Telegram.');
$('fullscreenBtn').onclick=async()=>{
  if(document.fullscreenEnabled&&$('game').requestFullscreen){
    try{await $('game').requestFullscreen();closeSheets();return;}catch{}
  }
  $('fullscreenHint').hidden=false;
};
$('scratchLaunch').onclick=function(){this.href=new URL('../player/',location.href).href;};
$('nextDay').onclick=()=>act('next');
$('shootDragon').onclick=()=>act('story_action',{type:'shoot'});
$('defendCity').onclick=()=>act('story_action',{type:'defend'});
$('linkForm').onsubmit=async event=>{
  event.preventDefault();
  if(busy)return;
  setBusy(true);
  const code=$('linkCode').value.replace(/\s/g,'').toUpperCase();
  try{
    const next=await request('/link','POST',{code});
    accept(next,{notify:false});$('linkCode').value='';
    show('Миры объединены','Теперь Telegram и этот браузер управляют одним миром. Сохрани эту вкладку.');
    closeSheets();
  }catch(error){show('Код не подошёл',error.message);}
  finally{setBusy(false);}
};
startWalkers($('people'));
window.__chainReaction={
  build,getState:()=>({...snapshot.state}),getPlaced:()=>({...snapshot.placed}),
  getHistory:()=>snapshot.history.map(e=>({...e})),submitIdea:text=>act('idea',{text}),
  decide,advance:()=>act('next'),refresh:()=>refresh({notify:true})
};
render();
try{
  await openSession();
  accept(await request('/state'),{notify:false});
  $('dialogTitle').textContent='Один мир — Telegram и браузер';
  $('dialogText').textContent=snapshot.linked?
    'Продолжай игру: все действия сохраняются в общей базе.':
    'Играешь без регистрации. Чтобы присоединить Telegram-бота, отправь ему /link и введи код в меню.';
}catch(error){
  show('Нужна связь с сервером','Единый мир пока не загружен: '+error.message+
    ' Локальная игра не запускается, чтобы не создать второй независимый мир.');
}
setInterval(()=>refresh({notify:true}),4000);
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden)refresh({notify:true});
});
