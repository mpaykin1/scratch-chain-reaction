import test from "node:test";
import assert from "node:assert/strict";
import {
  VERSION, PLANS, createScenario, analyzeIntent, choosePlan, advanceTick,
  advanceUntilChoice, previewPlan, serialize, restore, DEFAULT_EXPLANATIONS
} from "../cinematic/scenario-engine.mjs";

const allKeys=["water","power","food","eco","population","budget","happiness"];
const play=(planId,reason=DEFAULT_EXPLANATIONS[planId],seed=1234)=>
  advanceUntilChoice(choosePlan(createScenario(seed),planId,reason));

test("four plans represent two water failures, one shifted crisis, one balanced",()=>{
  assert.equal(PLANS.length,4);
  assert.deepEqual(PLANS.map(p=>p.role),
    ["worsens-water","worsens-water","shifts-crisis","balanced"]);
});
test("same seed and same intent yield bit-for-bit reproducible outcomes",()=>{
  const a=play("dam"),b=play("dam");
  assert.equal(serialize(a),serialize(b));
  assert.ok(new Set(Array.from({length:20},(_,i)=>play("watershed",DEFAULT_EXPLANATIONS.watershed,i+1).stats.water)).size>1,"seed should change weather deterministically");
  assert.equal(a.turn,3);
  assert.equal(a.phase,"choose");
});
test("different mechanisms cause genuinely different results",()=>{
  const dam=play("dam"),solar=play("watershed"),desal=play("desal");
  assert.notEqual(dam.stats.water,solar.stats.water);
  assert.notEqual(desal.stats.power,solar.stats.power);
  assert.ok(dam.stats.water<20);
  assert.ok(solar.stats.water>45);
});
test("water failure cascades through multiple generations to food and migration",()=>{
  const dam=play("dam");
  const causes=dam.history.filter(h=>h.type==="drought"&&h.parentId);
  assert.ok(causes.some(h=>h.tick===2));
  assert.ok(causes.some(h=>h.tick===3));
  assert.ok(dam.stats.population<48);
  assert.ok(dam.stats.food<46);
  assert.ok(dam.history.some(h=>h.source==="Засуха"));
  const drought=dam.history.find(h=>h.tick===3&&h.source==="Засуха");
  const cause=dam.history.find(h=>h.id===drought.causedById);
  assert.ok(cause&&cause.delta.water<0,"each crisis references an actual contributing event");
  assert.equal(drought.parentId,dam.projects[0].id);
});
test("desalination overload affects pumping, ecology and food",()=>{
  const s=play("desal");
  assert.ok(s.history.some(h=>h.type==="blackout"));
  assert.ok(s.history.some(h=>h.type==="pollution"));
  assert.ok(s.stats.power<15);
});
test("imports shift the crisis to the food budget rather than pretending free resources",()=>{
  const s=play("imports");
  assert.ok(s.history.some(h=>h.type==="budget"));
  assert.ok(s.stats.food<16);
  assert.ok(s.history.some(h=>h.type==="migration"));
});
test("rationale identifies mechanism, resources, uncertainties and counterexamples",()=>{
  const incomplete=analyzeIntent("Я построю плотину и получу воду.","dam");
  const thoughtful=analyzeIntent("Возведу плотину, оставлю сток соседям ниже по течению, выделю бюджет и рабочую силу.","dam");
  assert.equal(incomplete.valid,true);
  assert.ok(incomplete.feedback.some(x=>x.includes("ниже по течению")));
  assert.ok(thoughtful.feedback.length<incomplete.feedback.length);
  assert.equal(thoughtful.projectIntent.timeline,"Строительство и последствия в течение 4 ходов");
  assert.deepEqual(thoughtful.projectIntent.uncertainties,["Осадки","потребление","состояние сетей"]);
});
test("counterexample mitigations change same project under different intents",()=>{
  const a=play("desal",DEFAULT_EXPLANATIONS.desal);
  const b=play("desal","Построю опреснительный завод, а насосы подключу к солнечным панелям, чтобы обеспечить город водой.");
  assert.ok(b.stats.power>a.stats.power);
});
test("free input changes a known project but unknown intent is rejected openly",()=>{
  const a=play("own","Посажу лес, чтобы вода удерживалась в почве.");
  const b=play("own","Построю солнечные панели, чтобы обеспечить энергией насосы.");
  assert.notEqual(a.stats.eco,b.stats.eco);
  assert.notEqual(a.stats.power,b.stats.power);
  assert.throws(()=>choosePlan(createScenario(),"own","Я хочу летать по Луне на драконе и менять реальность."),/Нужна проверка/);
});
test("delayed consequences survive when a new project has started",()=>{
  let state=play("dam");
  assert.ok(state.queue.some(e=>e.tick===4));
  state=choosePlan(state,"watershed",DEFAULT_EXPLANATIONS.watershed);
  state=advanceTick(state);
  assert.ok(state.history.some(h=>h.tick===4&&h.text.includes("Застойная вода")));
  assert.ok(state.history.some(h=>h.tick===4&&h.text.includes("Ремонт труб")));
});
test("continue recovering even after catastrophe without hard game over",()=>{
  let state=play("dam");
  const low=state.stats.water;
  for(let i=0;i<3;i++){
    state=playNext(state,"watershed");
  }
  assert.ok(state.stats.water>low);
  assert.equal(state.phase,"choose");
  assert.ok(state.projects.length>=4);
  assert.ok(state.history.some(h=>h.type==="recovery"));
});
function playNext(state,planId){
  return advanceUntilChoice(choosePlan(state,planId,DEFAULT_EXPLANATIONS[planId]));
}
test("structures appear only at scheduled construction ticks",()=>{
  let state=choosePlan(createScenario(7),"watershed",DEFAULT_EXPLANATIONS.watershed);
  assert.equal(state.visuals.forest,false);
  state=advanceTick(state);assert.equal(state.visuals.forest,false);
  state=advanceTick(state);assert.equal(state.visuals.forest,true);
  state=advanceTick(state);assert.equal(state.visuals.power,true);
  let own=choosePlan(createScenario(7),"own","Поставлю солнечные панели, чтобы запитать насосы и собрать дождевую воду.");
  assert.equal(own.visuals.power,false);
  own=advanceTick(own);assert.equal(own.visuals.power,true);
});
test("preflight forecasts do not mutate state or burn turns",()=>{
  const state=createScenario(7),before=serialize(state);
  const forecast=previewPlan(state,"dam",DEFAULT_EXPLANATIONS.dam);
  assert.equal(serialize(state),before);
  assert.equal(forecast.events.filter(e=>e.tick>0&&e.type!=="consumption").length>0,true);
  assert.ok(Number.isFinite(forecast.delta.water));
});
test("save/restore validates version, bounds and malformed snapshots",()=>{
  const s=play("watershed");
  assert.deepEqual(restore(serialize(s)),s);
  assert.equal(restore("invalid-json"),null);
  const wrong=JSON.parse(serialize(s));
  wrong.version=VERSION+1;assert.equal(restore(JSON.stringify(wrong)),null);
  wrong.version=VERSION;wrong.stats.water=Infinity;
  assert.equal(restore(JSON.stringify(wrong)),null);
});
test("all stats remain finite and in bounds over 36 consecutive projects",()=>{
  let state=createScenario(81);
  for(let i=0;i<36;i++){
    const id=PLANS[i%4].id;
    state=playNext(state,id);
    for(const key of allKeys)assert.ok(state.stats[key]>=0&&state.stats[key]<=100,key);
  }
  assert.equal(state.projects.length,36);
  assert.ok(state.history.length<=150);
  for(let i=36;i<225;i++)state=playNext(state,PLANS[i%4].id);
  assert.ok(state.projects.length<=180,"old resolved projects should compact automatically");
  assert.ok(restore(serialize(state)),"long sessions must remain resumable");
});

