// Deterministic water-crisis vertical slice. No hidden AI calls or randomness.
export const VERSION = 1;
export const START = Object.freeze({
  turn: 0, population: 48, power: 42, water: 23, food: 46,
  eco: 33, budget: 76, happiness: 38
});
export const PLANS = Object.freeze([
  { id: "dam", icon: "🌊", title: "Огромная плотина",
    role: "worsens-water", detail: "Запас воды сейчас, засуха ниже по течению позже.",
    mechanism: "Плотина задерживает воду в верховьях." },
  { id: "desal", icon: "🏭", title: "Опреснительный завод",
    role: "worsens-water", detail: "Быстрая вода ценой перегрузки электросети.",
    mechanism: "Насосы и фильтры требуют электричества." },
  { id: "imports", icon: "🚚", title: "Импорт воды",
    role: "shifts-crisis", detail: "Вода приходит сразу, расходы угрожают продовольствию.",
    mechanism: "Внешние поставки требуют бюджета и дорог." },
  { id: "watershed", icon: "🌱", title: "Восстановление водосбора",
    role: "balanced", detail: "Лес, накопители, ремонт труб — постепенно.",
    mechanism: "Меньше потерь и здоровая почва пополняют запасы." }
]);
const EVENTS = {
  dam: [
    [1, "Верхнее водохранилище наполняется.", {water:12,power:2}, "water"],
    [2, "Ниже плотины пересыхает пойма.", {water:-16,eco:-11,food:-5}, "drought"],
    [3, "Засуха ниже по течению достигает города.", {water:-18,food:-11,population:-3}, "drought"],
    [4, "Застойная вода ухудшает качество водохранилища.", {water:-7,eco:-5}, "pollution"]
  ],
  desal: [
    [1, "Опреснительный завод подает воду.", {water:15,power:-9}, "water"],
    [2, "Сеть не выдерживает нагрузки: насосы отключаются.", {water:-19,power:-12,food:-3}, "blackout"],
    [3, "Сброс соленого рассола повреждает прибрежную экосистему.", {water:-12,eco:-13,food:-5}, "pollution"],
    [4, "Длительный ремонт насосов вновь сокращает подачу.", {water:-7,budget:-5}, "blackout"]
  ],
  imports: [
    [1, "Первая автоколонна доставляет воду.", {water:13,budget:-8}, "import"],
    [2, "На импорт ушли средства продовольственного фонда.", {budget:-14,food:-13,happiness:-8}, "budget"],
    [3, "Поставщик повысил цену: на продукты денег не осталось.", {water:-9,budget:-9,food:-17,happiness:-7}, "budget"],
    [4, "Перебои поставок вызывают отъезд семей.", {water:-8,population:-4}, "migration"]
  ],
  watershed: [
    [1, "Ремонт труб и сбор дождевой воды сокращают потери.", {water:11,eco:4}, "water"],
    [2, "Лес задерживает влагу; фермеры получают первую воду.", {water:10,eco:7,food:7}, "forest"],
    [3, "Малый резервуар и солнечные насосы стабилизируют сеть.", {water:10,power:7,eco:4,happiness:6}, "recovery"],
    [4, "Восстановленный водосбор поддерживает урожай.", {water:7,food:8,eco:5}, "recovery"]
  ]
};
const COST = {
  dam: {water:18,eco:-7,budget:-16,power:-2},
  desal: {water:16,power:-16,budget:-20,eco:-3},
  imports: {water:25,budget:-22,power:-2},
  watershed: {water:4,eco:6,budget:-17,power:-1}
};
const PER_TICK = {water:-4,food:-2,power:-2,eco:-1,budget:1};
const LIMITS = ["population","power","water","food","eco","budget","happiness"];
const copy = value => JSON.parse(JSON.stringify(value));
const limit = n => Math.max(0,Math.min(100,Math.round(n)));
const nextId = (state,prefix) => prefix + "-" + (state.nextId++);
const clean = text => String(text || "").trim().slice(0,500);
const planById = id => PLANS.find(p => p.id === id);

export function createScenario(seed=270927) {
  const state = {version:VERSION,seed:Number.isSafeInteger(seed)?seed:270927,
    stats:{...START},turn:0,phase:"choose",chosen:null,
    queue:[],history:[],projects:[],nextId:1,ending:null,
    visuals:{city:true,forest:false,power:false,volcano:false},last:null};
  record(state,0,"Начало","Город вырос, но запасов воды почти не осталось. Люди ждут решения.",{},null,"intro");
  return state;
}
function record(state,tick,source,text,delta,parentId,type,causedById=null) {
  const event={id:nextId(state,"event"),tick,source,text,delta:copy(delta),
    parentId:parentId || null,causedById,type,stats:{...state.stats}};
  state.history.push(event);
  if(state.history.length>150)state.history.shift();
  state.last=event;
  return event;
}
function change(state,delta) {
  for(const [name,value] of Object.entries(delta)){
    if(!LIMITS.includes(name) || !Number.isFinite(value))throw Error("Invalid effect: " + name);
    state.stats[name]=limit(state.stats[name]+value);
  }
}
function findSignals(text) {
  const t=clean(text).toLowerCase();
  return {
    goal:/вод|засух|урож|пить|жажд/.test(t),
    mechanism:/плотин|водохранилищ|опресн|насос|труб|фильтр|очист|собир|сбор|дожд|лес|дерев|импорт|достав|эконом|повторн|рециркул|солнеч|ветр|резерв/.test(t),
    resources:/энерг|электр|бюдж|деньг|финанс|лес|дерев|солнеч|ветр|времен|рабоч|люд|запас|труб|солен/.test(t),
    downstream:/ниж|течен|эколог|сосед|фермер|загрязнен|рассол/.test(t),
    solar:/солнеч|ветр/.test(t),
    filter:/фильтр|очист/.test(t),
    trees:/лес|дерев/.test(t),
    reserve:/резерв|собир|сбор|дожд|повторн|рециркул/.test(t),
    budget:/бюдж|деньг|финанс|затрат|цен|расход/.test(t)
  };
}
export function analyzeIntent(text,planId) {
  const rationale=clean(text), signals=findSignals(rationale);
  if(rationale.length<12)return {
    valid:false,rationale,projectIntent:null,
    feedback:["Объясни хотя бы одним предложением, как это повлияет на воду."]
  };
  const plan=planById(planId);
  const mechanisms=[];
  if(signals.trees)mechanisms.push("лес удерживает влагу");
  if(signals.reserve)mechanisms.push("запас или повторное использование воды");
  if(signals.solar)mechanisms.push("возобновляемое питание насосов");
  if(signals.filter)mechanisms.push("очистка воды");
  if(!mechanisms.length && plan)mechanisms.push(plan.mechanism);
  const feedback=[];
  if(!signals.mechanism)feedback.push("Как именно эта структура добавит питьевую воду?");
  if(!signals.resources)feedback.push("Укажи ресурсы: энергию, бюджет, людей или материалы.");
  if(planId==="dam"&&!signals.downstream)feedback.push("Что произойдет с поселениями ниже по течению?");
  if(planId==="desal"&&!signals.solar)feedback.push("Чем будут питаться насосы при отключении сети?");
  if(planId==="imports"&&!signals.budget)feedback.push("Как оплатить новые поставки и сохранить деньги на еду?");
  if(planId==="watershed"&&!signals.reserve&&!signals.trees)
    feedback.push("Какой участок водосбора и какие потери воды ты восстановишь?");
  return {
    valid:true,rationale,feedback,signals,
    projectIntent:{
      goal:signals.goal?"Восстановить доступ к воде":"Повлиять на доступность воды",
      mechanism:mechanisms.join("; ")||"Механизм требует уточнения",
      resources:signals.resources?"Ресурсы названы":"Ресурсы не указаны",
      assumptions:feedback.slice(),
      timeline:"Строительство и последствия в течение 4 ходов",
      consequences:"Прямой эффект, запаздывающие эффекты и вторичные кризисы",
      uncertainties:["Осадки","потребление","состояние сетей"]
    }
  };
}
function mitigations(planId,signals) {
  if(planId==="desal"&&signals.solar)return {power:8,eco:3};
  if(planId==="dam"&&signals.downstream)return {eco:6,water:3};
  if(planId==="imports"&&signals.budget)return {budget:6,food:3};
  if(planId==="watershed"&&signals.reserve)return {water:5};
  return {};
}
function ownPlan(text) {
  const s=findSignals(text);
  // This is a disclosed keyword-based fallback, not a general-purpose LLM.
  const named=[s.trees,s.reserve,s.solar,s.filter].filter(Boolean).length;
  if(!named)return {supported:false,signals:s,detail:"Не обнаружен известный механизм. Нужна проверка проекта человеком или ИИ."};
  const effect={budget:-8};
  if(s.trees){effect.eco=8;effect.water=4;}
  if(s.reserve)effect.water=(effect.water||0)+7;
  if(s.solar)effect.power=11;
  if(s.filter)effect.water=(effect.water||0)+5;
  return {supported:true,signals:s,effect,detail:"Пилотный проект: " +
    [s.trees?"озеленение":"",s.reserve?"сбор воды":"",s.solar?"солнечные насосы":"",s.filter?"фильтрация":""].filter(Boolean).join(", ")};
}
export function choosePlan(previous,planId,rationale) {
  if(previous.phase!=="choose")throw Error("Complete the current project first");
  const state=copy(previous),isFree=planId==="own",plan=planById(planId);
  if(!isFree&&!plan)throw Error("Unknown plan");
  const intent=analyzeIntent(rationale,planId);
  if(!intent.valid)throw Error(intent.feedback[0]);
  const free=isFree?ownPlan(intent.rationale):null;
  if(isFree&&!free.supported)throw Error(free.detail);
  const rootId=nextId(state,"project");
  const project={id:rootId,planId,role:plan?.role || "user-defined",
    title:plan?.title||"Твой проект",rationale:intent.rationale,
    intent:intent.projectIntent,feedback:intent.feedback,
    startTick:state.turn,lastTick:state.turn+4,freeAnalysis:free?.detail||null};
  state.projects.push(project);
  if(state.projects.length>180){
    const referenced=new Set(state.history.map(e=>e.parentId).concat(state.queue.map(e=>e.parentId)));
    referenced.add(rootId);
    state.projects=state.projects.filter(p=>referenced.has(p.id)).slice(-180);
  }
  const immediate=isFree?free.effect:COST[planId];
  change(state,immediate);
  record(state,state.turn,project.title,"Проект запущен. " +
    (free?.detail||plan?.detail||""),immediate,rootId,"build");
  const schedule=isFree?[
    [1,"Пилотный проект начал действовать.",{water:(free.effect.water||0)>0?5:0,eco:free.signals.trees?3:0},"pilot"],
    [2,"Вода и энергия требуют постоянного обслуживания.",{budget:-4,power:free.signals.solar?4:-2},"maintenance"],
    [3,"Жители оценили результаты проекта.",{happiness:free.signals.reserve?6:3,food:free.signals.trees?5:0},"recovery"],
    [4,"Проект продолжает влиять на окружающий мир.",{eco:free.signals.trees?4:0,water:free.signals.filter?4:0},"recovery"]
  ]:EVENTS[planId];
  const insurance=isFree?{}:mitigations(planId,intent.signals);
  for(const [delay,text,delta,type] of schedule){
    const finalDelta={...delta};
    if(delay===2 && planId==="desal"&&insurance.power){finalDelta.power+=insurance.power;}
    if(delay===2 && planId==="dam"&&insurance.eco){finalDelta.eco+=insurance.eco;finalDelta.water+=insurance.water;}
    if(delay===2 && planId==="imports"&&insurance.budget){finalDelta.budget+=insurance.budget;finalDelta.food+=insurance.food;}
    if(delay===1&&planId==="watershed"&&insurance.water)finalDelta.water+=insurance.water;
    state.queue.push({id:nextId(state,"scheduled"),tick:state.turn+delay,
      parentId:rootId,source:project.title,text,delta:finalDelta,type});
  }
  // Assets appear when scheduled construction or growth completes, not at click-time.
  state.phase="simulating";state.chosen=rootId;state.ending=null;
  return state;
}
function passiveDrain(state){
  const weather=((Math.imul(state.seed ^ (state.turn*31),1664525)>>>8)%3)-1;
  const delta={...PER_TICK,water:PER_TICK.water+weather};
  if(state.stats.population>60)delta.water-=2;
  if(state.stats.eco>65)delta.water+=2;
  change(state,delta);
  record(state,state.turn,"Время","Потребление продолжается. "+
    (weather>0?"Прошёл небольшой дождь.":weather<0?"Сухой день.":"Погода без изменений."),delta,null,"consumption");
}
function causeFor(state,metric){
  return [...state.history].reverse().find(e=>e.parentId && e.delta?.[metric]<0)||null;
}
function detectCrises(state){
  const alerts=[];
  const crisis=(metric,source,text,delta,type)=>{
    const cause=causeFor(state,metric);
    change(state,delta);
    alerts.push(record(state,state.turn,source,text,delta,cause?.parentId||null,type,cause?.id||null));
  };
  if(state.stats.power<15){
    crisis("power","Энергосистема","Недостаток энергии останавливает насосы.",
      {water:-4,food:-3,happiness:-5},"blackout");
  }
  if(state.stats.water<20){
    crisis("water","Засуха","Без воды фермеры теряют урожай, жители покидают город.",
      {food:-8,population:-2,happiness:-8},"drought");
  }
  if(state.stats.food<16){
    crisis("food","Продовольствие","Нехватка еды вынуждает семьи уехать.",
      {population:-3,happiness:-8},"migration");
  }
  if(state.stats.eco<15){
    crisis("eco","Экология","Повреждение экосистемы ухудшает урожай.",
      {food:-4,happiness:-4},"pollution");
  }
  return alerts;
}
export function advanceTick(previous) {
  if(previous.phase!=="simulating")throw Error("Choose and explain a project first");
  const state=copy(previous);
  state.turn+=1;
  passiveDrain(state);
  const due=state.queue.filter(e=>e.tick===state.turn);
  state.queue=state.queue.filter(e=>e.tick>state.turn);
  for(const e of due){
    change(state,e.delta);
    if(e.type==="forest")state.visuals.forest=true;
    if(e.source==="Опреснительный завод"&&e.type==="water")state.visuals.power=true;
    if(e.type==="recovery"&&e.delta.power>0)state.visuals.power=true;
    if(e.type==="pilot"){
      const freeProject=state.projects.find(p=>p.id===e.parentId);
      const signals=findSignals(freeProject?.rationale||"");
      if(signals.trees)state.visuals.forest=true;
      if(signals.solar)state.visuals.power=true;
    }
    record(state,state.turn,e.source,e.text,e.delta,e.parentId,e.type);
  }
  detectCrises(state);
  if(state.stats.water>=45&&state.stats.food>=25&&state.stats.power>=20){
    state.stats.happiness=limit(state.stats.happiness+3);
    record(state,state.turn,"Восстановление",
      "Вода, энергия и еда доступны; удовлетворённость жителей растёт.",
      {happiness:3},state.chosen,"recovery");
  }
  if(state.turn>=state.projects.at(-1).startTick+3){
    state.phase="choose";
    state.chosen=null;
    state.ending=state.stats.water<20?"Кризис продолжается. Можно выбрать новый проект.":
      "Решение принесло результаты. Но отложенные последствия ещё возможны.";
  }
  return state;
}
export function advanceUntilChoice(previous,max=3){
  let state=copy(previous),steps=0;
  while(state.phase==="simulating"&&steps<max){state=advanceTick(state);steps++;}
  return state;
}
export function previewPlan(state,planId,rationale){
  const p=choosePlan(state,planId,rationale);
  const projected=advanceUntilChoice(p);
  return {stats:{...projected.stats},events:projected.history.slice(state.history.length),
    delta:Object.fromEntries(LIMITS.map(k=>[k,projected.stats[k]-state.stats[k]])),
    explanation:projected.projects.at(-1).feedback};
}
export function serialize(state){return JSON.stringify(state);}
export function restore(serialized) {
  let data;
  try {data=JSON.parse(serialized);} catch {return null;}
  if(!data||data.version!==VERSION||!Array.isArray(data.history)||!Array.isArray(data.projects)||
     !Array.isArray(data.queue)||!["choose","simulating"].includes(data.phase)||
     !data.stats||!Number.isSafeInteger(data.turn)||data.turn<0)return null;
  for(const k of LIMITS)if(!Number.isFinite(data.stats[k])||data.stats[k]<0||data.stats[k]>100)return null;
  if(data.history.length>150||data.projects.length>200||data.queue.length>100)return null;
  if(!Number.isSafeInteger(data.nextId)||data.nextId<1)return null;
  return data;
}
export const DEFAULT_EXPLANATIONS = Object.freeze({
  dam:"Перекрою реку плотиной, чтобы обеспечить город питьевой водой.",
  desal:"Запущу насосы и опресню морскую воду, чтобы люди могли пить.",
  imports:"Куплю воду у соседей, выделю бюджет и привезу цистернами.",
  watershed:"Посажу лес, отремонтирую трубы и соберу дождевую воду."
});

