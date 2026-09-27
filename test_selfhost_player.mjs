/* Browser-level release gate for our self-hosted runtime.
 * An outer 100% iframe is NOT proof; measure Scratch canvas itself.
 */
import {chromium, devices} from 'playwright';
import fs from 'node:fs/promises';

const base = process.env.GAME_URL || 'http://127.0.0.1:4173';
await fs.mkdir('player/screenshots', {recursive: true});
const browser = await chromium.launch({headless: true, args: ['--no-sandbox']});
const profiles = [
  ['iphone-portrait', {...devices['iPhone 13']}],
  ['iphone-landscape', {viewport: {width: 844, height: 390},
    deviceScaleFactor: 2, isMobile: true, hasTouch: true}],
  ['desktop', {viewport: {width: 1280, height: 800}, deviceScaleFactor: 1}]
];
let failed = false;
try {
  for (const [profile, options] of profiles) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    const forbidden = [];
    const errors = [];
    page.on('request', req => {
      if (/turbowarp\.org|cdn\.jsdelivr\.net/i.test(req.url()))
        forbidden.push(req.url());
    });
    page.on('pageerror', e => errors.push(String(e)));
    page.on('requestfailed', r => errors.push('HTTP '+r.url()+': '+r.failure()?.errorText));
    try {
      await page.goto(base+'/player/', {waitUntil:'domcontentloaded', timeout:30000});
      await page.waitForFunction(() =>
        Boolean(window.__ownTurboWarp?.diagnostics.started) ||
        document.getElementById('loading').classList.contains('error'), null,
        {timeout:75000});
      const errorText = await page.locator('#loading.error #message').allTextContents();
      if (errorText.length) throw Error('RUNNER_START_FAIL '+errorText.join(' '));
      const canvases = await page.locator('#stage canvas').evaluateAll(nodes =>
        nodes.map(n => {
          const r=n.getBoundingClientRect();
          const v=n.parentElement?.getBoundingClientRect();
          const screenW=innerWidth,screenH=innerHeight;
          const visibleW=Math.max(0,Math.min(screenW,r.right)-Math.max(0,r.left));
          const visibleH=Math.max(0,Math.min(screenH,r.bottom)-Math.max(0,r.top));
          return {x:r.x,y:r.y,width:r.width,height:r.height,
            visibleRatio:visibleW*visibleH/(screenW*screenH)};
        }));
      const viewport = await page.evaluate(() => ({width:innerWidth,height:innerHeight}));
      const coverage = Math.max(0,...canvases.map(c=>c.visibleRatio));
      const runtime = await page.evaluate(() => {
        const obj=window.__ownTurboWarp;
        const t=obj.player?.vm?.runtime?.targets||[];
        const counters=obj.player?.vm?.runtime?.getTargetForStage?.()?.variables||{};
        return {diagnostics:obj.diagnostics,
          width:obj.player?.vm?.runtime?.stageWidth,
          height:obj.player?.vm?.runtime?.stageHeight,
          choiceTargets:t.filter(t=>t.getName?.().startsWith('Выбор ')).map(t=>({
            name:t.getName(),x:t.x,y:t.y,visible:t.visible})),
          variables:Object.fromEntries(Object.entries(counters).map(([id,v])=>[v.name,v.value]))};
      });
      const minCoverage=profile==='iphone-portrait'?.85:.55;
      if (coverage<minCoverage) throw Error('STAGE_COVERAGE_FAIL '+coverage+' < '+minCoverage);
      if (runtime.choiceTargets.length!==5) throw Error('CHOICE_COUNT_FAIL '+runtime.choiceTargets.length);
      if (runtime.choiceTargets.some(t=>!t.visible)) throw Error('INVISIBLE_CHOICE');
      if (forbidden.length) throw Error('REMOTE_PLAYER_USED '+forbidden.join(','));
      await page.screenshot({path:'player/screenshots/'+profile+'.png',fullPage:true});
      if (profile==='iphone-portrait') {
        const city=runtime.choiceTargets.find(t=>t.name==='Выбор Город');
        const canvas=canvases.sort((a,b)=>b.visibleRatio-a.visibleRatio)[0];
        const sw=runtime.width||480,sh=runtime.height||960;
        const px=canvas.x+canvas.width*(city.x+sw/2)/sw;
        const py=canvas.y+canvas.height*(sh/2-city.y)/sh;
        await page.mouse.click(px,py);
        await page.waitForTimeout(1400);
        const after=await page.evaluate(() => {
          const v=window.__ownTurboWarp.player.vm.runtime.getTargetForStage().variables;
          return Object.fromEntries(Object.values(v).map(a=>[a.name,a.value]));
        });
        if (!(after['Ход']>=1 && after['Население']>=30))
          throw Error('SCRATCH_CLICK_FAILED '+JSON.stringify({before:runtime.variables,after,px,py}));
        console.log('GAMEPLAY_PASS',JSON.stringify({choice:'Город',step:after['Ход'],population:after['Население']}));
      }
      console.log('PLAYER_PASS',JSON.stringify({profile,coveragePercent:Math.round(1000*coverage)/10,
        stageSize:[runtime.width,runtime.height],choices:runtime.choiceTargets.length,
        forbiddenRequests:forbidden.length,errors}));
    }catch(e){
      failed=true;
      console.error('PLAYER_FAIL',profile,String(e));
      console.error('REQUEST_ERRORS',JSON.stringify(errors));
      await page.screenshot({path:'player/screenshots/'+profile+'-error.png'}).catch(()=>{});
    }finally{await context.close();}
  }
}finally{await browser.close();}
if(failed)process.exit(1);
