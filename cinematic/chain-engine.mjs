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
export function quoteBuild(world,key){
  if(!Object.hasOwn(BUILD_EFFECTS,key))return {allowed:false,cost:0,reason:'Неизвестный объект.'};
  const cost=-BUILD_EFFECTS[key].budget,allowed=world.state.budget>=cost;
  return {allowed,cost,reason:allowed?'':'Нужно '+cost+' бюджета; сейчас '+world.state.budget+
    '. Пропусти ход, чтобы получить доход.'};
}
export function quoteIdea(world,input){
  const parsed=interpretIdea(input);
  if(!parsed.actions.length)return {allowed:false,cost:0,actions:[],reason:parsed.reason};
  const cost=6+parsed.actions.reduce((sum,key)=>sum-(BUILD_EFFECTS[key]||EXTRA[key]).budget,0);
  const allowed=world.state.budget>=cost;
  return {allowed,cost,actions:parsed.actions,reason:allowed?'':'На исследование и строительство нужно '+
    cost+' бюджета; сейчас '+world.state.budget+'. Пропусти ход или упрости проект.'};
}
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
  if(s.food<10){
    const delta={population:-3};update(s,delta);
    events.push(record(world,'hunger','Голод: −3 жителя.',parentId,delta));
  }
}
function applyActions(world,actions,description,charge=0,eventType='action'){
  const next=copy(world),events=[];
  next.state.turn++;
  advanceQueue(next,events);
  if(charge)update(next.state,{budget:-charge});
  const actionEvent=record(next,eventType,description,null);
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
// The Genie reacts to the weakest *current* system, not just the last button.
// Each crisis offers two quick fixes with local externalities, one imported
// workaround that exports the cost, and one slower resource-conscious response.
// Ordered rules are intentional: same state + same choice => identical replay.
const CHOICE_RULES=Object.freeze({
  power:[
    ['🔥 Сжечь лес ради энергии: +13 энергии, −19 экологии',{power:13,eco:-19,water:-6}],
    ['🏭 Мегазавод: +19 энергии, −15 экологии, −7 еды',{power:19,eco:-15,food:-7}],
    ['🚛 Импорт топлива: +9 энергии, −18 бюджета',{power:9,budget:-18,water:-4}],
    ['🌱 Модернизировать сеть: +8 энергии, +8 экологии, −10 бюджета',{power:8,eco:8,budget:-10}]
  ],
  water:[
    ['⛏️ Выкачать подземные воды: +16 воды, −14 экологии',{water:16,eco:-14,food:-5}],
    ['🏗️ Перегородить реку: +20 воды, −12 экологии',{water:20,eco:-12,food:-7}],
    ['🚛 Привезти воду: +12 воды, −20 бюджета',{water:12,budget:-20,power:-3}],
    ['🌳 Восстановить водосбор: +12 воды, +7 экологии',{water:12,eco:7,budget:-12,power:-3}]
  ],
  food:[
    ['🚜 Распахать заповедник: +19 еды, −14 экологии',{food:19,eco:-14,water:-8}],
    ['🧪 Интенсивные удобрения: +23 еды, −12 экологии',{food:23,eco:-12,water:-9}],
    ['🚛 Импортировать продовольствие: +15 еды, −20 бюджета',{food:15,budget:-20,power:-3}],
    ['🌱 Вырастить устойчивые культуры: +12 еды, +6 экологии',{food:12,eco:6,water:-3,budget:-12}]
  ],
  eco:[
    ['🪓 Срубить лес ради рабочих мест: +12 бюджета, −18 экологии',{budget:12,eco:-18,food:-4}],
    ['🔥 Сжечь отходы ради энергии: +17 энергии, −16 экологии',{power:17,eco:-16,water:-5}],
    ['🚛 Купить чистую воду: +13 воды, −19 бюджета',{water:13,budget:-19,food:-3}],
    ['🌲 Восстановить лес и очистить стоки: +17 экологии',{eco:17,water:9,budget:-13,power:-3}]
  ],
  budget:[
    ['🪓 Продать древесину: +18 бюджета, −17 экологии',{budget:18,eco:-17,food:-5}],
    ['⛏️ Ускорить добычу: +23 бюджета, −19 экологии',{budget:23,eco:-19,water:-8}],
    ['🚛 Занять деньги и купить ресурсы: +20 бюджета, −8 еды',{budget:20,food:-8,power:-4}],
    ['♻️ Эффективное производство: +11 бюджета, +5 экологии',{budget:11,eco:5,power:-5}]
  ],
  population:[
    ['🏢 Заселить без инфраструктуры: +12 жителей, −11 воды',{population:12,water:-11,food:-9}],
    ['🏭 Привезти рабочих: +15 жителей, −12 экологии',{population:15,eco:-12,food:-8}],
    ['🚛 Временные лагеря: +9 жителей, −16 бюджета',{population:9,budget:-16,water:-6}],
    ['🏘️ Устойчивое жильё: +7 жителей, +5 экологии',{population:7,eco:5,budget:-13,food:-4}]
  ]
});
const CRISIS_LIMITS=Object.freeze({power:18,water:18,food:18,eco:24,budget:18,population:16});
const CRISIS_TITLES=Object.freeze({power:'Дефицит энергии',water:'Водный кризис',food:'Нехватка продовольствия',
  eco:'Экологический кризис',budget:'Дефицит бюджета',population:'Отток населения'});
export function getGenieChoices(world){
  const entries=Object.entries(CRISIS_LIMITS);
  const key=entries.reduce((best,[resource,limit])=>{
    const severity=world.state[resource]/limit;
    return severity<best.severity?{resource,severity}:best;
  },{resource:'eco',severity:1});
  const crisis=key.severity<1?key.resource:'eco';
  const choices=CHOICE_RULES[crisis].map(([label,delta],index)=>({
    label,delta:{...delta},target:crisis,
    role:index<2?'worsens':index===2?'shifts':'balanced'
  }));
  // Shuffle without RNG: the same world snapshot always produces the same
  // sequence in the UI, simulator and after restoring a saved session.
  let seed=(((world.state.turn+1)*2654435761)^(world.state.population*997)^
    (world.state.budget*31))>>>0;
  for(let i=choices.length-1;i>0;i--){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const j=seed%(i+1);[choices[i],choices[j]]=[choices[j],choices[i]];
  }
  return {crisis,title:key.severity<1?CRISIS_TITLES[crisis]:'Баланс ресурсов',
    choices:choices.map((choice,id)=>({...choice,id}))};
}
export function getDecisionOptions(world){return getGenieChoices(world).choices;}
export function playDecision(world,index){
  if(!Number.isInteger(index)||index<0||index>=4)throw Error('Unknown decision');
  const choice=getGenieChoices(world).choices[index];
  const next=copy(world),events=[];
  next.state.turn++;
  advanceQueue(next,events);
  const event=record(next,'decision',choice.label,null,choice.delta);
  update(next.state,choice.delta);
  events.push(event);
  cascade(next,events,event.id);
  return {world:next,events,actions:[]};
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
// Like the four built-in responses, the fifth user-authored choice consumes
// one decision turn and closes the pending Genie dialogue.
export function playCustomDecision(world,input){
  const parsed=interpretIdea(input);
  if(!parsed.actions.length)return {world,events:[],actions:[],reason:parsed.reason,recognized:false};
  return {...applyActions(world,parsed.actions,'Своё решение: '+input.trim().slice(0,180),
    6,'decision'),recognized:true,reason:''};
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

// Sustained projects create production, consumption and a source-linked income
// event on idle turns. The minimum income allows recovery after a catastrophe.
function runEconomy(world,events){
  const s=world.state,p=world.placed;
  const delta={
    budget:Math.max(2,Math.floor(s.population/8)+Math.floor(s.power/16)),
    power:p.energy*7-p.city*3,
    water:p.forest*3-p.city*2,
    food:p.forest*3-Math.floor(s.population/32),
    eco:p.forest*2-p.city-p.volcano*2
  };
  update(s,delta);
  events.push(record(world,'economy',
    'Постройки производят и потребляют ресурсы; жители приносят доход.',null,delta));
}
// Advance the deterministic world without forcing the user to build another object.
// This is intentionally separate from playDecision, so the UI can offer a skip-turn.
export function advanceTick(world){
  const next=copy(world),events=[];
  next.state.turn++;
  advanceQueue(next,events);
  runEconomy(next,events);
  cascade(next,events,null);
  return {world:next,events,actions:[]};
}
