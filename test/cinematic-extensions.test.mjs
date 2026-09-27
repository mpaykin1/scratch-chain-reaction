import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorld,playBuild,playDecision,playIdea,advanceTick,getGenieChoices,
  serializeWorld,restoreWorld
} from '../cinematic/chain-engine.mjs';

test('Genie picks the current weakest resource and supplies four different causal paths',()=>{
  const world=createWorld();
  Object.assign(world.state,{power:70,water:5,food:55,eco:60});
  const result=getGenieChoices(world);
  assert.equal(result.resource,'water');
  assert.equal(result.choices.length,4);
  assert.deepEqual(result.choices.map(choice=>choice.role).sort(),
    ['balanced','risk','risk','tradeoff'].sort());
  assert.equal(new Set(result.choices.map(choice=>choice.id)).size,4);
  assert.deepEqual(getGenieChoices(world),result,'choice ordering must be deterministic');
  const snapshots=result.choices.map(choice=>serializeWorld(playDecision(world,choice.id).world));
  assert.equal(new Set(snapshots).size,4,'all four options must produce distinct worlds');
  assert.ok(snapshots.every(snapshot=>restoreWorld(snapshot)));
});
test('Genie choices are replayable and advance time including queued effects',()=>{
  const start=playBuild(createWorld(),'forest').world;
  const before=getGenieChoices(start);
  const first=playDecision(start,before.choices[0].id);
  const second=playDecision(start,before.choices[0].id);
  assert.equal(serializeWorld(first.world),serializeWorld(second.world));
  assert.equal(first.world.state.turn,2);
  assert.ok(first.events.some(event=>event.type==='delayed'),
    'the Genie must not bypass delayed effects from earlier structures');
  assert.ok(first.events.some(event=>event.type==='decision'));
});
test('next turn applies delayed forest regrowth and records a parent cause',()=>{
  const first=playBuild(createWorld(),'forest').world;
  const t1=advanceTick(first);
  const t2=advanceTick(t1.world);
  assert.equal(t2.world.state.turn,3);
  assert.ok(t2.events.some(event=>event.type==='delayed'&&event.parentId));
  assert.ok(t2.world.history.length>first.history.length);
});
test('previous free-form constructions remain supported, unknown ideas stay unchanged',()=>{
  const original=createWorld();
  const accepted=playIdea(original,'Построить ферму, насос и очистку воды');
  assert.equal(accepted.recognized,true);
  assert.equal(accepted.world.state.turn,1);
  assert.ok(accepted.world.state.food>original.state.food);
  const denied=playIdea(original,'Дракон услышал сигнал и взлетел');
  assert.equal(denied.recognized,false);
  assert.equal(serializeWorld(denied.world),serializeWorld(original));
});
test('long play caps history, queue and all resources including idle ticks',()=>{
  let world=createWorld();
  for(let i=0;i<180;i++){
    world=playBuild(world,['forest','energy','city','volcano'][i%4]).world;
    if(i%9===0)world=advanceTick(world).world;
  }
  assert.ok(world.history.length<=150);
  assert.ok(world.queue.length<=200);
  assert.ok(Object.entries(world.state).every(([key,value])=>Number.isInteger(value)&&
    value>=0&&value<=(key==='turn'?100000:100)));
  assert.equal(serializeWorld(restoreWorld(serializeWorld(world))),serializeWorld(world));
});
