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
const PLACEMENT_KINDS=new Set(['city','forest','energy','volcano']);
function validPlacements(value){
  if(!Array.isArray(value)||value.length>5000)return false;
  const ids=new Set();
  return value.every(item=>item&&typeof item.id==='string'&&item.id.length<=80&&!ids.has(item.id)&&ids.add(item.id)&&
    PLACEMENT_KINDS.has(item.kind)&&Number.isFinite(item.x)&&item.x>=0&&item.x<=1&&
    Number.isFinite(item.y)&&item.y>=0&&item.y<=1);
}
const clamp=value=>Math.max(0,Math.min(100,Math.round(value)));
const copy=world=>({
  state:{...world.state},placed:{...world.placed},
  entities:(world.entities||[]).map(item=>({...item})),
  placements:(world.placements||[]).map(item=>({...item})),
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
export function quoteBuild(world,key){
  if(!Object.hasOwn(BUILD_EFFECTS,key))return {allowed:false,reason:'Неизвестное действие',cost:0};
  const cost=Math.abs(BUILD_EFFECTS[key].budget||0);
  if(world.state.budget<cost)return {allowed:false,reason:'Нужно ещё '+(cost-world.state.budget)+' к бюджету',cost};
  return {allowed:true,reason:'',cost};
}
export function quoteIdea(world,input){
  const idea=sanitizeIdea(input);
  const actions=idea.length>800?[]:parseIdeaActions(idea);
  if(!actions.length)return {allowed:false,reason:'Идея не распознана или превышает 800 символов.',cost:0,actions:[]};
  const cost=6+actions.reduce((sum,key)=>sum+Math.abs((BUILD_EFFECTS[key]||EXTRA[key]||{}).budget||0),0);
  if(world.state.budget<cost)return {allowed:false,reason:'Нужно ещё '+(cost-world.state.budget)+' к бюджету',cost,actions};
  return {allowed:true,reason:'',cost,actions};
}
export function createWorld(){
  return {state:{...INITIAL},placed:{city:0,forest:0,energy:0,volcano:0},entities:[],placements:[],queue:[],history:[]};
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
  if(s.food<5&&s.population>0){
    const delta={population:-2};update(s,delta);
    events.push(record(world,'hunger','Голод: −2 жителя.',parentId,delta));
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
const CRISIS_ORDER=['power','water','food','eco'];
const CRISIS_LABEL={power:'энергии',water:'воды',food:'еды',eco:'экологии'};
const GENIE_OPTIONS={
  power:[
    {label:'⚡ Сжечь лес ради энергии: экология и вода пострадают',delta:{power:18,eco:-18,water:-6},role:'worsens'},
    {label:'🏭 Быстрый запуск энергетики: больше энергии ценой экологии',delta:{power:23,eco:-15,food:-7},role:'worsens'},
    {label:'🚚 Импортировать электроэнергию за счёт бюджета и воды',delta:{power:16,budget:-18,water:-7},role:'shifts'},
    {label:'🌱 Поэтапное обновление сети с экономией ресурсов',delta:{power:11,eco:5,budget:-9},role:'balanced'}
  ],
  water:[
    {label:'🚰 Срочная добыча воды: меньше экологии, выше нагрузка',delta:{water:23,eco:-15,power:-4},role:'worsens'},
    {label:'🏗️ Перекрыть реку ради воды: вред соседним лесам',delta:{water:20,eco:-13,food:-5},role:'worsens'},
    {label:'🚚 Импорт воды за счёт бюджета и энергии',delta:{water:15,budget:-17,power:-8},role:'shifts'},
    {label:'🌧️ Водосбор и постепенное восстановление реки',delta:{water:11,eco:7,budget:-9},role:'balanced'}
  ],
  food:[
    {label:'🚜 Ускорить производство еды за счёт воды и почвы',delta:{food:22,water:-13,eco:-11},role:'worsens'},
    {label:'🏭 Интенсивная ферма: еды больше, загрязнение растёт',delta:{food:18,eco:-15,power:-5},role:'worsens'},
    {label:'🚛 Импорт еды, оплаченный из общего бюджета',delta:{food:16,budget:-19,water:-3},role:'shifts'},
    {label:'🌿 Смешанные фермы с бережным поливом',delta:{food:11,eco:5,water:-3,budget:-7},role:'balanced'}
  ],
  eco:[
    {label:'🌳 Быстрое озеленение: экология растёт, вода убывает',delta:{eco:23,water:-17,power:-5},role:'worsens'},
    {label:'🏭 Агрессивная очистка: экология ценой энергии и еды',delta:{eco:19,power:-16,food:-8},role:'worsens'},
    {label:'🚚 Перенести загрязнение из города в соседний район',delta:{eco:15,budget:-17,water:-10},role:'shifts'},
    {label:'🌱 Постепенно восстановить почву и биоразнообразие',delta:{eco:11,food:5,budget:-9},role:'balanced'}
  ]
};
export function getGenieChoices(world){
  const crisis=CRISIS_ORDER.reduce((chosen,key)=>
    world.state[key]<world.state[chosen]?key:chosen,CRISIS_ORDER[0]);
  const choices=GENIE_OPTIONS[crisis].map((option,index)=>({...option,target:crisis,id:index,delta:{...option.delta}}));
  return {title:'Злой Джинн: нехватка '+CRISIS_LABEL[crisis],crisis,choices};
}
export function getDecisionOptions(world){return getGenieChoices(world).choices;}
export function playDecision(world,index){
  if(!Number.isInteger(index)||index<0||index>3)throw Error('Unknown decision');
  const choice=getDecisionOptions(world)[index];
  const next=copy(world),events=[];
  next.state.turn++;
  advanceQueue(next,events);
  const event=record(next,'decision',choice.label,null,choice.delta);
  events.push(event);
  update(next.state,choice.delta);
  cascade(next,events,event.id);
  return {world:next,events,actions:[]};
}
export function interpretIdea(input){
  const text=sanitizeIdea(input);
  if(!text||text.length>800)return {actions:[],reason:'Напиши идею длиной от 1 до 800 символов.'};
  const actions=parseIdeaActions(text);
  return {actions,reason:actions.length?'':'Пока не могу рассчитать именно эту идею. Попробуй указать лес, город, энергию, вулкан, ферму, насос или очистку воды.'};
}
export function playIdea(world,input){
  const parsed=interpretIdea(input);
  if(!parsed.actions.length)return {world,events:[],actions:[],reason:parsed.reason,recognized:false};
  const quote=quoteIdea(world,input);
  if(!quote.allowed)return {world,events:[],actions:parsed.actions,reason:quote.reason,recognized:false};
  return {...applyActions(world,parsed.actions,'Идея: '+String(input).trim().slice(0,180),6),recognized:true,reason:''};
}
export function playCustomDecision(world,input){
  const parsed=interpretIdea(input);
  if(!parsed.actions.length)return {world,events:[],actions:[],reason:parsed.reason,recognized:false};
  const quote=quoteIdea(world,input);
  if(!quote.allowed)return {world,events:[],actions:parsed.actions,reason:quote.reason,recognized:false};
  const result=applyActions(world,parsed.actions,'Своё решение: '+String(input).trim().slice(0,120),6);
  const event=result.world.history.find(e=>e.type==='action'&&e.tick===result.world.state.turn);
  if(event){event.type='decision';result.events.unshift(event);}
  return {...result,recognized:true,reason:''};
}
export function playWorldEvent(world,kind){
  if(!['dragon','attack'].includes(kind))return {world,events:[],actions:[],reason:'Неизвестное событие.',recognized:false};
  const next=copy(world),events=[];
  next.state.turn++;
  advanceQueue(next,events);
  if(kind==='dragon'){
    const entity={id:'dragon-'+next.state.turn+'-'+(next.history.length+1),kind:'dragon',hp:100,status:'flying'};
    next.entities.push(entity);
    const event=record(next,'creature','Прилетел дракон. Он кружит над миром.',null);
    event.entityId=entity.id;events.push(event);
    cascade(next,events,event.id);
    return {world:next,events,actions:['dragon'],recognized:true,reason:''};
  }
  const target=[...next.entities].reverse().find(entity=>entity.kind==='dragon'&&entity.hp>0);
  if(!target)return {world,events:[],actions:[],reason:'Нет живого дракона, в которого можно стрелять.',recognized:false};
  const damage=30+((next.state.turn*7+next.history.length)%11);
  target.hp=Math.max(0,target.hp-damage);
  const shot=record(next,'combat','Люди стреляют в дракона: урон '+damage+', здоровье '+target.hp+'.',null);
  shot.entityId=target.id;events.push(shot);
  if(target.hp===0){
    target.status='defeated';
    const delta={eco:2};
    update(next.state,delta);
    const defeated=record(next,'combat','Дракон повержен. Угроза миновала.',shot.id,delta);
    defeated.entityId=target.id;events.push(defeated);
  }else{
    next.queue.push({turn:next.state.turn+1,delta:{population:-2,eco:-3,budget:-5},
      text:'Дракон отвечает огнём. Пострадали люди и дома.',parentId:shot.id});
  }
  cascade(next,events,shot.id);
  return {world:next,events,actions:['attack'],recognized:true,reason:''};
}
export function serializeWorld(world){return JSON.stringify({version:VERSION,...world});}
export function restoreWorld(raw){
  try{
    const data=JSON.parse(raw);
    if(data.version!==VERSION||!data.state||!data.placed||!Array.isArray(data.queue)||!Array.isArray(data.history))return null;
    if(data.entities===undefined)data.entities=[];
    if(data.placements===undefined)data.placements=[];
    if(!Array.isArray(data.entities)||data.entities.length>20||data.entities.some(e=>!e||e.kind!=='dragon'||!Number.isInteger(e.hp)||e.hp<0||e.hp>100))return null;
    if(!validPlacements(data.placements))return null;
    if(Object.keys(INITIAL).some(k=>!Number.isInteger(data.state[k])||data.state[k]<0||data.state[k]>(k==='turn'?100000:100)))return null;
    if(Object.keys(createWorld().placed).some(k=>!Number.isInteger(data.placed[k])||data.placed[k]<0||data.placed[k]>10000))return null;
    if(data.queue.length>400||data.history.length>150||data.queue.some(e=>!Number.isInteger(e.turn)||e.turn<0||e.turn>100000||
      !e.delta||Object.entries(e.delta).some(([k,v])=>!Object.hasOwn(INITIAL,k)||k==='turn'||!Number.isFinite(v))))return null;
    return copy(data);
  }catch{return null;}
}
export function advanceTick(world){
  const next=copy(world),events=[];
  next.state.turn++;
  advanceQueue(next,events);
  const economy={budget:next.state.population>0?2:0};
  update(next.state,economy);
  events.push(record(next,'economy','Налоговые поступления пополнили бюджет.',null,economy));
  cascade(next,events,null);
  events.push(record(next,'tick','Прошёл ход '+next.state.turn+'.',null));
  return {world:next,events,actions:[]};
}
