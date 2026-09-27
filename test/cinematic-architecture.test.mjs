import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('cinematic HTML is declarative and its entrypoints are first-party modules',()=>{
  const html=read('cinematic/index.html');
  assert.doesNotMatch(html,/<style[\s>]/);
  assert.doesNotMatch(html,/<script(?![^>]*src=)/);
  assert.match(html,/src="\.\/main\.mjs"/);
  assert.match(html,/src="\.\/enhancements\.mjs"/);
  assert.match(html,/href="\.\/style\.css"/);
  assert.match(html,/<div class="modal-backdrop" id="modalBackdrop" hidden/);
  const intro=html.slice(html.indexOf('id="dialog"'),html.indexOf('<nav class="action-dock"'));
  const menu=html.slice(html.indexOf('id="menuBox"'));
  assert.doesNotMatch(intro,/id="waterScenario"/,'scenario cannot block the initial dialog');
  assert.match(menu,/id="waterScenario"[^>]*href="\.\/scenario\.html"/,
    'new scenarios belong in the initially hidden menu');
});
test('each cinematic module stays below 400 lines',()=>{
  for(const name of ['main','ui','walkers','render-ui','idea-parser','chain-engine']){
    const content=read('cinematic/'+name+'.mjs');
    assert.ok(content.split('\n').length<=400,name+' exceeded file limit');
  }
});
