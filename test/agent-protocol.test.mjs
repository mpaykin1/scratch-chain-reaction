import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {parseBoard,renderSummary,sync,updateContext} from '../scripts/sync-agent-context.mjs';

const ROOT=resolve(import.meta.dirname,'..');
const file=name=>readFile(join(ROOT,name),'utf8');

test('the committed agent board has unique tasks with matching sections and RU/EN narratives',async()=>{
  const [tasks,decisions]=await Promise.all([file('TASKS.md'),file('DECISIONS.md')]);
  const board=parseBoard(tasks);
  assert.ok(board.length>=5);
  assert.equal(new Set(board.map(task=>task.id)).size,board.length);
  assert.match(renderSummary(tasks,decisions),/IN_REVIEW/);
});

test('CONTEXT generation is reproducible and current',async()=>{
  const [context,tasks,decisions]=await Promise.all([file('CONTEXT.md'),file('TASKS.md'),file('DECISIONS.md')]);
  assert.equal(updateContext(context,tasks,decisions),context);
  assert.equal(updateContext(updateContext(context,tasks,decisions),tasks,decisions),context);
  assert.equal((await sync(ROOT,{check:true})).changed,false);
});

test('duplicate ID or mismatched status fails closed',()=>{
  const one='## TODO\n### CR-1 | HIGH | @qwen | graphics\n- Статус: TODO\n';
  assert.equal(parseBoard(one).length,1);
  assert.throws(()=>parseBoard(one+'### CR-1 | HIGH | @qwen | duplicate\n- Статус: TODO\n'),/Duplicate/);
  assert.throws(()=>parseBoard(one.replace('Статус: TODO','Статус: DONE')),/Invalid status/);
});

test('stale CONTEXT fails check then gets a minimal, idempotent update',async()=>{
  const root=await mkdtemp(join(tmpdir(),'chain-agent-'));
  try{
    for(const name of ['TASKS.md','DECISIONS.md','CONTEXT.md'])await writeFile(join(root,name),await file(name));
    await writeFile(join(root,'CONTEXT.md'),(await file('CONTEXT.md')).replace('Всего:','Устарело:'));
    await assert.rejects(sync(root,{check:true}),/stale/);
    assert.equal((await sync(root)).changed,true);
    assert.equal((await sync(root)).changed,false);
    assert.equal((await sync(root,{check:true})).changed,false);
  }finally{await rm(root,{recursive:true,force:true});}
});
