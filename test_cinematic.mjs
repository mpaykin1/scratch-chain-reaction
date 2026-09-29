import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine, EFFECTS, DECISIONS } from './cinematic/src/game-logic.mjs';
import { GameState, CONFIG } from './cinematic/src/game-state.mjs';
import { parseIdea, sanitizeIdea, scoreIdea } from './cinematic/src/idea-parser.mjs';

test('Начальная сцена пуста и ход не выполнен',()=>{
  const game=new GameEngine();
  assert.deepEqual(game.getState(),{
    turn:0,population:32,power:0,water:0,food:0,eco:0,budget:50,
  });
  assert.deepEqual(Object.values(game.getPlaced()),[0,0,0,0]);
  assert.equal(game.state.pendingDecision,false);
});
test('Строительство и кризисы детерминированы',()=>{
  const a=new GameEngine(),b=new GameEngine();
  for (const kind of ['forest','city','energy','volcano']) {
    assert.deepEqual(a.build(kind),b.build(kind));
    assert.deepEqual(a.snapshot(),b.snapshot());
  }
  assert.equal(a.getState().turn,4);
  assert.deepEqual(a.getPlaced(),{city:1,forest:1,energy:1,volcano:1});
  assert.ok(a.getState().population>=0);
  assert.ok(a.getState().food>=0);
  assert.ok(a.getState().eco<=100);
});
test('Ход больше 100 и ресурсы ограничены независимо',()=>{
  const game=new GameEngine();
  for (let i=0;i<102;i++) game.build('forest');
  assert.equal(game.getState().turn,102);
  assert.equal(game.getState().eco,100);
  assert.equal(game.getState().water,100);
});
test('Решение Джинна применимо один раз за строительство',()=>{
  const game=new GameEngine();
  assert.equal(game.decide(0),null);
  game.build('energy');
  assert.equal(game.decide(4),null);
  const first=game.decide(3);
  assert.match(first.body,/Компромисс/);
  const snapshot=game.snapshot();
  assert.equal(game.decide(3),null);
  assert.deepEqual(game.snapshot(),snapshot);
});
test('Идея обрабатывается единым действием и отменяется целиком',()=>{
  const game=new GameEngine(),before=game.snapshot();
  const idea=game.submitIdea('Посадить лес и сделать солнечную энергию');
  assert.deepEqual(idea.found,['forest','energy']);
  assert.equal(game.getState().turn,2);
  assert.equal(game.history.length,1);
  assert.equal(game.undo(),true);
  assert.deepEqual(game.snapshot(),before);
  assert.equal(game.undo(),false);
});
test('Сложное отрицание не создаёт отвергнутые объекты',()=>{
  assert.deepEqual(parseIdea('Без вулкана, построить солнечный город'),['city','energy']);
  assert.deepEqual(parseIdea('Не строить вулкан и город, а посадить лес'),['forest']);
  assert.deepEqual(parseIdea('Убрать вулкан и добавить лес'),['forest']);
  assert.deepEqual(parseIdea('Не только лес, но и город'),['forest','city']);
  assert.ok(scoreIdea('солнечная электростанция').energy>0);
});
test('Непонятная идея записывается, но не превращается в случайную постройку',()=>{
  const game=new GameEngine();
  const result=game.submitIdea('Придумать новую культуру');
  assert.deepEqual(result.found,[]);
  assert.equal(game.getState().budget,44);
  assert.equal(game.getState().eco,3);
  assert.equal(game.getState().turn,0);
});
test('Вход валидируется; HTML остаётся текстом',()=>{
  assert.equal(sanitizeIdea(null),'');
  assert.equal(sanitizeIdea(' a\u0000b ').includes('\u0000'),false);
  assert.equal(sanitizeIdea('x'.repeat(900)).length,800);
  const result=new GameEngine().submitIdea('<img src=x onerror=alert(1)>');
  assert.match(result.body,/<img src=x/);
  assert.throws(()=>new GameState().applyEffect({__proto__:null,turn:90}),/Недопустимый/);
});
test('Снимок глубоко копируется, повреждённое сохранение отклоняется',()=>{
  const game=new GameEngine();game.build('city');
  const snapshot=game.snapshot();
  snapshot.placed.city=999;
  snapshot.values.turn=999;
  snapshot.log.push('tampered');
  assert.equal(game.getPlaced().city,1);
  assert.equal(game.getState().turn,1);
  assert.equal(game.state.log.includes('tampered'),false);
  assert.equal(new GameState({...snapshot,version:99}).values.turn,0);
  assert.equal(new GameState({...snapshot,values:{...snapshot.values,power:Infinity}}).values.turn,0);
});
test('Все эффекты и решения содержат только проверенные поля',()=>{
  const state=new GameState();
  for (const effect of [...Object.values(EFFECTS),...DECISIONS.map(x=>x.effect)]) {
    assert.doesNotThrow(()=>state.applyEffect(effect));
  }
  assert.equal(CONFIG.IDEA_COST,6);
});
