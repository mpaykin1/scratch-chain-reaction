// Real Chromium render gate: original World Server house voxels on iPhone/desktop.
// This is a visual smoke of the graphics layer, not proof of live Telegram sync.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const BASE=process.env.BASE_URL||'http://127.0.0.1:8765';
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--disable-gpu']});
  const failures=[];
  try{
    for(const spec of [
      {name:'iphone-11',width:414,height:896,dpr:2,mobile:true},
      {name:'desktop',width:1280,height:720,dpr:1,mobile:false}
    ]){
      const context=await browser.newContext({
        viewport:{width:spec.width,height:spec.height},
        deviceScaleFactor:spec.dpr,isMobile:spec.mobile,hasTouch:spec.mobile
      });
      const page=await context.newPage();
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      try{
        await page.goto(BASE+'/cinematic/',{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>typeof window.__chainReaction?.getPlaced==='function');
        assert.equal(await page.locator('#modalBackdrop').isHidden(),true);
        assert.equal(await page.locator('.world-server-isometric').isHidden(),true);
        await page.locator('[data-action="city"]').click();
        await page.waitForFunction(()=>window.__chainReaction?.getPlaced().city>0);
        const drawn=await page.waitForFunction(()=>{
          const canvas=document.querySelector('.world-server-isometric');
          if(!canvas||canvas.hidden||canvas.width<20||canvas.height<20)return false;
          const {data}=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
          let colored=0;
          for(let i=3;i<data.length;i+=4*19)if(data[i]>20)colored++;
          return colored>15;
        },null,{timeout:10000});
        assert.ok(drawn,'World Server geometry never painted');
        const viewport=await page.evaluate(()=>{
          const rect=document.querySelector('#game').getBoundingClientRect();
          const w=Math.max(0,Math.min(innerWidth,rect.right)-Math.max(0,rect.left));
          const h=Math.max(0,Math.min(innerHeight,rect.bottom)-Math.max(0,rect.top));
          const canvas=document.querySelector('.world-server-isometric');
          const shape=canvas.getBoundingClientRect();
          const shapeArea=shape.width*shape.height;
          const overlap=selector=>{
            const el=document.querySelector(selector);
            if(!el||el.hidden||getComputedStyle(el).display==='none')return 0;
            const box=el.getBoundingClientRect();
            return Math.max(0,Math.min(shape.right,box.right)-Math.max(shape.left,box.left))*
              Math.max(0,Math.min(shape.bottom,box.bottom)-Math.max(shape.top,box.top));
          };
          const hiddenArea=['#dialog','.hud','.action-dock'].reduce((sum,selector)=>
            sum+overlap(selector),0);
          return{coverage:(w*h)/(innerWidth*innerHeight),
            graphicVisibility:Math.max(0,1-hiddenArea/shapeArea),
            canvasPixels:[canvas.width,canvas.height],source:canvas.dataset.source};
        });
        assert(viewport.coverage>=.85,spec.name+' screen coverage <85%');
        assert(viewport.graphicVisibility>=.85,spec.name+' real World Server graphics are hidden by UI: '+
          Math.round(viewport.graphicVisibility*100)+'% visible');
        assert.match(viewport.source,/World_server\/shared\/world-shape-library\.mjs/);
        assert.equal(await page.locator('#cityArt').evaluate(el=>el.classList.contains('active')),true);
        assert.deepEqual(errors,[],'JS errors: '+errors.join(', '));
        fs.mkdirSync('qa-artifacts',{recursive:true});
        await page.screenshot({path:'qa-artifacts/world-server-graphics-'+spec.name+'.png'});
        console.log('PASS '+spec.name+': '+Math.round(viewport.coverage*100)+
          '% viewport, '+Math.round(viewport.graphicVisibility*100)+
          '% original voxels unobstructed; pixels '+viewport.canvasPixels.join('x'));
      }catch(error){
        failures.push(spec.name+': '+error.stack);
      }finally{await context.close();}
    }
    if(failures.length)throw Error(failures.join('\n'));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
