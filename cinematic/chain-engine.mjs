import {parseIdeaActions,sanitizeIdea} from './idea-parser.mjs';
// Pure, deterministic simulation for the cinematic mode. No DOM, network, time or RNG.
export const VERSION=1;
export const INITIAL=Object.freeze({turn:0,population:32,power:0,water:0,food:0,eco:0,budget:50});
export const BUILD_EFFECTS=Object.freeze({
  city:{population:11,power:-9,water:-8,food:-5,eco:-5,budget:-12},
  forest:{eco:18,water:12,food:9,budget:-10},
  energy:{power:32,eco:-8,water:-5,budget:-16},
  volcano:{power:21,eco:-20,population:-3,water:-7,budget:-9}
});
export const DECISIONS=Object.freeze([
  {power:13,eco:-19,water:-6},
  {power:19,eco:-15,food:-7},
  {power:9,budget:-18,water:-4},
  {power:8,eco:8,budget:-10}
]);
export const DECISION_MESSAGES=[
  'Энергии прибавилось, но лес выжжен.',
  'Мегазавод запущен: загрязнение угрожает урожаю.',
  'Импорт помог пережить кризис, но бюджет истощается.',
  'Модернизация и восстановление природы требуют вложений.'
];
const EXTRA=Object.freeze({
  irrigation:{water:14,food:7,power:-3,budget:-9},
  recycling:{eco:11,water:4,budget:-8},
  farm:{food:16,water:-5,budget:-9}
});
const ACTION_LABEL={city:'Город',forest:'Лес',energy:'Энергия',volcano:'Вулкан',
  irrigation:'Орошение',recycling:'Очистка воды',farm:'Фермы'};
const clamp=value=>Math.max(0,Math.min(100,Math.round(value)));
const copy=world=>({
  state:{...world.state},placed:{...world.placed},
  queue:world.queue.map(item=>({...item,delta:{...item.delta}})),
  history:world.history.map(item=>({...item}))
});
const update=(stats,delta)=>{for(const [key,value] of Object.entries(delta)){
  if(!Object.hasOwn(INITIAL,key)||key==='turn'||!Number.isFinite(value))throw Error('Invalid resource delta: '+key);
  stats[key]=clamp(stats[key]+value);
}};
const record=(world,type,text,parentId,delta={})=>{
  const event={id:world.history.length?world.history.at(-1).id+1:1,tick:world.state.turn,type,text,parentId,delta};
  world.history.push(event);
  if(world.history.length>150)world.history.shift();
  return event;
};
export function createWorld(){
  return {state:{...INITIAL},placed:{city:0,forest:0,energy:0,volcano:0},queue:[],history:[]};
}
function advanceQueue(world,events){
  const due=world.queue.filter(item=>item.turn<=world.state.turn);
  world.queue=world.queue.filter(item=>item.turn>world.state.turn);
  for(const item of due){
    update(world.state,item.delta);
    events.push(record(world,'delayed',item.text,item.parentId,item.delta));
  }
}
function cascade(world,events,parentId){
  const s=world.state;
  if(s.power<10){
    const delta={population:-2,food:-6};update(s,delta);
    events.push(record(world,'shortage','Дефицит энергии: −2 жителя, −6 еды.',parentId,delta));
  }
  if(s.water<10){
    const delta={food:-6,eco:-4};update(s,delta);
    events.push(record(world,'drought','Засуха: −6 еды, −4 экологии.',parentId,delta));
  }
  if(s.eco<10){
    const delta={food:-4};update(s,delta);
    events.push(record(world,'pollution','Экологический кризис: −4 еды.',parentId,delta));
  }
}
function applyActions(world,actions,description,charge=0){
  const next=copy(world),events=[];
  next.state.turn++;
  advanceQueue(next,events);
  if(charge)update(next.state,{budget:-charge});
  const actionEvent=record(next,'action',description,null);
  for(const key of actions){
    const delta=BUILD_EFFECTS[key]||EXTRA[key];
    update(next.state,delta);
    if(Object.hasOwn(next.placed,key))next.placed[key]++;
    events.push(record(next,'construction',ACTION_LABEL[key]+' изменил мир.',actionEvent.id,delta));
    if(key==='forest')next.queue.push({turn:next.state.turn+2,delta:{eco:4,food:3},text:'Подросший лес восстанавливает почву и питание.',parentId:actionEvent.id});
    if(key==='city')next.queue.push({turn:next.state.turn+2,delta:{water:-3,power:-3},text:'Разросшемуся городу снова требуются вода и энергия.',parentId:actionEvent.id});
    if(key==='volcano')next.queue.push({turn:next.state.turn+1,delta:{eco:-4},text:'Пепел вулкана ухудшил состояние воздуха.',parentId:actionEvent.id});
  }
  cascade(next,events,actionEvent.id);
  return {world:next,events,actions};
}
export function playBuild(world,key){
  if(!Object.hasOwn(BUILD_EFFECTS,key))throw Error('Unknown build action');
  return applyActions(world,[key],'Построено: '+ACTION_LABEL[key]);
}
export function playDecision(world,index){
  if(!Number.isInteger(index)||index<0||index>=DECISIONS.length)throw Error('Unknown decision');
  const next=copy(world),event=record(next,'decision',DECISION_MESSAGES[index],null,DECISIONS[index]);
  update(next.state,DECISIONS[index]);
  return {world:next,events:[event],actions:[]};
}
export function interpretIdea(input){
  if(typeof input!=='string'||!input.trim()||input.trim().length>800)
    return {actions:[],reason:'Напиши идею длиной от 1 до 800 символов.'};
  const actions=parseIdeaActions(sanitizeIdea(input)).slice(0,4);
  return {actions,reason:actions.length?'':
    'Пока не могу рассчитать именно эту идею. Укажи, что построить: лес, город, энергию, вулкан, ферму, насос или очистку воды.'};
}
export function playIdea(world,input){
  const parsed=interpretIdea(input);
  if(!parsed.actions.length)return {world,events:[],actions:[],reason:parsed.reason,recognized:false};
  return {...applyActions(world,parsed.actions,'Идея: '+input.trim().slice(0,180),6),recognized:true,reason:''};
}
export function serializeWorld(world){return JSON.stringify({version:VERSION,...world});}
export function restoreWorld(raw){
  try{
    const data=JSON.parse(raw);
    if(data.version!==VERSION||!data.state||!data.placed||!Array.isArray(data.queue)||!Array.isArray(data.history))return null;
    if(Object.keys(INITIAL).some(k=>!Number.isInteger(data.state[k])||data.state[k]<0||data.state[k]>(k==='turn'?100000:100)))return null;
    if(Object.keys(createWorld().placed).some(k=>!Number.isInteger(data.placed[k])||data.placed[k]<0||data.placed[k]>10000))return null;
    if(data.queue.length>400||data.history.length>150||data.queue.some(e=>!Number.isInteger(e.turn)||e.turn<0||e.turn>100000||
      !e.delta||Object.entries(e.delta).some(([k,v])=>!Object.hasOwn(INITIAL,k)||k==='turn'||!Number.isFinite(v))))return null;
    return copy(data);
  }catch{return null;}
}
