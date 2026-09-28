import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const sw=read('sw.js');
const block=sw.match(/const CORE=\[([\s\S]*?)\];/);
assert.ok(block,'service worker lists its versioned precache files');
const cached=new Set([...block[1].matchAll(/'([^']+)'/g)].map(match=>match[1]));
const toCore=(path)=>'./cinematic/'+path;
test('precaches all first-party scripts and CSS used by cinematic HTML',()=>{
  const html=read('cinematic/index.html');
  const assets=[
    ...[...html.matchAll(/<script\b[^>]*\bsrc="\.\/([^"]+)"/g)].map(match=>match[1]),
    ...[...html.matchAll(/<link\b[^>]*\bhref="\.\/([^"]+\.css)"/g)].map(match=>match[1]),
  ];
  const visited=new Set();
  function visit(asset){
    if(visited.has(asset))return;
    visited.add(asset);
    assert.ok(cached.has(toCore(asset)),'Missing offline core asset: '+asset);
    if(!asset.endsWith('.mjs'))return;
    for(const match of read('cinematic/'+asset).matchAll(
      /(?:import|export)\s+(?:[^'"]+?\s+from\s+)?['"]\.\/([^'"]+\.mjs)['"]/g
    ))visit(match[1]);
  }
  assets.forEach(visit);
  assert.ok(visited.size>=7,'should check nested imports and CSS');
});
test('new SW version upgrades the reactive cache without losing offline assets',()=>{
  assert.match(sw,/chain-reaction-v7-cinematic-ai-20260928/);
  assert.match(sw,/caches\.delete\(key\)/);
  assert.match(sw,/request\.destination==='script'\|\|request\.destination==='style'/);
  assert.match(sw,/const response=await fetch\(request\)/);
});
