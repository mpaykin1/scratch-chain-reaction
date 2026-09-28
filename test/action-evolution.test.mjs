import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveCityAction} from '../cinematic/action-evolution.mjs';

test('city action evolves only from canonical placed state',()=>{
  assert.equal(resolveCityAction({placed:{}}).action,'city');
  assert.equal(resolveCityAction({placed:{city:1}}).action,'energy');
  assert.equal(resolveCityAction({placed:{city:1,energy:1}}).action,'forest');
  assert.equal(resolveCityAction({placed:{city:1,energy:1,forest:1}}).label,'Усилить энергетику');
});
