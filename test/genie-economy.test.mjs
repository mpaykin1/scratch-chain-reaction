import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorld,playBuild,playDecision,playIdea,playCustomDecision,
  getDecisionOptions,quoteBuild,quoteIdea,advanceTick,serializeWorld,restoreWorld
} from '../cinematic/chain-engine.mjs';

test('all four Genie solutions adapt to the weakest resource and vary reproducibly',()=>{
  const world=createWorld();
  const options=getDecisionOptions(world);
  assert.equal(options.length,4);
  assert.equal(options[0].target,'power');
  assert.equal(options.filter(x=>x.role==='worsens').length,2);
  assert.equal(options.filter(x=>x.role==='shifts').length,1);
  assert.equal(options.filter(x=>x.role==='balanced').length,1);
  assert.equal(options.every(x=>typeof x.label==='string'&&x.label.length>15),true);
  assert.deepEqual(getDecisionOptions(world),options,'no random UI/engine mismatch');
  const outcomes=options.map((_,i)=>playDecision(world,i).world.state);
  assert.equal(new Set(outcomes.map(x=>JSON.stringify(x))).size,4);
  const ecology={...world,state:{...world.state,water:60,food:60,power:60,eco:1}};
  assert.ok(getDecisionOptions(ecology).every(x=>x.target==='eco'));
});
test('construction quotes prevent unaffordable clicks without changing state',()=>{
  const world=createWorld();
  const initial=serializeWorld(world);
  assert.deepEqual(quoteBuild(world,'energy'),{allowed:true,cost:16,reason:''});
  const poor={...world,state:{...world.state,budget:4}};
  assert.equal(quoteBuild(poor,'forest').allowed,false);
  assert.equal(quoteBuild(poor,'dragon').allowed,false);
  assert.equal(serializeWorld(world),initial);
});
test('multi-object ideas quote research and ALL construction costs',()=>{
  const world=createWorld();
  const text='Посадить лес и поставить солнечные панели';
  const quote=quoteIdea(world,text);
  assert.equal(quote.allowed,true);
  assert.equal(quote.cost,32);
  assert.deepEqual(quote.actions,['forest','energy']);
  const poor={...world,state:{...world.state,budget:31}};
  assert.equal(quoteIdea(poor,text).allowed,false);
  assert.equal(quoteIdea(world,'Летающий дракон').allowed,false);
  assert.equal(playIdea(world,text).world.state.turn,1);
});
test('free fifth solution resolves the pending choice in one decision turn',()=>{
  const built=playBuild(createWorld(),'forest').world;
  const result=playCustomDecision(built,'Поставить солнечные панели');
  assert.equal(result.recognized,true);
  assert.equal(result.world.state.turn,2);
  assert.equal(result.world.placed.energy,1);
  assert.ok(result.world.history.some(e=>e.type==='decision'&&e.tick===2));
  assert.equal(result.events.find(e=>e.type==='construction').parentId,
    result.events.find(e=>e.type==='decision').id);
  assert.equal(built.placed.energy,0,'previous snapshot not mutated');
});
test('idling produces ongoing deterministic resource effects and pays for recovery',()=>{
  const world=playBuild(createWorld(),'forest').world;
  const a=advanceTick(world),b=advanceTick(world);
  assert.equal(serializeWorld(a.world),serializeWorld(b.world));
  assert.equal(a.world.state.turn,world.state.turn+1);
  assert.ok(a.events.some(e=>e.type==='economy'));
  assert.ok(a.world.state.budget>world.state.budget);
  assert.equal(world.queue.length,1,'queue remains intact in the previous snapshot');
  let current=playBuild(createWorld(),'energy').world;
  for(let i=0;i<140;i++)current=advanceTick(current).world;
  assert.ok(Object.entries(current.state).every(([key,value])=>
    Number.isInteger(value)&&value>=0&&value<=(key==='turn'?100000:100)));
  assert.ok(current.history.length<=150);
  assert.ok(restoreWorld(serializeWorld(current)));
});
test('crises describe actual consequences with parent links',()=>{
  const world=playBuild(createWorld(),'city');
  assert.ok(world.events.some(e=>e.type==='hunger'&&e.parentId));
  const decision=playDecision(world.world,0);
  assert.equal(decision.events[0].type,'decision');
  assert.ok(decision.events.every(e=>e.parentId===null||Number.isInteger(e.parentId)));
});
