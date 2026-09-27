// Pure, replayable simulation. UI and AI adapters only submit validated commands.
export const VERSION = 2;
export const RESOURCES = ["population","power","water","food","eco","budget","happiness"];
export const BUILDINGS = {
  city:{title:"Город",cost:{budget:-24},delay:2,rate:{population:2,power:-6,water:-5,food:-4,eco:-2,budget:7}},
  forest:{title:"Лес",cost:{budget:-12,water:-8},delay:2,rate:{eco:5,water:3,food:2,budget:-1}},
  energy:{title:"Энергостанция",cost:{budget:-26},delay:2,rate:{power:15,eco:-3,water:-1,budget:2}},
  volcano:{title:"Вулкан",cost:{budget:-12},delay:1,rate:{power:10,eco:-7,water:-5,happiness:-2}},
  farm:{title:"Ферма",cost:{budget:-18,water:-9},delay:2,rate:{food:10,water:-7,eco:-2,budget:3}},
  factory:{title:"Завод",cost:{budget:-30},delay:2,rate:{budget:10,power:-8,water:-4,eco:-6,food:-2}}
};
export const POLICIES = [
  {id:"burn",title:"Сжечь лес",effect:{power:13,eco:-19,water:-6}},
  {id:"factory",title:"Мегазавод",effect:{power:19,eco:-15,food:-7}},
  {id:"imports",title:"Импорт",effect:{power:9,budget:-18,water:-4}},
  {id:"balanced",title:"Модернизация",effect:{power:8,eco:8,budget:-10}}
];
const BASE = {population:0,power:0,water:0,food:-2,eco:-1,budget:2,happiness:0};
const CRISES = {
  blackout:{metric:"power",on:9,off:20,needsInfrastructure:true,title:"Энергоколлапс",damage:{food:-3,budget:-3,happiness:-3}},
  drought:{metric:"water",on:18,off:30,title:"Засуха",damage:{food:-5,population:-1,happiness:-3}},
  famine:{metric:"food",on:14,off:27,title:"Голод",damage:{population:-3,happiness:-5}},
  pollution:{metric:"eco",on:22,off:37,title:"Токсичные дожди",damage:{water:-4,food:-4,happiness:-3}},
  debt:{metric:"budget",on:8,off:23,title:"Бюджетный кризис",damage:{power:-3,happiness:-4}}
};
const copy=x=>JSON.parse(JSON.stringify(x));
const clamp=x=>Math.max(0,Math.min(100,Math.round(x)));
const nextId=(s,p)=>p+"-"+s.nextId++;
function random(s){s.rng=(Math.imul(s.rng,1664525)+1013904223)>>>0;return s.rng/4294967296;}
function change(s,delta){
  const actual={};
  for(const [k,v] of Object.entries(delta)){
    if(!RESOURCES.includes(k)||!Number.isFinite(v))throw Error("Неверный ресурс: "+k);
    const before=s.stats[k];s.stats[k]=clamp(before+v);
    if(before!==s.stats[k])actual[k]=s.stats[k]-before;
  }
  return actual;
}
function emit(s,source,text,delta={},parentId=null,type="info",causeId=null){
  const e={id:nextId(s,"ev"),turn:s.turn,source,text,delta:copy(delta),parentId,type,causeId};
  s.history.push(e);if(s.history.length>140)s.history.shift();return e;
}
function schedule(s,delay,type,data,parentId,causeId){
  s.queue.push({id:nextId(s,"q"),due:s.turn+delay,type,data:copy(data),parentId,causeId});
}
export function createWorld(seed=270927){
  const n=Number.isSafeInteger(seed)?seed>>>0:270927;
  return {version:VERSION,seed:n,rng:n,turn:0,
    stats:{population:32,power:12,water:50,food:50,eco:68,budget:100,happiness:50},
    counts:{city:0,forest:0,energy:0,volcano:0,farm:0,factory:0},
    built:{city:0,forest:0,energy:0,volcano:0,farm:0,factory:0},
    projects:[],entities:[],lastEntity:null,queue:[],history:[],
    crises:Object.fromEntries(Object.keys(CRISES).map(k=>[k,false])),nextId:1};
}
export function getRates(s){
  const rates={...BASE};
  for(const [kind,n] of Object.entries(s.built))
    for(const [k,v] of Object.entries(BUILDINGS[kind].rate))rates[k]+=v*n;
  return rates;
}
function startBuild(s,kind){
  const b=BUILDINGS[kind],spent=change(s,b.cost);
  const root=emit(s,b.title,"Началось строительство. Работать начнёт через "+b.delay+" ход(а).",spent,null,"build-start");
  const project={id:nextId(s,"project"),kind,startTurn:s.turn,
    readyTurn:s.turn+b.delay,status:"building",rootEventId:root.id};
  s.projects.push(project);s.counts[kind]++;
  schedule(s,b.delay,"build-ready",{projectId:project.id},project.id,root.id);
}
function policy(s,id){
  const p=POLICIES.find(x=>x.id===id);
  if(!p)throw Error("Неизвестное решение Джинна");
  const e=emit(s,"Джинн",p.title,change(s,p.effect),null,"policy");
  if(id==="factory")schedule(s,2,"pollution",{},null,e.id);
}
function dragon(s){
  const e={id:nextId(s,"dragon"),kind:"dragon",hp:100,status:"flying"};
  s.entities.push(e);s.lastEntity=e.id;
  emit(s,"Событие","Прилетел дракон. Он кружит над поселением.",{},e.id,"creature");
}
function attack(s){
  const target=[...s.entities].reverse().find(e=>e.kind==="dragon"&&e.hp>0);
  if(!target)throw Error("Поблизости нет живого дракона.");
  const damage=28+Math.floor(random(s)*13);target.hp=Math.max(0,target.hp-damage);
  const shot=emit(s,"Жители","Люди стреляют в дракона: урон "+damage+
    ", здоровье "+target.hp+".",{},target.id,"combat");
  s.lastEntity=target.id;
  if(!target.hp){
    target.status="defeated";
    emit(s,"Жители","Дракон повержен. Угроза миновала.",
      change(s,{happiness:6}),target.id,"combat",shot.id);
  }else schedule(s,2,"retaliation",{dragonId:target.id},target.id,shot.id);
}
function due(s){
  const ready=s.queue.filter(e=>e.due<=s.turn);
  s.queue=s.queue.filter(e=>e.due>s.turn);
  for(const job of ready){
    if(job.type==="build-ready"){
      const p=s.projects.find(x=>x.id===job.data.projectId);
      if(!p||p.status!=="building")continue;
      p.status="active";s.built[p.kind]++;
      emit(s,BUILDINGS[p.kind].title,"Постройка заработала. Её эффекты теперь повторяются каждый ход.",
        {},p.id,"build-ready",job.causeId);
    }else if(job.type==="retaliation"){
      const target=s.entities.find(e=>e.id===job.data.dragonId);
      if(target?.hp>0)emit(s,"Дракон","Дракон отвечает огнём. Пострадали люди и дома.",
        change(s,{population:-2,eco:-3,budget:-5,happiness:-5}),
        target.id,"retaliation",job.causeId);
    }else if(job.type==="pollution"){
      emit(s,"Промышленность","Отложенные выбросы достигли реки.",
        change(s,{eco:-7,water:-4}),null,"pollution",job.causeId);
    }
  }
}
function crises(s){
  for(const [key,c] of Object.entries(CRISES)){
    const enabled=!c.needsInfrastructure||(s.built.city+s.built.factory+s.built.farm)>0;
    const value=s.stats[c.metric],active=s.crises[key];
    if(active&&(!enabled||value>=c.off)){
      s.crises[key]=false;emit(s,c.title,"Кризис преодолён.",{},null,"crisis-end");
    }else if(!active&&enabled&&value<c.on){
      const cause=[...s.history].reverse().find(e=>(e.delta?.[c.metric]||0)<0);
      s.crises[key]=true;emit(s,c.title,"Возник кризис. Смотри на цепочку последствий.",
        {},cause?.parentId||null,"crisis-start",cause?.id||null);
    }
    if(s.crises[key]){
      const actual=change(s,c.damage);
      if(Object.keys(actual).length)emit(s,c.title,"Продолжающиеся последствия.",actual,null,"crisis-effect");
    }
  }
}
function tick(s){
  s.turn++;due(s);
  const rate=getRates(s),weather=Math.floor(random(s)*3)-1;
  const delta=change(s,{...rate,water:rate.water+weather});
  if(Object.keys(delta).length)emit(s,"Ход "+s.turn,"Расход и производство ресурсов.",delta,null,"tick");
  crises(s);
  if(s.projects.length>120){
    s.projects=s.projects.filter(p=>p.status==="building")
      .concat(s.projects.filter(p=>p.status==="active").slice(-80));
  }
  if(s.entities.length>30)s.entities=s.entities.slice(-30);
  return s;
}
export function advance(previous,n=1){
  if(!Number.isSafeInteger(n)||n<1||n>20)throw Error("Недопустимое число ходов");
  const s=copy(previous);for(let i=0;i<n;i++)tick(s);return s;
}
export function dispatch(previous,command){
  const steps=command?.type==="batch"?command.steps:[command];
  if(!Array.isArray(steps)||!steps.length||steps.length>3)throw Error("От одного до трёх действий");
  const costs={};
  for(const item of steps){
    if(item?.type==="build"&&BUILDINGS[item.kind]){
      for(const [k,v] of Object.entries(BUILDINGS[item.kind].cost))costs[k]=(costs[k]||0)+v;
    }else if(item?.type==="policy"&&POLICIES.some(p=>p.id===item.id)){
      const p=POLICIES.find(p=>p.id===item.id);
      for(const [k,v] of Object.entries(p.effect))if(v<0)costs[k]=(costs[k]||0)+v;
    }
    else if(!["dragon","attack"].includes(item?.type))throw Error("Неподдерживаемое действие");
  }
  const missing=Object.entries(costs).find(([k,v])=>previous.stats[k]+v<0);
  if(missing)throw Error("Не хватает ресурса: "+missing[0]);
  if(steps.filter(s=>s.type==="attack").length>
    previous.entities.filter(e=>e.kind==="dragon"&&e.hp>0).length)
    throw Error("Нет живого дракона для атаки.");
  const s=copy(previous);
  for(const item of steps){
    if(item.type==="build")startBuild(s,item.kind);
    if(item.type==="policy")policy(s,item.id);
    if(item.type==="dragon")dragon(s);
    if(item.type==="attack")attack(s);
  }
  return tick(s);
}
export function interpretLocalIdea(raw,state){
  const text=String(raw||"").trim().slice(0,500),t=text.toLowerCase();
  if(text.length<3)return {supported:false,reason:"Напиши, что должно произойти."};
  if(/стрел|атак|напал|убить|удар|сраж|обстрел/.test(t)){
    if(!state.entities.some(e=>e.kind==="dragon"&&e.hp>0))
      return {supported:false,reason:"Не найдена цель атаки. Сначала добавь дракона."};
    return {supported:true,steps:[{type:"attack"}],description:"Жители атакуют дракона."};
  }
  if(/дракон/.test(t))
    return {supported:true,steps:[{type:"dragon"}],description:"Дракон появляется в мире."};
  const patterns=[
    ["forest",/лес|дерев|озелен|растен/],
    ["energy",/электростанц|энерг|электр|солн|ветр|турбин/],
    ["city",/город|дом|поселени|здани/],
    ["volcano",/вулкан|извержени|геотерм|лав/],
    ["farm",/ферм|пшен|урожай|поле/],
    ["factory",/завод|фабрик|шахт|производств/]
  ];
  const steps=patterns.filter(([,regex])=>regex.test(t))
    .slice(0,3).map(([kind])=>({type:"build",kind}));
  return steps.length?{supported:true,steps,
    description:"Распознано: "+steps.map(s=>BUILDINGS[s.kind].title).join(", ")+"."
  }:{supported:false,reason:"Пока не распознан механизм. Для других идей потребуется подключить AI-сервер."};
}
// An AI server may propose allowlisted actions, never arbitrary JS or resource deltas.
export function validateAIPlan(payload){
  if(!payload||!Array.isArray(payload.steps)||!payload.steps.length||payload.steps.length>3)
    throw Error("Некорректный план AI");
  const steps=payload.steps.map(s=>{
    if(s?.type==="build"&&BUILDINGS[s.kind])return {type:"build",kind:s.kind};
    if(s?.type==="dragon")return {type:"dragon"};
    if(s?.type==="attack")return {type:"attack"};
    throw Error("AI предложил неподдерживаемое действие");
  });
  return {supported:true,steps,description:String(payload.description||"").slice(0,240)};
}
export function preview(previous,command,extraTurns=2){
  const predicted=advance(dispatch(previous,command),extraTurns);
  return {turn:predicted.turn,
    delta:Object.fromEntries(RESOURCES.map(k=>[k,predicted.stats[k]-previous.stats[k]])),
    events:predicted.history.filter(e=>e.turn>previous.turn)};
}
export function serialize(s){return JSON.stringify(s);}
export function restore(json){
  try{
    if(typeof json!=="string"||json.length>500000)return null;
    const s=JSON.parse(json);
    if(!s||s.version!==VERSION||!Number.isSafeInteger(s.turn)||s.turn<0||
      !Number.isSafeInteger(s.nextId)||s.nextId<1||!Number.isSafeInteger(s.rng)||
      !s.stats||!s.counts||!s.built||!s.crises||
      !Array.isArray(s.history)||s.history.length>140||
      !Array.isArray(s.queue)||s.queue.length>120||
      !Array.isArray(s.projects)||s.projects.length>130||
      !Array.isArray(s.entities)||s.entities.length>30)return null;
    for(const k of RESOURCES)if(!Number.isFinite(s.stats[k])||s.stats[k]<0||s.stats[k]>100)return null;
    for(const k of Object.keys(BUILDINGS))
      if(!Number.isSafeInteger(s.counts[k])||s.counts[k]<0||
        !Number.isSafeInteger(s.built[k])||s.built[k]<0||s.built[k]>s.counts[k])return null;
    for(const k of Object.keys(CRISES))if(typeof s.crises[k]!=="boolean")return null;
    if(s.queue.some(e=>!Number.isSafeInteger(e.due)||e.due<s.turn||
      !["build-ready","retaliation","pollution"].includes(e.type)))return null;
    return s;
  }catch{return null;}
}
