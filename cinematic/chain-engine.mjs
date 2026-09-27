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

// Four choices per crisis: two risky shortcuts, a shifted tradeoff, and a balanced path.
// Explanations describe modeled effects, not claims about arbitrary real-world outcomes.
const CHOICE_BANK={
  power:[
    ['🔥 Сжечь лес ради энергии',{power:13,eco:-19,water:-6},'Энергия выросла, но лес и водный баланс пострадали.','risk'],
    ['🏭 Запустить мегазавод',{power:19,eco:-15,food:-7},'Мегазавод увеличил мощность ценой загрязнения и урожая.','risk'],
    ['🚛 Импортировать электричество',{power:9,budget:-18,water:-4},'Импорт закрыл часть дефицита ценой бюджета.','tradeoff'],
    ['🌱 Модернизировать сеть',{power:8,eco:8,budget:-10},'Модернизация дала умеренный прирост энергии и улучшила экологию.','balanced']
  ],
  water:[
    ['🏗 Перекрыть реку',{water:22,eco:-16,budget:-14},'Водохранилище наполнилось, но экосистема ниже плотины пострадала.','risk'],
    ['⛏ Бурить глубокие скважины',{water:26,eco:-19,power:-4},'Добыча воды истощает подземные запасы и требует энергии.','risk'],
    ['🚛 Закупить привозную воду',{water:18,budget:-20,food:-5},'Поставки спасли город ценой продовольственного бюджета.','tradeoff'],
    ['🌳 Восстановить водосбор',{water:10,eco:9,budget:-10},'Ремонт труб и восстановление леса постепенно возвращают воду.','balanced']
  ],
  food:[
    ['🪓 Расчистить лес под поля',{food:20,eco:-18,water:-8},'Площадь полей выросла, но почва теряет влагу.','risk'],
    ['🧪 Усилить химизацию',{food:22,eco:-16,water:-10},'Урожай вырос ценой загрязнения и расхода воды.','risk'],
    ['🚢 Ввозить продовольствие',{food:14,budget:-20,power:-4},'Импорт еды требует денег и энергии.','tradeoff'],
    ['🌾 Восстановить плодородие',{food:8,water:5,eco:6,budget:-10},'Умеренный урожай с восстановлением почвы и воды.','balanced']
  ],
  eco:[
    ['🚫 Закрыть все электростанции',{eco:18,power:-19,budget:-8},'Загрязнение снизилось, но энергетика ослабла.','risk'],
    ['🌲 Посадить монокультуру',{eco:20,water:-14,food:-6},'Быстрое озеленение истощило воду и урожай.','risk'],
    ['💰 Купить компенсации',{eco:8,budget:-20,food:-4},'Экологический эффект обошёлся дорого.','tradeoff'],
    ['🌿 Восстановить экосистемы',{eco:9,water:6,food:4,budget:-10},'Водоёмы, леса и поля постепенно восстанавливаются вместе.','balanced']
  ]
};
export function getGenieChoices(world){
  const resource=['power','water','food','eco'].reduce((low,key)=>
    world.state[key]<world.state[low]?key:low,'power');
  const choices=CHOICE_BANK[resource].map(([label,effect,message,role],id)=>
    ({id,label,effect:{...effect},message,role}));
  let seed=(world.state.turn+world.state.budget*7+world.state.population*13+19)>>>0;
  for(let i=choices.length-1;i>0;i--){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const j=seed%(i+1);[choices[i],choices[j]]=[choices[j],choices[i]];
  }
  return {resource,choices};
}
const EXTRA=Object.freeze({
  irrigation:{water:14,food:7,power:-3,budget:-9},
  recycling:{eco:11,water:4,budget:-8},
  farm:{food:16,water:-5,budget:-9}
});
const KEYWORDS=[
  ['irrigation',/орошени|полив|канал|водопровод|насос|скважин|irrigat/i],
  ['recycling',/переработ|очистк|фильтр|recycl/i],
  ['farm',/ферм|урожай|сельск|теплиц|farm/i],
  ['forest',/лес|дерев|посадк|растени|forest/i],
  ['city',/город|дом|здани|поселен|city/i],
  ['energy',/энерг|солн|электр|ветр|турбин|energy|solar/i],
  ['volcano',/вулкан|лав|геотерм|volcano/i]
];
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
    if(key==='energy')next.queue.push({turn:next.state.turn+1,delta:{power:5,eco:-3},text:'Энергосеть вышла на мощность; загрязнение накопилось.',parentId:actionEvent.id});
    if(key==='irrigation')next.queue.push({turn:next.state.turn+2,delta:{water:-5,food:5},text:'Орошение повысило урожай, но истощило запас воды.',parentId:actionEvent.id});
    if(next.queue.length>200)next.queue=next.queue.slice(-200);
  }
  cascade(next,events,actionEvent.id);
  return {world:next,events,actions};
}
export function playBuild(world,key){
  if(!Object.hasOwn(BUILD_EFFECTS,key))throw Error('Unknown build action');
  return applyActions(world,[key],'Построено: '+ACTION_LABEL[key]);
}
export function advanceTick(world){
  const next=copy(world),events=[];
  next.state.turn++;
  advanceQueue(next,events);
  cascade(next,events,null);
  return {world:next,events,actions:[]};
}
export function playDecision(world,index){
  const {resource,choices}=getGenieChoices(world);
  const choice=choices.find(option=>option.id===index);
  if(!choice)throw Error('Unknown decision');
  const next=copy(world),events=[];
  next.state.turn++;
  advanceQueue(next,events);
  update(next.state,choice.effect);
  const event=record(next,'decision',choice.message,null,choice.effect);
  events.push(event);
  cascade(next,events,event.id);
  return {world:next,events,actions:[],choice,resource};
}
export function interpretIdea(input){
  const text=typeof input==='string'?input.trim():'';
  if(!text||text.length>800)return {actions:[],reason:'Напиши идею длиной от 1 до 800 символов.'};
  // Explicit negation is ambiguous without full language understanding: do not build what was forbidden.
  const negated=/(?:^|[^\p{L}])не\s+(?:надо\s+|хочу\s+|нужно\s+)?(?:строить|создавать|сажать|делать)(?=$|[^\p{L}])/iu.test(text);
  if(negated)return {actions:[],reason:'Я пока не умею надёжно разбирать отрицания. Сформулируй, что именно построить.'};
  const actions=KEYWORDS.filter(([,pattern])=>pattern.test(text)).map(([name])=>name).slice(0,4);
  return {actions,reason:actions.length?'':'Пока не могу рассчитать именно эту идею. Попробуй указать лес, город, энергию, вулкан, ферму, насос или очистку воды.'};
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
