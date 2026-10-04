const {chromium}=require('playwright');

(async()=>{
  const base=process.env.BASE_URL||'http://127.0.0.1:8765';
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});

  await page.goto(base+'/living-watercolor-3d/?object=worker',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>window.__LIVING_WATERCOLOR_3D_READY__?.ready===true,{timeout:30000});
  await page.waitForFunction(()=>window.__LIVING_WATERCOLOR_3D_READY__.stats().workerClipCount>=132,{timeout:45000});
  await page.waitForTimeout(900);

  const state=await page.evaluate(()=>({
    stats:window.__LIVING_WATERCOLOR_3D_READY__.stats(),
    features:window.__LIVING_WATERCOLOR_3D_READY__.features,
    selector:document.querySelectorAll('#workerClip option').length,
    label:document.getElementById('label')?.textContent||''
  }));

  const gate=state.stats.characterGate;
  if(errors.length)throw new Error('worker runtime errors: '+errors.join(' | '));
  if(state.stats.workerClipCount!==132)throw new Error('expected 132 unique motions');
  if(state.stats.workerSourceClipCount!==139)throw new Error('expected 139 source clips');
  if(state.selector!==132)throw new Error('worker animation selector mismatch');
  if(!state.features.includes('character-illustration-shell-v2'))throw new Error('shell v2 feature missing');
  if(!gate?.pass||gate.score<85)throw new Error('character gate failed: '+JSON.stringify(gate));

  const m=gate.metrics;
  for(const key of ['hasJacket','hasShirt','hasTie','hasBriefcase','hasPelvisBridge','hasHeadOval','hasTrouserEnvelope','hasJointBlend','jacketDarkerThanShirt']){
    if(!m[key])throw new Error('worker visual contract missing '+key);
  }
  if(m.outerContours!==1)throw new Error('expected one outer contour');
  if(m.directOutlinedMeshes!==0)throw new Error('per-part shell outlines reintroduced');

  await page.screenshot({path:'qa-artifacts/living-watercolor-worker-v2.png',fullPage:true});
  console.log('WORKER_V2_PASS',JSON.stringify({score:gate.score,clips:state.stats.workerClipCount,source:state.stats.workerSourceClipCount}));
  await browser.close();
})().catch(async e=>{console.error(e);process.exit(1)});
