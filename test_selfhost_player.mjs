/* Browser-level release gate for our self-hosted runtime.
 * An outer 100% iframe is NOT proof; measure Scratch canvas itself.
 */
import {chromium, devices} from 'playwright';
import fs from 'node:fs/promises';

const base = process.env.GAME_URL || 'http://127.0.0.1:4173';
const MIN_COVERAGE = 0.85;
const START_TIMEOUT = 75_000;
const STATE_TIMEOUT = 15_000;
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
        {timeout:START_TIMEOUT});
      const errorText = await page.locator('#loading.error #message').allTextContents();
      if (errorText.length) throw Error('RUNNER_START_FAIL '+errorText.join(' '));
      await page.waitForFunction(() => {
        const own = window.__ownTurboWarp;
        if (!own?.diagnostics.started) return false;
        const cards = own.player?.vm?.runtime?.targets?.filter(t =>
          t.getName?.().startsWith('Выбор ')) || [];
        return cards.length === 5 && cards.every(t => t.visible &&
          (own.diagnostics.portrait ? t.size > 0 && t.size <= 87
            : t.size >= 170 && t.size <= 183));
      }, null, {timeout: STATE_TIMEOUT});
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
            name:t.getName(),x:t.x,y:t.y,size:t.size,visible:t.visible})),
          variables:Object.fromEntries(Object.entries(counters).map(([id,v])=>[v.name,v.value]))};
      });
      if (coverage<MIN_COVERAGE) throw Error('STAGE_COVERAGE_FAIL '+coverage+' < '+MIN_COVERAGE);
      if (runtime.choiceTargets.length!==5) throw Error('CHOICE_COUNT_FAIL '+runtime.choiceTargets.length);
      if (runtime.choiceTargets.some(t=>!t.visible)) throw Error('INVISIBLE_CHOICE');
      if (runtime.choiceTargets.some(t=>Math.abs(t.x)+88*t.size/200 > (runtime.width||480)/2+2))
        throw Error('CLIPPED_NATIVE_CHOICES '+JSON.stringify(runtime.choiceTargets));
      if (forbidden.length) throw Error('REMOTE_PLAYER_USED '+forbidden.join(','));
      if (errors.length) throw Error('BROWSER_ERRORS '+errors.join('; '));
      // The previous condition observes Scratch's own live pulse size
      // instead of sleeping and guessing how fast CI's VM will run.
      const lateCards=await page.evaluate(() =>
        window.__ownTurboWarp.player.vm.runtime.targets
          .filter(t=>t.getName?.().startsWith('Выбор '))
          .map(t=>({name:t.getName(),size:t.size,x:t.x})));
      if (profile==='iphone-portrait') {
        if (lateCards.some(c=>c.size>87)) throw Error('PORTRAIT_CARD_PULSE_CLIPS '+JSON.stringify(lateCards));
      } else if (lateCards.some(c=>c.size<170||c.size>183)) {
        throw Error('LANDSCAPE_CARDS_UNREADABLE '+JSON.stringify(lateCards));
      }
      await page.screenshot({path:'player/screenshots/'+profile+'.png',fullPage:true});
      if (profile==='iphone-portrait') {
        const city=runtime.choiceTargets.find(t=>t.name==='Выбор Город');
        const canvas=canvases.sort((a,b)=>b.visibleRatio-a.visibleRatio)[0];
        const sw=runtime.width||480,sh=runtime.height||960;
        const px=canvas.x+canvas.width*(city.x+sw/2)/sw;
        const py=canvas.y+canvas.height*(sh/2-city.y)/sh;
        if (options.hasTouch) await page.touchscreen.tap(px, py);
        else await page.mouse.click(px, py);
        await page.waitForFunction(before => {
          const vars=window.__ownTurboWarp?.player?.vm?.runtime?.getTargetForStage?.()?.variables;
          const turn=Object.values(vars || {}).find(v=>v.name==='Ход');
          return Number(turn?.value) > Number(before);
        }, runtime.variables['Ход'], {timeout: STATE_TIMEOUT});
        const after=await page.evaluate(() => {
          const v=window.__ownTurboWarp.player.vm.runtime.getTargetForStage().variables;
          return Object.fromEntries(Object.values(v).map(a=>[a.name,a.value]));
        });
        if (!(after['Ход']>=1 && after['Население']>=30))
          throw Error('SCRATCH_CLICK_FAILED '+JSON.stringify({before:runtime.variables,after,px,py}));
        console.log('GAMEPLAY_PASS',JSON.stringify({choice:'Город',step:after['Ход'],population:after['Население']}));
        // An orientation change must load the wide native project while keeping
        // resources/turn and producing one canvas (not leaking old WebGL canvases).
        await page.setViewportSize({width:844, height:390});
        await page.waitForFunction(before => {
          const own=window.__ownTurboWarp;
          const vars=own?.player?.vm?.runtime?.getTargetForStage?.()?.variables || {};
          const turn=Object.values(vars).find(v=>v.name==='Ход');
          return own?.diagnostics.started &&
            own.diagnostics.source.endsWith('chain-reaction-wide.sb3') &&
            Number(turn?.value) >= Number(before);
        }, after['Ход'], {timeout:START_TIMEOUT});
        const afterRotate=await page.evaluate(() => {
          const own=window.__ownTurboWarp, rect=document.querySelector('#stage canvas')?.getBoundingClientRect();
          return {canvasCount:document.querySelectorAll('#stage canvas').length,
            source:own.diagnostics.source,turn:Object.values(own.player.vm.runtime.getTargetForStage().variables)
              .find(v=>v.name==='Ход')?.value,
            coverage:rect ? Math.max(0,Math.min(innerWidth,rect.right)-Math.max(0,rect.left)) *
              Math.max(0,Math.min(innerHeight,rect.bottom)-Math.max(0,rect.top)) /
              (innerWidth*innerHeight) : 0};
        });
        if (afterRotate.canvasCount !== canvases.length || afterRotate.coverage < MIN_COVERAGE ||
            Number(afterRotate.turn) < Number(after['Ход']))
          throw Error('ORIENTATION_STATE_OR_COVERAGE_FAIL '+JSON.stringify(afterRotate));
        console.log('ORIENTATION_PASS',JSON.stringify(afterRotate));
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
