import test from 'node:test';
import assert from 'node:assert/strict';
import {GENIE_ACTIONS} from '../cinematic/genie-narratives.mjs';

const RESOURCES=new Set(['population','power','water','food','eco','budget']);
test('five RU/EN narrative proposals have valid deterministic resource contracts',()=>{
  assert.equal(Object.keys(GENIE_ACTIONS).length,5);
  for(const [key,action] of Object.entries(GENIE_ACTIONS)){
    assert.match(key,/^[a-z_]+$/);
    assert.ok(action.desc_ru.length>25&&action.desc_en.length>25);
    assert.ok(Object.keys(action.delta).length>=2);
    for(const [resource,value] of Object.entries(action.delta)){
      assert.ok(RESOURCES.has(resource),resource);
      assert.ok(Number.isInteger(value)&&Math.abs(value)<=30,`${key}.${resource}`);
    }
    assert.ok(Object.values(action.delta).some(x=>x>0));
    assert.ok(Object.values(action.delta).some(x=>x<0));
  }
  assert.ok(Object.isFrozen(GENIE_ACTIONS));
});
