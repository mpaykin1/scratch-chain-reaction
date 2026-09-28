import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorld,playBuild,playFeature,quoteFeature,serializeWorld,
  restoreWorld,advanceTick} from '../cinematic/chain-engine.mjs';
import {getLivingActions,ASSET_REGISTRY} from '../cinematic/living-actions.mjs';

const act=(w,opts={})=>getLivingActions(w,opts);
const cityAt=(w,position={x:0,z:0})=>playBuild(w,'city',{position}).world;
const step=(w,id,targetId,options)=>playFeature(w,id,targetId,options).world;

test('five initial actions are available over a barren world, without a volcano',()=>{
  const world=createWorld();
  assert.deepEqual(act(world).map(a=>a.id),
    ['build-city','build-forest','build-volcano','build-energy','idea']);
  assert.equal(world.living.objects.length,0);
  assert.equal(world.placed.volcano,0);
});

test('build city, save, restore and replace ONLY city button with protective dome',()=>{
  const initial=createWorld(),first=act(initial);
  const result=playBuild(initial,'city',{position:{x:17,z:-4}});
  const world=restoreWorld(serializeWorld(result.world));
  assert.ok(world);
  assert.equal(initial.living.objects.length,0,'pure engine preserves source');
  assert.equal(world.living.objects[0].x,17);
  assert.equal(world.living.objects[0].z,-4);
  assert.deepEqual(act(world,{viewport:{x:17,z:-4}}).map(a=>a.id),
    ['dome',first[1].id,first[2].id,first[3].id,first[4].id]);
  assert.equal(world.placed.city,1);
});

test('dome, dragon, archer retaliation and repair form a persisted causal chain',()=>{
  let world=cityAt(createWorld());
  const city=world.living.objects.find(o=>o.kind==='city');
  const beforeDome=world.state.budget;
  world=step(world,'dome',city.id);
  assert.equal(world.living.objects[0].dome,50);
  assert.equal(world.state.budget,beforeDome-9);
  assert.equal(act(world)[0].id,'summon-dragon');
  world=restoreWorld(serializeWorld(world));
  assert.equal(act(world)[0].id,'summon-dragon');
  world=step(world,'summon-dragon',city.id);
  assert.equal(world.living.dragon.hp,100);
  assert.deepEqual(act(world).slice(0,4).map(a=>a.id),
    ['archers','negotiate','evacuate','reinforce-dome']);
  world=step(world,'archers',city.id);
  assert.equal(world.living.dragon.hp,35);
  assert.equal(world.living.dragon.status,'attacking');
  assert.equal(world.living.objects[0].dome,10);
  assert.equal(world.living.objects[0].hp,88);
  assert.ok(world.history.some(e=>e.type==='retaliation'));
  world=step(world,'archers',city.id);
  assert.equal(world.living.dragon.hp,0);
  assert.equal(world.living.dragon.status,'defeated');
  assert.equal(act(world)[0].id,'repair');
  world=restoreWorld(serializeWorld(world));
  assert.equal(act(world)[0].id,'repair');
  world=step(world,'repair',city.id);
  assert.equal(world.living.objects[0].hp,100);
  assert.equal(act(world)[0].id,'expand-city');
  assert.ok(world.history.some(e=>e.type==='combat'));
});

test('double-click request id returns same world without double-building or double-charge',()=>{
  let world=cityAt(createWorld());
  const id=world.living.objects[0].id;
  const first=playFeature(world,'dome',id,{requestId:'dome-click-1'});
  const firstJSON=serializeWorld(first.world);
  const retry=playFeature(first.world,'dome',id,{requestId:'dome-click-1'});
  assert.equal(retry.duplicate,true);
  assert.equal(serializeWorld(retry.world),firstJSON);
  assert.equal(first.world.living.objects[0].dome,50);
  assert.equal(first.world.state.budget,world.state.budget-9);
});

test('invalid/stale action, unaffordable action and malformed request do not mutate saved world',()=>{
  let world=cityAt(createWorld()),city=world.living.objects[0];
  const snapshot=serializeWorld(world);
  assert.equal(quoteFeature(world,'archers',city.id).allowed,false);
  assert.throws(()=>playFeature(world,'archers',city.id),/дракона/i);
  assert.throws(()=>playFeature(world,'dome','wrong-id'),/город/i);
  assert.throws(()=>playFeature(world,'dome',city.id,{requestId:'?'}),/идентификатор/i);
  assert.equal(serializeWorld(world),snapshot);
  world.state.budget=2;
  assert.equal(quoteFeature(world,'dome',city.id).allowed,false);
  assert.throws(()=>playFeature(world,'dome',city.id),/бюджета/i);
  assert.equal(world.living.objects[0].dome,0);
});

test('panning or selecting another city recomputes offers for THAT city',()=>{
  let world=cityAt(createWorld(),{x:0,z:0});
  const left=world.living.objects[0].id;
  world=step(world,'dome',left);
  world=cityAt(world,{x:120,z:0});
  const right=world.living.objects[1].id;
  assert.equal(act(world,{viewport:{x:0,z:0}})[0].id,'summon-dragon');
  assert.equal(act(world,{viewport:{x:120,z:0}})[0].id,'dome');
  assert.equal(act(world,{selectedId:left,viewport:{x:120,z:0}})[0].targetId,left);
  assert.equal(act(world,{selectedId:right,viewport:{x:0,z:0}})[0].targetId,right);
});

test('forest, volcano, energy offers are distinct and evolve after successful actions',()=>{
  let world=createWorld();
  world=playBuild(world,'forest').world;
  assert.equal(act(world)[1].id,'wildlife');
  const forest=world.living.objects.at(-1);
  world=step(world,'wildlife',forest.id);
  assert.equal(act(world)[1].id,'expand-forest');
  world=playBuild(world,'volcano').world;
  const volcano=world.living.objects.at(-1);
  assert.equal(act(world)[2].id,'guide-lava');
  world=step(world,'guide-lava',volcano.id);
  assert.equal(quoteFeature(world,'guide-lava',volcano.id).allowed,false);
  world=playBuild(world,'energy').world;
  const energy=world.living.objects.at(-1);
  assert.equal(act(world)[3].id,'battery');
  world=step(world,'battery',energy.id);
  assert.equal(world.living.objects.at(-1).battery,true);
});

test('crisis changes actions after external event and clears when threat resolves',()=>{
  let world=cityAt(createWorld()),city=world.living.objects[0];
  world=step(world,'dome',city.id);
  world=step(world,'summon-dragon',city.id);
  assert.equal(act(world)[0].id,'archers');
  assert.equal(act(world)[1].id,'negotiate');
  world=step(world,'negotiate',city.id);
  assert.equal(act(world)[0].id,'expand-city');
  assert.equal(act(world)[1].id,'build-forest');
});

test('idle tick, repeat build and legacy saves remain compatible',()=>{
  let world=cityAt(createWorld());
  const firstId=world.living.objects[0].id;
  world=advanceTick(world).world;
  world=cityAt(world,{x:70,z:60});
  assert.notEqual(world.living.objects[1].id,firstId);
  assert.equal(world.placed.city,2);
  const legacy=JSON.parse(serializeWorld(world));delete legacy.living;
  const migrated=restoreWorld(JSON.stringify(legacy));
  assert.equal(migrated.living.objects.length,2);
  assert.equal(act(migrated,{viewport:{x:0,z:0}})[0].id,'dome');
});

test('world and dock refer to the same registered images (no duplicate art library)',()=>{
  for(const kind of ['city','forest','volcano','energy']){
    const asset=ASSET_REGISTRY[kind];
    assert.equal(asset.image,'assets/'+kind+'.webp');
    const file=new URL('../cinematic/'+asset.image,import.meta.url);
    assert.ok(readFileSync(file).length>1000);
  }
  const renderer=readFileSync(new URL('../cinematic/render-ui.mjs',import.meta.url),'utf8');
  assert.match(renderer,/ASSET_REGISTRY\[object.kind\]/);
  const painter=readFileSync(new URL('../cinematic/living-actions.mjs',import.meta.url),'utf8');
  assert.match(painter,/ASSET_REGISTRY\[action.kind\]/);
});

test('volcano evolves through safe lava, geothermal plant, island and repeatable research',()=>{
  let world=playBuild(createWorld(),'volcano').world;
  const target=world.living.objects[0].id;
  assert.equal(act(world)[2].id,'guide-lava');
  world=step(world,'guide-lava',target);
  assert.equal(act(world)[2].id,'geothermal');
  assert.equal(quoteFeature(world,'guide-lava',target).allowed,false);
  const power=world.state.power;
  world=step(world,'geothermal',target);
  assert.ok(world.state.power>power);
  assert.equal(act(world)[2].id,'island');
  world=step(world,'island',target);
  assert.equal(world.living.objects[0].island,true);
  assert.equal(act(world)[2].id,'volcano-research');
  world=step(world,'volcano-research',target);
  assert.equal(world.living.objects[0].researchCount,1);
  assert.match(act(world)[2].label,/2/);
});

test('energy controls evolve battery -> grid expansion -> stabilization -> upgrades',()=>{
  let world=playBuild(createWorld(),'energy').world;
  const target=world.living.objects[0].id;
  assert.equal(act(world)[3].id,'battery');
  world=step(world,'battery',target);
  assert.equal(quoteFeature(world,'battery',target).allowed,false);
  assert.equal(act(world)[3].id,'expand-grid');
  world=step(world,'expand-grid',target);
  assert.equal(act(world)[3].id,'stabilize-grid');
  world=step(world,'stabilize-grid',target);
  assert.equal(act(world)[3].id,'upgrade-grid');
  world=step(world,'upgrade-grid',target);
  assert.equal(world.living.objects[0].upgradeCount,1);
  assert.match(act(world)[3].label,/2/);
});

test('defense cannot target a dragon across the infinite map',()=>{
  let world=cityAt(createWorld());
  const id=world.living.objects[0].id;
  world=step(world,'dome',id);
  world=step(world,'summon-dragon',id);
  world.living.dragon.x=200;
  assert.equal(quoteFeature(world,'archers',id).allowed,false);
  assert.throws(()=>playFeature(world,'archers',id),/Поблизости/);
});
