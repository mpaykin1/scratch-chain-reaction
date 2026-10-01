import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  TrinitySceneRecipe,TRINITY_SEED,REQUIRED_SEMANTIC_IDS,
  evolutionInputFromRecipe,semanticManifest
} from '../trinity-lab/scene-recipe.mjs';
import {
  createEvolutionPlan,planSignature,sampleTimeline
} from '../trinity-lab/shared/world-evolution-runtime.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'..');
const read=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');

test('Trinity uses one fixed semantic recipe and seed',()=>{
  assert.equal(TrinitySceneRecipe.type,'TrinitySceneRecipe');
  assert.equal(TrinitySceneRecipe.seed,TRINITY_SEED);
  assert.equal(new Set(REQUIRED_SEMANTIC_IDS).size,REQUIRED_SEMANTIC_IDS.length);
  assert.deepEqual(semanticManifest().ids,[...REQUIRED_SEMANTIC_IDS]);
});
test('evolution plan is deterministic for the fixed seed',()=>{
  const input=evolutionInputFromRecipe(TrinitySceneRecipe);
  const a=createEvolutionPlan(input),b=createEvolutionPlan(input);
  assert.equal(a.seed,b.seed);
  assert.equal(planSignature(a),planSignature(b));
  assert.deepEqual(a.terrain,b.terrain);
  assert.deepEqual(a.architecture,b.architecture);
});

test('recipe contains no prebuilt final mesh/voxel payload',()=>{
  const forbidden=/(^|_)(vertices|indices|meshes|voxels|positions|transforms|prebuiltScene)$/i;
  const walk=value=>{
    if(!value||typeof value!=='object')return;
    for(const [key,child] of Object.entries(value)){
      assert.equal(forbidden.test(key)&&Array.isArray(child)&&child.length>0,false,key);
      walk(child);
    }
  };
  walk(TrinitySceneRecipe);
});
test('cube timeline has real intermediate phases across 12 seconds',()=>{
  assert.equal(TrinitySceneRecipe.evolution.durationSeconds,12);
  const input=evolutionInputFromRecipe(TrinitySceneRecipe);
  const samples=[0,2,4,6,8,10,12].map(seconds=>
    sampleTimeline(input,seconds/TrinitySceneRecipe.evolution.durationSeconds)
  );
  assert.equal(samples[0].stages.cube,0);
  assert.ok(samples[1].stages.matter>0);
  assert.ok(samples[2].stages.terrain>0);
  assert.ok(samples[3].stages.biome>0);
  assert.ok(samples[4].stages.architecture>0);
  assert.ok(samples[5].stages.lighting>0);
  assert.equal(samples[6].stages.final,1);
  assert.equal(TrinitySceneRecipe.evolution.merge,'REAL');
});

test('modes consume the same recipe instead of duplicate scene files',()=>{
  const app=read('trinity-lab/app.mjs');
  const builder=read('trinity-lab/scene-builder.mjs');
  assert.match(app,/buildStaticScene\(ctx,TrinitySceneRecipe,'INK'\)/);
  assert.match(app,/buildStaticScene\(ctx,TrinitySceneRecipe,'KRIEGER'\)/);
  assert.match(app,/createCubeEvolution\(ctx,TrinitySceneRecipe\)/);
  assert.match(builder,/seedCube=mesh\(/);
  assert.doesNotMatch(app,/screenshot|prerendered|video/i);
});
test('viewport lock and runtime-derived debug are wired',()=>{
  const html=read('trinity-lab/index.html');
  const app=read('trinity-lab/app.mjs');
  const viewport=read('trinity-lab/shared/world-server-game-viewport.js');
  assert.match(html,/data-world-server-game-surface/);
  assert.match(html,/world-server-game-viewport\.js/);
  assert.match(viewport,/visualViewport/);
  assert.match(viewport,/setPointerCapture/);
  assert.match(viewport,/scrollZero/);
  assert.match(app,/capabilityState\(metrics,ids,inkDiag,cube\)/);
  assert.match(app,/analyzeGraphicsQuality/);
});
