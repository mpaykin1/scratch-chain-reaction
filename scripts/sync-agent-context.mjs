import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const STATUSES=['TODO','IN_PROGRESS','IN_REVIEW','DONE','BLOCKED'];
const START='<!-- AGENT-SUMMARY:START -->';
const END='<!-- AGENT-SUMMARY:END -->';

export function parseBoard(source){
  const tasks=[],seen=new Set();
  let section='',current=null;
  const finish=()=>{
    if(!current)return;
    if(!current.status||current.status!==section)throw Error(`Invalid status/section: ${current.id}`);
    tasks.push(current);current=null;
  };
  for(const line of source.split(/\r?\n/)){
    const heading=line.match(/^## (TODO|IN_PROGRESS|IN_REVIEW|DONE|BLOCKED)\s*$/);
    if(heading){finish();section=heading[1];continue;}
    const task=line.match(/^### (CR-\d+) \| (HIGH|MEDIUM|LOW) \| (@chatgpt|@qwen) \| (.+)$/);
    if(task){finish();if(!section)throw Error(`Task outside a status section: ${task[1]}`);
      if(seen.has(task[1]))throw Error(`Duplicate task: ${task[1]}`);
      seen.add(task[1]);current={id:task[1],priority:task[2],owner:task[3],title:task[4],status:null};continue;
    }
    const status=line.match(/^- Статус: (TODO|IN_PROGRESS|IN_REVIEW|DONE|BLOCKED)\s*$/);
    if(status&&current)current.status=status[1];
  }
  finish();
  if(!tasks.length)throw Error('No structured agent tasks');
  return tasks;
}

export function renderSummary(tasksSource,decisionsSource){
  const tasks=parseBoard(tasksSource);
  const counts=Object.fromEntries(STATUSES.map(status=>[status,tasks.filter(t=>t.status===status).length]));
  const decisions=[...decisionsSource.matchAll(/^## (\d{4}-\d{2}-\d{2}): (.+)$/gm)];
  const latest=decisions.at(-1);
  const lines=['Автоматическая сводка из `TASKS.md` и `DECISIONS.md`. Не редактировать вручную.','',
    `Всего: **${tasks.length}**; `+STATUSES.map(status=>`${status}: **${counts[status]}**`).join(' · '),'',
    '| ID | Приоритет | Агент | Состояние | Задача |','|---|---|---|---|---|'];
  for(const task of tasks)lines.push(`| ${task.id} | ${task.priority} | ${task.owner} | ${task.status} | ${task.title.replace(/\|/g,'/')} |`);
  lines.push('',latest?`Последнее решение: **${latest[1]} — ${latest[2]}**.`:'Архитектурные решения ещё не зарегистрированы.');
  return lines.join('\n');
}

export function updateContext(context,tasks,decisions){
  const start=context.indexOf(START),end=context.indexOf(END);
  if(start<0||end<0||end<=start||context.indexOf(START,start+START.length)>=0)
    throw Error('Missing or duplicated context summary markers');
  return context.slice(0,start+START.length)+'\n'+renderSummary(tasks,decisions)+'\n'+context.slice(end);
}

export async function sync(root,{check=false}={}){
  const path=resolve(root,'CONTEXT.md');
  const [context,tasks,decisions]=await Promise.all([
    readFile(path,'utf8'),readFile(resolve(root,'TASKS.md'),'utf8'),readFile(resolve(root,'DECISIONS.md'),'utf8')
  ]);
  const expected=updateContext(context,tasks,decisions);
  if(check&&context!==expected)throw Error('CONTEXT.md is stale: run node scripts/sync-agent-context.mjs');
  if(!check&&context!==expected)await writeFile(path,expected);
  return {changed:context!==expected,tasks:parseBoard(tasks).length};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const root=process.argv.includes('--root')?process.argv[process.argv.indexOf('--root')+1]:process.cwd();
  const check=process.argv.includes('--check');
  sync(root,{check}).then(result=>console.log(check?'AGENT_CONTEXT_CHECK_PASS':
    result.changed?'AGENT_CONTEXT_UPDATED':'AGENT_CONTEXT_ALREADY_CURRENT')).catch(error=>{
    console.error(error.message);process.exitCode=1;
  });
}
