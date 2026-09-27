/**
 * Cinematic teaser's pure, deterministic simulation.
 * No DOM, animation, storage, network or random side-effects here.
 * The advanced water-crisis model remains in scenario-engine.mjs.
 */
export const VERSION = 1;
export const START = Object.freeze({
  turn: 0, population: 32, power: 0, water: 0, food: 0, eco: 0, budget: 50
});
const KEYS = Object.freeze(["population","power","water","food","eco","budget"]);
const RESOURCE_KEYS = ["power","water","food","eco"];
export const STRUCTURES = Object.freeze({
  city: {label:"ГОРОД",title:"Город построен!",description:"Жители получили дома, но им нужны вода, пища и энергия.",
    effect:{population:11,power:-9,water:-8,food:-5,eco:-5,budget:-12},
    delayed:[[1,{water:-3,food:-2},"Новые кварталы увеличили потребление воды и еды."],
      [2,{budget:4,eco:-2},"Город собрал налоги, но транспорт усилил загрязнение."]]},
  forest: {label:"ЛЕС",title:"Мир меняется!",description:"Лес вырос! Экология и запасы воды начинают восстанавливаться.",
    effect:{eco:18,water:12,food:9,budget:-10},
    delayed:[[1,{eco:5,water:4},"Корни удерживают влагу, лес постепенно восстанавливается."],
      [2,{food:3},"Новые растения поддержали первые урожаи."]]},
  energy: {label:"ЭНЕРГИЯ",title:"Мир меняется!",description:"Электростанция заработала: больше энергии, но расходуются бюджет и вода.",
    effect:{power:32,eco:-8,water:-5,budget:-16},
    delayed:[[1,{power:5,eco:-3},"Станция вышла на мощность; загрязнение накапливается."],
      [2,{power:2,budget:2},"Энергосеть приносит доход и обеспечивает новые мощности."]]},
  volcano: {label:"ВУЛКАН",title:"Осторожно!",description:"Вулкан проснулся: геотермальная энергия и опасная лава.",
    effect:{power:21,eco:-20,population:-3,water:-7,budget:-9},
    delayed:[[1,{eco:-7,population:-2},"Пепел достиг поселений: жители эвакуируются."],
      [2,{power:7,water:-3},"Геотермальная энергия выросла, но запасы воды сократились."]]}
});
const CHOICES = Object.freeze({
  power:[
    ["🔥 Сжечь лес ради энергии",{power:13,eco:-19,water:-6},"Лес выжжен ради энергии: воды и экологии стало меньше.","risk"],
    ["🏭 Запустить мегазавод",{power:19,eco:-15,food:-7},"Завод увеличил мощность, но угрожает урожаю.","risk"],
    ["🚛 Импортировать электричество",{power:9,budget:-18,water:-4},"Импорт закрыл часть дефицита ценой бюджета.","tradeoff"],
    ["🌱 Модернизировать сеть",{power:8,eco:8,budget:-10},"Модернизация дала умеренный прирост энергии и улучшила экологию.","balanced"]
  ],
  water:[
    ["🏗 Перекрыть реку плотиной",{water:22,eco:-16,budget:-14},"Воды в хранилище больше, но экосистема ниже плотины страдает.","risk"],
    ["⛏ Бурить глубокие скважины",{water:26,eco:-19,power:-4},"Новые скважины истощают подземные запасы.","risk"],
    ["🚛 Закупить привозную воду",{water:18,budget:-20,food:-5},"Поставки спасли город, но сократили продовольственный бюджет.","tradeoff"],
    ["🌳 Восстановить водосбор",{water:10,eco:9,budget:-10},"Лес, накопители и ремонт труб постепенно восстанавливают воду.","balanced"]
  ],
  food:[
    ["🪓 Расчистить лес под поля",{food:20,eco:-18,water:-8},"Полей больше, но почва теряет влагу.","risk"],
    ["🧪 Увеличить химизацию",{food:22,eco:-16,water:-10},"Быстрый урожай сопровождается загрязнением и расходом воды.","risk"],
    ["🚢 Ввозить продовольствие",{food:14,budget:-20,power:-4},"Импорт кормит жителей, но требует денег и энергии.","tradeoff"],
    ["🌾 Восстановить плодородие",{food:8,water:5,eco:6,budget:-10},"Умеренный урожай без истощения почвы.","balanced"]
  ],
  eco:[
    ["🚫 Немедленно закрыть станции",{eco:18,power:-19,budget:-8},"Загрязнение снизилось, но начался дефицит энергии.","risk"],
    ["🌲 Засадить всё монокультурой",{eco:20,water:-14,food:-6},"Быстрое озеленение истощает воду и угрожает урожаю.","risk"],
    ["💰 Закупить компенсации",{eco:8,budget:-20,food:-4},"Экологические проекты требуют дорогого финансирования.","tradeoff"],
    ["🌿 Восстановить разнообразие",{eco:9,water:6,food:4,budget:-10},"Водоёмы, леса и поля восстанавливаются вместе.","balanced"]
  ]
});
const clamp = value => Math.max(0,Math.min(100,Math.round(value)));
const copy = value => JSON.parse(JSON.stringify(value));
const validKind = kind => Object.hasOwn(STRUCTURES,kind);
function apply(stats,effect) {
  for (const [key,delta] of Object.entries(effect)) {
    if (!KEYS.includes(key) || !Number.isFinite(delta)) throw Error("Invalid effect: "+key);
    stats[key]=clamp(stats[key]+delta);
  }
}
function record(world,events,source,text,delta,parentId=null) {
  const event={id:world.nextEventId++,turn:world.stats.turn,source,text,delta:{...delta},parentId};
  world.history.push(event);
  if (world.history.length>120) world.history.shift();
  events.push(event);
  return event.id;
}
function crises(world,events) {
  const {stats}=world;
  if (stats.power<10) {
    const effect={population:-2,food:-6};apply(stats,effect);
    record(world,events,"crisis","Нехватка энергии: жители уезжают, запасы еды сокращаются.",effect);
  }
  if (stats.water<10) {
    const effect={food:-6,eco:-4};apply(stats,effect);
    record(world,events,"crisis","Засуха: урожай и экология страдают.",effect);
  }
  if (stats.eco<10) {
    const effect={food:-4};apply(stats,effect);
    record(world,events,"crisis","Экологический кризис: падает урожайность.",effect);
  }
}
function tick(previous,change=null) {
  const world=copy(previous),events=[];
  world.stats.turn+=1;
  const due=world.pending.filter(event=>event.due<=world.stats.turn);
  world.pending=world.pending.filter(event=>event.due>world.stats.turn);
  for(const event of due) {
    apply(world.stats,event.effect);
    record(world,events,"delayed",event.text,event.effect,event.parentId);
  }
  if(change)change(world,events);
  crises(world,events);
  return {world,events};
}
function enqueue(world,kind,parentId) {
  for(const [delay,effect,text] of STRUCTURES[kind].delayed)
    world.pending.push({due:world.stats.turn+delay,effect:{...effect},text,parentId});
  // A bounded queue prevents a prolonged session from growing unboundedly.
  if(world.pending.length>200)world.pending=world.pending.slice(-200);
}
export function createWorld() {
  return {version:VERSION,stats:{...START},placed:{city:0,forest:0,energy:0,volcano:0},
    pending:[],history:[],nextEventId:1};
}
export function placeStructure(previous,kind) {
  if(!validKind(kind))throw Error("Unknown structure");
  return tick(previous,(world,events)=>{
    const item=STRUCTURES[kind];
    world.placed[kind]+=1;
    apply(world.stats,item.effect);
    const root=record(world,events,kind,item.description,item.effect);
    enqueue(world,kind,root);
  });
}
export function advanceTick(previous) {
  return tick(previous);
}
function deficitResource(world) {
  return RESOURCE_KEYS.reduce((lowest,key)=>world.stats[key]<world.stats[lowest]?key:lowest,RESOURCE_KEYS[0]);
}
function shuffledChoices(world) {
  const resource=deficitResource(world),arr=CHOICES[resource].map(([label,effect,message,role],id)=>
    ({id,label,effect:{...effect},message,role}));
  // Deterministic permutation: the same world always shows the same order.
  let seed=world.stats.turn+world.stats.budget*7+world.stats.population*13+19;
  for(let i=arr.length-1;i>0;i--) {
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const j=seed%(i+1);[arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return {resource,choices:arr};
}
export function getGenieChoices(world) {
  return shuffledChoices(world);
}
export function applyGenieChoice(previous,choiceId) {
  const {resource,choices}=getGenieChoices(previous);
  const choice=choices.find(item=>item.id===choiceId);
  if(!choice)throw Error("Unknown Genie choice");
  const result=tick(previous,(world,events)=>{
    apply(world.stats,choice.effect);
    record(world,events,"genie",choice.message,choice.effect);
  });
  return {...result,choice,resource};
}
const PATTERNS={
  forest:/лес|дерев|растен|озелен/i,
  city:/город|дом|здан|поселен/i,
  energy:/энерг|солн|электр|ветр|турбин/i,
  volcano:/вулкан|лав|геотерм/i
};
export function interpretIdea(input) {
  const text=String(input??"").trim().slice(0,800);
  return {text,kinds:Object.entries(PATTERNS).filter(([,pattern])=>pattern.test(text)).map(([kind])=>kind)};
}
export function applyIdea(previous,input) {
  const idea=interpretIdea(input);
  if(!idea.text)throw Error("Опиши идею.");
  if(!idea.kinds.length)
    return {world:previous,events:[],supported:false,
      feedback:"Этот механизм пока не поддерживается. Мир и ресурсы не изменены: уточни, какие структуры построить и как они работают."};
  const result=tick(previous,(world,events)=>{
    apply(world.stats,{budget:-6});
    const root=record(world,events,"idea","Проект: "+idea.text,{budget:-6});
    for(const kind of idea.kinds) {
      world.placed[kind]+=1;
      apply(world.stats,STRUCTURES[kind].effect);
      record(world,events,kind,STRUCTURES[kind].description,STRUCTURES[kind].effect,root);
      enqueue(world,kind,root);
    }
  });
  return {...result,supported:true,kinds:idea.kinds};
}
function safeWorld(world) {
  if(!world || world.version!==VERSION || !world.stats || !world.placed ||
     !Array.isArray(world.pending)||!Array.isArray(world.history)||
     world.pending.length>200||world.history.length>120||
     !Number.isSafeInteger(world.nextEventId)||world.nextEventId<1)return false;
  for(const key of Object.keys(START))
    if(!Number.isSafeInteger(world.stats[key]) || world.stats[key]<0 ||
       world.stats[key]>(key==="turn"?1000000:100))return false;
  for(const kind of Object.keys(STRUCTURES))
    if(!Number.isSafeInteger(world.placed[kind])||world.placed[kind]<0||world.placed[kind]>1000000)return false;
  return world.pending.every(item=>Number.isSafeInteger(item.due)&&item.due>=0&&
    item.due<=1000002&&item.effect&&Object.entries(item.effect).every(([k,v])=>
      KEYS.includes(k)&&Number.isFinite(v))&&typeof item.text==="string"&&item.text.length<500);
}
export function serialize(world) {return JSON.stringify({version:VERSION,world});}
export function restore(raw) {
  if(!raw||raw.length>120000)return null;
  try{
    const payload=JSON.parse(raw);
    return payload.version===VERSION&&safeWorld(payload.world)?payload.world:null;
  }catch{return null;}
}
