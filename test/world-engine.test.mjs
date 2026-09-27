import test from "node:test";
import assert from "node:assert/strict";
import {
  VERSION, BUILDINGS, POLICIES, createWorld, getRates, dispatch, advance,
  interpretLocalIdea, validateAIPlan, preview, serialize, restore
} from "../cinematic/world-engine.mjs";

const build=(s,kind)=>dispatch(s,{type:"build",kind});
test("world begins as an empty scene with five initial choices",()=>{
  const s=createWorld(123);
  assert.equal(s.version,VERSION);
  assert.equal(s.turn,0);
  assert.deepEqual([s.counts.city,s.counts.forest,s.counts.energy,s.counts.volcano],[0,0,0,0]);
  assert.equal(s.stats.population,32);
  assert.equal(Object.keys(BUILDINGS).length,6);
  assert.equal(POLICIES.length,4);
});
test("same seed and commands reproduce exact events and weather",()=>{
  const run=seed=>{
    let s=createWorld(seed);
    for(const kind of ["forest","energy","city","forest"])s=build(s,kind);
    return advance(s,7);
  };
  assert.equal(serialize(run(27)),serialize(run(27)));
  assert.notEqual(serialize(run(27)),serialize(run(28)));
});
test("construction appears as a project immediately but only produces later",()=>{
  const a=createWorld(11),b=build(a,"energy");
  assert.equal(a.counts.energy,0,"original state must never mutate");
  assert.equal(b.counts.energy,1);
  assert.equal(b.built.energy,0);
  assert.equal(getRates(b).power,0);
  const c=advance(b);
  assert.equal(c.built.energy,1);
  assert.equal(getRates(c).power,15);
  assert.ok(c.stats.power>b.stats.power);
  assert.ok(c.history.some(e=>e.type==="build-ready"&&e.causeId));
});
test("an unaffordable batch is rejected atomically",()=>{
  const s=createWorld();
  s.stats.budget=25;
  const before=serialize(s);
  assert.throws(()=>dispatch(s,{type:"batch",steps:[
    {type:"build",kind:"forest"},{type:"build",kind:"energy"}
  ]}),/Не хватает/);
  assert.equal(serialize(s),before);
  assert.throws(()=>dispatch(s,{type:"batch",steps:[
    {type:"policy",id:"imports"},{type:"build",kind:"forest"}
  ]}),/Не хватает/);
});
test("crises start once, cause ongoing but non-stacking damage, then recover",()=>{
  const s=createWorld(17);s.stats.water=17;
  const a=advance(s),b=advance(a);
  assert.equal(b.history.filter(e=>e.type==="crisis-start"&&e.source==="Засуха").length,1);
  assert.ok(b.stats.food<a.stats.food);
  assert.deepEqual(getRates(a),getRates(b),"crises must not silently mutate the permanent rates");
  const recovered=JSON.parse(serialize(b));recovered.stats.water=37;
  const c=advance(recovered);
  assert.ok(c.history.some(e=>e.type==="crisis-end"&&e.source==="Засуха"));
  assert.equal(c.crises.drought,false);
});
test("ecological collapse cascades into water and food",()=>{
  const s=createWorld(8);s.stats.eco=15;
  const after=advance(s);
  assert.ok(after.history.some(e=>e.type==="crisis-start"&&e.source==="Токсичные дожди"));
  assert.ok(after.stats.water<s.stats.water);
  assert.ok(after.stats.food<s.stats.food);
});
test("dragon and follow-up pronoun are recognized in the same world",()=>{
  let s=createWorld(55);
  const arrival=interpretLocalIdea("Прилетел дракон",s);
  assert.equal(arrival.supported,true);
  s=dispatch(s,arrival.steps[0]);
  assert.ok(s.entities.some(e=>e.kind==="dragon"));
  const response=interpretLocalIdea("Люди в него стреляют",s);
  assert.equal(response.supported,true);
  s=dispatch(s,response.steps[0]);
  assert.ok(s.history.some(e=>e.type==="combat"));
  assert.equal(s.history.some(e=>e.type==="retaliation"),false,
    "the dragon must not retaliate within the same atomic player action");
  s=advance(s);
  assert.ok(s.history.some(e=>e.type==="retaliation"));
  const retaliation=s.history.find(e=>e.type==="retaliation");
  assert.ok(s.history.some(e=>e.id===retaliation.causeId&&e.type==="combat"));
});
test("unrecognized ideas are rejected, not converted into random effects",()=>{
  const s=createWorld(12);
  const result=interpretLocalIdea("Пусть вселенная превратится в музыкальную радугу",s);
  assert.equal(result.supported,false);
  assert.ok(result.reason.includes("AI-сервер"));
  assert.equal(s.turn,0);
  const farm=interpretLocalIdea("Построить ферму и завод",s);
  assert.deepEqual(farm.steps.map(e=>e.kind),["farm","factory"]);
});
test("LLM boundary rejects resource fabrication, scripts and oversized plans",()=>{
  assert.deepEqual(validateAIPlan({
    steps:[{type:"build",kind:"forest",cost:{budget:99999}}],
    description:" ".repeat(400)
  }).steps,[{type:"build",kind:"forest"}]);
  assert.throws(()=>validateAIPlan({steps:[{type:"giveMoney",amount:999}]}),/неподдерживаемое/);
  assert.throws(()=>validateAIPlan({steps:new Array(100).fill({type:"dragon"})}),/Некорректный/);
  assert.throws(()=>dispatch(createWorld(),{type:"build",kind:"unknown"}),/Неподдерживаемое/);
});
test("preview does not burn a turn and matches a real seeded run",()=>{
  const s=createWorld(741),before=serialize(s);
  const forecast=preview(s,{type:"build",kind:"forest"});
  const played=advance(build(s,"forest"),2);
  assert.equal(forecast.turn,played.turn);
  for(const [k,v] of Object.entries(forecast.delta))
    assert.equal(v,played.stats[k]-s.stats[k]);
  assert.equal(serialize(s),before);
});
test("save/restore has strict version, queue and bounds validation",()=>{
  const state=build(createWorld(51),"city");
  assert.deepEqual(restore(serialize(state)),state);
  assert.equal(restore("not json"),null);
  assert.equal(restore("{}"),null);
  const invalid=JSON.parse(serialize(state));
  invalid.version=VERSION+1;assert.equal(restore(JSON.stringify(invalid)),null);
  invalid.version=VERSION;invalid.stats.eco=Infinity;
  assert.equal(restore(JSON.stringify(invalid)),null);
  invalid.stats.eco=40;invalid.queue[0].type="run-script";
  assert.equal(restore(JSON.stringify(invalid)),null);
});
test("long sessions remain bounded and every stat finite",()=>{
  let s=createWorld(18);
  for(let i=0;i<400;i++){
    if(i%20===0&&s.stats.budget>=12)s=build(s,"forest");
    else s=advance(s);
  }
  assert.ok(s.history.length<=140);
  assert.ok(s.projects.length<=120);
  assert.ok(s.queue.length<=120);
  for(const value of Object.values(s.stats))assert.ok(Number.isFinite(value)&&value>=0&&value<=100);
  assert.ok(restore(serialize(s)),"a long session must be resumable");
});
