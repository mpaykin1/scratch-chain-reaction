const path=require('node:path');
let pw;try{pw=require('playwright')}catch{pw=require(path.join(process.env.USERPROFILE||'','Desktop','World_server','node_modules','playwright'))}
const {chromium}=pw;
const fs=require('node:fs'),assert=require('node:assert/strict');
const base=process.env.BASE_URL||'http://127.0.0.1:8765/';
const shot=process.env.ARTIFACT_DIR||'qa-artifacts';fs.mkdirSync(shot,{recursive:true});
const views=[{name:'iphone-portrait',w:390,h:844,mobile:true},{name:'iphone-landscape',w:844,h:390,mobile:true},{name:'desktop',w:1440,h:900,mobile:false}];
(async()=>{const browser=await chromium.launch({headless:true,channel:process.env.CI?undefined:'chrome',args:['--enable-webgl','--use-angle=swiftshader']});
for(const v of views){
 const page=await browser.newPage({viewport:{width:v.w,height:v.h},isMobile:v.mobile,hasTouch:v.mobile,deviceScaleFactor:v.mobile?3:1});
 let errors=[];page.on('pageerror',e=>errors.push(e.message));
 const start=Date.now();await page.goto(base,{waitUntil:'domcontentloaded',timeout:25000});await page.waitForURL('**/cinematic/',{timeout:12000});await page.locator('#game').waitFor();
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('.option img,.genie')).every(i=>i.complete&&i.naturalWidth>0),{timeout:14000});
 const stat=await page.evaluate(()=>{let g=document.getElementById('game').getBoundingClientRect();let b=document.querySelector('.action-dock').getBoundingClientRect();return{width:g.width,height:g.height,viewport:[innerWidth,innerHeight],scrollX:document.documentElement.scrollWidth-innerWidth,scrollY:document.documentElement.scrollHeight-innerHeight,buttons:[...document.querySelectorAll('.option')].map(e=>{let r=e.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),x:Math.round(r.x),y:Math.round(r.y),end:Math.round(r.right)}}),bg:getComputedStyle(document.querySelector('.scenery')).backgroundImage.slice(0,170),count:document.querySelectorAll('.world-object.active').length}});
 assert.ok(Math.abs(stat.width-v.w)<=2&&Math.abs(stat.height-v.h)<=2,'viewport should be covered');
 assert.equal(stat.scrollX,0);assert.equal(stat.scrollY,0);assert.equal(stat.count,0);
 assert.equal(stat.buttons.length,5);for(const b of stat.buttons)assert.ok(b.w>=39&&b.x>=-1&&b.end<=v.w+1,'button outside screen '+JSON.stringify(b));
 assert.ok(!await page.locator('iframe').count(),'no embedded TurboWarp');assert.equal(await page.locator('#fullscreenBtn').count(),1);
 await page.screenshot({path:shot+'/'+v.name+'-initial.png',fullPage:true});
 await page.getByRole('button',{name:'Закрыть сообщение'}).click();
 assert.ok(await page.locator('#dialog').evaluate(x=>x.classList.contains('hidden')));
 await page.getByRole('button',{name:'Лес',exact:true}).click();await page.waitForTimeout(170);
 assert.ok(await page.locator('#forestArt').evaluate(x=>x.classList.contains('active')));
 assert.ok((await page.evaluate(()=>__chainReaction.getState())).eco>=14);
 await page.getByRole('button',{name:'Предложить свою идею'}).click();
 assert.ok(await page.locator('#ideaBox').isVisible());
 await page.locator('#ideaText').fill('Посадить лес и поставить солнечные электростанции');
 await page.getByRole('button',{name:/Отправить идею/}).click();
 assert.ok((await page.evaluate(()=>__chainReaction.getPlaced())).energy>0,'idea created energy');
 // Multi-object ideas now pay their full build costs. Recover naturally
 // through idle turns instead of relying on free, out-of-budget construction.
 async function waitForBudget(amount){
   for(let step=0;step<35;step++){
     const budget=await page.evaluate(()=>__chainReaction.getState().budget);
     if(budget>=amount)return;
     await page.getByRole('button',{name:'Следующий ход'}).click();
   }
   throw Error('Cannot recover enough budget for '+amount);
 }
 await waitForBudget(12);
 await page.getByRole('button',{name:'Город',exact:true}).click();
 await page.evaluate(()=>{
   const options=__chainReaction.getDecisionOptions();
   __chainReaction.decide(options.findIndex(x=>x.role==='balanced'));
 });
 await waitForBudget(9);
 await page.getByRole('button',{name:'Вулкан',exact:true}).click();
 assert.ok(await page.locator('#scenery').evaluate(x=>x.classList.contains('developed')));
 await page.screenshot({path:shot+'/'+v.name+'-developed.png',fullPage:true});
 const imgs=await page.locator('img').evaluateAll(xs=>xs.filter(x=>!x.complete||x.naturalWidth===0).map(x=>x.src));
 const seconds=(Date.now()-start)/1000;
 console.log('QA_PASS',v.name,JSON.stringify({...stat,seconds,imagesBroken:imgs.length,errors:errors.length}));
 assert.equal(imgs.length,0);assert.deepEqual(errors,[]);
 await page.close();
}
await browser.close();console.log('ALL_QA_PASS',views.length,'viewports');
})().catch(e=>{console.error('QA_FAIL',e.stack);process.exit(1)});

