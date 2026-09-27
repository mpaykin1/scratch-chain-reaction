import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,playBuild,advanceTick,serializeWorld,restoreWorld} from '../cinematic/chain-engine.mjs';
import {parsePortableSave,MAX_SAVE_BYTES} from '../cinematic/portable-save.mjs';

test('the world can run without further constructions and resolves queued consequences',()=>{
  const world=playBuild(createWorld(),'forest').world;
  const one=advanceTick(world),two=advanceTick(one.world);
  assert.equal(one.world.state.turn,2);
  assert.equal(two.world.state.turn,3);
  assert.equal(world.state.turn,1,'pure engine must preserve previous snapshots');
  assert.ok(two.events.some(event=>event.type==='delayed'&&event.parentId),
    'a prior forest must have a traceable delayed effect');
});
test('idle-turn replay is deterministic and all stats stay in range',()=>{
  function replay(){
    let world=playBuild(createWorld(),'volcano').world;
    for(let i=0;i<90;i++)world=advanceTick(world).world;
    return world;
  }
  const first=replay(),second=replay();
  assert.equal(serializeWorld(first),serializeWorld(second));
  assert.ok(first.history.length<=150);
  assert.ok(first.queue.length<=400);
  assert.ok(Object.entries(first.state).every(([key,val])=>
    Number.isInteger(val)&&val>=0&&val<=(key==='turn'?100000:100)));
});
test('portable snapshots preserve the event queue and reject broken or oversized input',()=>{
  const world=playBuild(createWorld(),'city').world;
  const json=serializeWorld(world);
  const imported=parsePortableSave(json,restoreWorld);
  assert.equal(imported.error,null);
  assert.equal(serializeWorld(imported.world),json);
  assert.equal(parsePortableSave('bad-json',restoreWorld).world,null);
  assert.equal(parsePortableSave('A'.repeat(MAX_SAVE_BYTES+1),restoreWorld).world,null);
  const obsolete=JSON.parse(json);obsolete.version=999;
  assert.equal(parsePortableSave(JSON.stringify(obsolete),restoreWorld).world,null);
});
