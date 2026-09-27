import test from 'node:test';
import assert from 'node:assert/strict';
import {createSpatial,validSpatial,worldToScreen,screenToWorld,dragCamera,
  planVisiblePlacement,commitPlacement} from '../cinematic/spatial-map.mjs';
const view={width:1000,height:700};
test('drag moves the camera, not global building coordinates',()=>{
  const s=createSpatial();const plan=planVisiblePlacement(['city'],s,view);
  assert.equal(plan.objects.length,1);commitPlacement(s,plan);
  const initial={...s.objects[0]},start=worldToScreen(initial,s.camera,view);
  for(let i=0;i<10;i++)s.camera=dragCamera(s.camera,-280,0);
  assert.equal(s.objects[0].x,initial.x);assert.equal(s.objects[0].y,initial.y);
  assert.equal(worldToScreen(initial,s.camera,view).x,start.x-2800);
  assert.ok(validSpatial(s));
});
test('city, remote forest and volcano stay at original coordinates on return and reload',()=>{
  const s=createSpatial();
  for(const kind of ['city','forest','volcano']){
    const p=planVisiblePlacement([kind],s,view);assert.ok(!p.error,p.error);
    commitPlacement(s,p);
    s.camera=dragCamera(s.camera,kind==='city'?-2800:0,kind==='forest'?0:-1800);
  }
  assert.equal(s.objects.length,3);
  const original=JSON.parse(JSON.stringify(s.objects));
  const resumed=JSON.parse(JSON.stringify(s));assert.ok(validSpatial(resumed));
  resumed.camera={x:0,y:0};assert.deepEqual(resumed.objects,original);
  assert.ok(worldToScreen(resumed.objects[0],resumed.camera,view).x>0);
});
test('negative and far-off coordinates roundtrip without drift',()=>{
  const s=createSpatial();s.camera={x:-300_000_000,y:900_000_000};
  const p={x:12.5,y:100.25},w=screenToWorld(p,s.camera,view);
  assert.deepEqual(worldToScreen(w,s.camera,view),p);
  assert.deepEqual(dragCamera({x:0,y:0},100,50),{x:-100,y:-50});
});
test('UI, viewport boundary and collisions prevent invisible builds',()=>{
  const s=createSpatial();
  const blocked=[{x:0,y:0,width:1000,height:700}];
  assert.match(planVisiblePlacement(['city'],s,view,blocked).error,/нет свободного места/);
  const first=planVisiblePlacement(['city'],s,view);commitPlacement(s,first);
  const second=planVisiblePlacement(['forest'],s,view);
  assert.ok(!second.error);
  assert.notDeepEqual(first.objects[0],second.objects[0]);
  assert.equal(s.objects.length,1,'planning must not mutate the world');
});
test('legacy art appears once and corrupt spatial data is rejected',()=>{
  const legacy=createSpatial({city:2,forest:1});
  assert.equal(legacy.objects.length,2);
  assert.ok(validSpatial(legacy));
  legacy.objects[1].id=legacy.objects[0].id;assert.equal(validSpatial(legacy),false);
  legacy.objects[1].id='other';legacy.camera.x=Infinity;assert.equal(validSpatial(legacy),false);
});
