import test from 'node:test';
import assert from 'node:assert/strict';
import {parseIdeaActions,scoreIdea,sanitizeIdea} from '../cinematic/idea-parser.mjs';
import {createWorld,playIdea,serializeWorld,interpretIdea} from '../cinematic/chain-engine.mjs';

test('weighted keywords recognize multiple physical structures',()=>{
  assert.deepEqual(parseIdeaActions('Лес, город и солнечная ферма'),['farm','forest','city','energy']);
  assert.ok(scoreIdea('солнечные батареи').energy>=4);
  assert.equal(parseIdeaActions('город город').filter(x=>x==='city').length,1);
});
test('negated construction is not built; positive alternative still works',()=>{
  assert.deepEqual(parseIdeaActions('Без вулкана, построить солнечный город'),['city','energy']);
  assert.deepEqual(parseIdeaActions('Не строить город, а посадить лес'),['forest']);
  assert.deepEqual(parseIdeaActions('Убрать вулкан и добавить лес'),['forest']);
  assert.deepEqual(parseIdeaActions('Не только лес, но и город'),['forest','city']);
  assert.deepEqual(interpretIdea('не строить город').actions,[]);
});
test('conservative unsupported ideas do not mutate deterministic state',()=>{
  const original=createWorld();
  for(const idea of ['Люди стреляют в дракона','не строить вулкан','']){
    const result=playIdea(original,idea);
    assert.equal(result.recognized,false);
    assert.equal(serializeWorld(result.world),serializeWorld(original));
  }
});
test('mixed ideas are one transaction; user text remains inert data',()=>{
  const result=playIdea(createWorld(),'Не строить вулкан, а посадить лес и поставить солнечные батареи');
  assert.deepEqual(result.actions,['forest','energy']);
  assert.equal(result.world.state.turn,1);
  assert.equal(result.world.placed.volcano,0);
  assert.ok(result.world.placed.energy>0);
  assert.equal(sanitizeIdea('<img src=x onerror=alert(1)>').startsWith('<img'),true);
  assert.equal(sanitizeIdea('a\u0000b'),'ab');
});
test('overlong input cannot be turned into a silently truncated building',()=>{
  const idea='Построить город'+' '.repeat(801);
  assert.equal(interpretIdea(idea).actions.length,0);
});
