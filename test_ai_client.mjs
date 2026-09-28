import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { compileAiGameActions, interpretGameIdea } from './cinematic/ai-client.mjs';
const base={ok:true,provider:'gemini',proposal:{summary:'Город и лес',commands:[
  {action:'create',kind:'city',style:'gothic'}, {action:'create',kind:'forest'},
  {action:'event',kind:'unknown',details:'дракон атакует'}],unknowns:[]}};
test('AI compiles only supported constructions, preserves requested style and lists unsupported events',()=>{
 const result=compileAiGameActions(base);
 assert.equal(result.commandText,'город, лес');assert.deepEqual(result.styles,['gothic']);
 assert.deepEqual(result.unsupported,['дракон атакует']);assert.equal(result.provider,'Gemini');
});
test('AI request sends world context but no API secret',async()=>{
 let request;
 const result=await interpretGameIdea('Построй готический город','gemini',{turn:3},async(url,options)=>{
  request={url,options};return Response.json(base);
 });
 assert.equal(result.commandText,'город, лес');assert.match(request.url,/api\/chain-ai$/);
 assert.deepEqual(JSON.parse(request.options.body),{text:'Построй готический город',provider:'gemini',worldContext:{turn:3}});
});
test('Unknown AI actions never map into game actions',()=>{
 const result=compileAiGameActions({ok:true,provider:'cloudflare',proposal:{commands:[{kind:'unknown',action:'create',details:'космический порт'}]}});
 assert.equal(result.commandText,'');assert.deepEqual(result.unsupported,['космический порт']);
});
test('Network failure propagates to deterministic offline fallback',async()=>{
 await assert.rejects(interpretGameIdea('создай город','auto',{},async()=>new Response('offline',{status:503})),/503/);
});

test('Player can explicitly select Groq with no client-side API key',async()=>{
  let request;
  const response={...base,provider:'groq'};
  const output=await interpretGameIdea('Построй готический город','groq',{turn:4},
    async(url,options)=>{request={url,options};return Response.json(response);});
  assert.equal(output.provider,'Groq');
  const payload=JSON.parse(request.options.body);
  assert.equal(payload.provider,'groq');
  assert.equal(payload.text,'Построй готический город');
  assert.ok(!request.options.body.includes('GROQ_API_KEY'));
});
test('Cinematic AI menu exposes Groq and correctly explains auto fallback',()=>{
  const html=readFileSync(new URL('./cinematic/index.html',import.meta.url),'utf8');
  assert.match(html,/<option value="groq">Groq/);
  assert.match(html,/Cloudflare → Groq → Gemini/);
});
