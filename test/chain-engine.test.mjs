import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,playBuild,playIdea,playDecision,serializeWorld,restoreWorld,interpretIdea,getGenieChoices} from '../cinematic/chain-engine.mjs';
import {fitCanvas} from '../cinematic/quality.mjs';
import {createAdaptiveQuality} from '../cinematic/adaptive-quality.mjs';

const run=steps=>steps.reduce((world,step)=>playBuild(world,step).world,createWorld());
test('physical render buffer never exceeds 1080px on a 3x iPhone and desktop',()=>{
  const phone=fitCanvas(390,844,3),landscape=fitCanvas(844,390,3),desktop=fitCanvas(2560,1440,1);
  for(const shape of [phone,landscape,desktop])assert.ok(Math.max(shape.width,shape.height)<=1080);
  assert.ok(Math.abs(phone.width/phone.height-390/844)<.005);
  assert.equal(fitCanvas(390,844,3,1080,.6).height,648);
});
test('same actions produce identical states, event history and delayed effects',()=>{
  const a=run(['forest','city','energy','volcano']);
  const b=run(['forest','city','energy','volcano']);
  assert.equal(serializeWorld(a),serializeWorld(b));
  assert.ok(a.history.some(e=>e.type==='delayed'));
  assert.equal(a.state.turn,4);
});
test('decisions have distinct deterministic resource tradeoffs',()=>{
  const w=playBuild(createWorld(),'energy').world;
  const outcomes=[0,1,2,3].map(i=>playDecision(w,i).world.state);
  assert.equal(new Set(outcomes.map(s=>JSON.stringify(s))).size,4);
  assert.ok(outcomes.every(s=>Object.values(s).every(x=>Number.isInteger(x)&&x>=0&&x<=100)));
});
test('free text maps multiple constructions to a single turn and visual objects',()=>{
  const result=playIdea(createWorld(),'Посадить лес и поставить солнечные батареи у фермы');
  assert.equal(result.recognized,true);
  assert.equal(result.world.state.turn,1);
  assert.ok(result.world.placed.forest>0&&result.world.placed.energy>0);
  assert.ok(result.world.state.food>0);
  assert.ok(result.events.some(e=>e.parentId));
});
test('unsupported and negated ideas do not silently modify the world',()=>{
  const original=createWorld();
  for(const text of ['Дракон разговаривает с луной','не строить город','']){
    const result=playIdea(original,text);
    assert.equal(result.recognized,false,text);
    assert.equal(serializeWorld(result.world),serializeWorld(original));
    assert.ok(result.reason);
  }
  assert.equal(interpretIdea('X'.repeat(801)).actions.length,0);
});
test('100 turns keep stats in bounds and cap history and queues',()=>{
  const w=run(Array.from({length:100},(_,i)=>['city','forest','energy','volcano'][i%4]));
  assert.equal(w.state.turn,100);
  assert.ok(w.history.length<=150);
  assert.ok(w.queue.length<100);
  assert.ok(Object.values(w.state).every(x=>Number.isInteger(x)&&x>=0&&x<=100));
});
test('restore validates version, malformed JSON and resource bounds',()=>{
  const w=run(['forest','energy']);
  assert.equal(serializeWorld(restoreWorld(serializeWorld(w))),serializeWorld(w));
  assert.equal(restoreWorld('bad-json'),null);
  const corrupted=JSON.parse(serializeWorld(w));
  corrupted.state.eco=Infinity;
  assert.equal(restoreWorld(JSON.stringify(corrupted)),null);
  corrupted.state.eco=50;corrupted.version=100;
  assert.equal(restoreWorld(JSON.stringify(corrupted)),null);
});

test('Genie presents deterministic choices for the weakest current resource',()=>{
  const energy=playBuild(createWorld(),'energy').world;
  const one=getGenieChoices(energy),two=getGenieChoices(energy);
  assert.deepEqual(one,two);
  assert.equal(one.crisis,'water','power is adequate; missing water becomes the priority');
  assert.equal(one.choices.length,4);
  assert.ok(one.choices.every(option=>option.label.includes('вод')||option.label.includes('рек')||option.label.includes('водосбор')));
  assert.equal(new Set(one.choices.map(option=>JSON.stringify(option.delta))).size,4);
});
test('Genie decisions advance ticks, run delayed effects and remain replayable',()=>{
  const first=playBuild(createWorld(),'forest').world;
  const decision=playDecision(first,0);
  assert.equal(decision.world.state.turn,2);
  assert.ok(decision.events.some(event=>event.type==='decision'));
  assert.ok(decision.events.some(event=>event.parentId));
  const followUp=playDecision(decision.world,0);
  assert.equal(followUp.world.state.turn,3);
  assert.ok(followUp.events.some(event=>event.type==='delayed'&&event.tick===3));
  assert.equal(serializeWorld(followUp.world),serializeWorld(playDecision(playDecision(first,0).world,0).world));
  assert.equal(serializeWorld(restoreWorld(serializeWorld(followUp.world))),serializeWorld(followUp.world));
});
test('physical DPR is at most 2 even on small high-density screens',()=>{
  assert.deepEqual(fitCanvas(100,200,4),{width:200,height:400,scale:2});
});
test('adaptive GPU quality drops under sustained load and recovers when stable',()=>{
  const budget=createAdaptiveQuality();
  for(let i=0;i<18;i++)budget.observe(85);
  assert.ok(budget.quality<1);
  const lower=budget.quality;
  for(let i=0;i<90;i++)budget.observe(23);
  assert.ok(budget.quality>lower);
  const before=budget.quality;
  for(let i=0;i<200;i++)budget.observe(100,{visible:false});
  assert.equal(budget.quality,before,'background tabs must not degrade quality');
});
