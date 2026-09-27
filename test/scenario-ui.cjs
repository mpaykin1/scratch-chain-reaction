const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
let pw;
try{pw=require("playwright");}
catch{pw=require(path.join(process.env.USERPROFILE||"C:\\Users\\user","Desktop","World_server","node_modules","playwright"));}
const {chromium}=pw;
const base=process.env.BASE_URL||"http://127.0.0.1:8889";
const target=base+"/cinematic/scenario.html";
const artifacts=path.resolve(process.env.ARTIFACT_DIR||"scenario-qa");
fs.mkdirSync(artifacts,{recursive:true});
const cases=[
  {name:"portrait",width:390,height:844,mobile:true},
  {name:"landscape",width:844,height:390,mobile:true},
  {name:"desktop",width:1440,height:900,mobile:false}
];
(async()=>{
  const browser=await chromium.launch({headless:true,channel:process.env.CI?undefined:"chrome",
    args:["--use-gl=angle","--use-angle=swiftshader"]});
  let total=0;
  for(const device of cases){
    const page=await browser.newPage({viewport:{width:device.width,height:device.height},
      isMobile:device.mobile,hasTouch:device.mobile,deviceScaleFactor:device.mobile?2:1});
    const errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    page.on("response",r=>{if(r.status()>=400)errors.push(String(r.status())+" "+r.url());});
    const response=await page.goto(target,{waitUntil:"domcontentloaded",timeout:25000});
    assert.equal(response.status(),200);
    await page.waitForFunction(()=>window.__scenarioQA && document.querySelector("#cityArt").complete,{timeout:10000});
    await page.waitForFunction(()=>[...document.images].every(i=>i.complete && i.naturalWidth>0),{timeout:15000});
    const bounds=await page.evaluate(()=>{
      const g=document.querySelector("#stage").getBoundingClientRect();
      const nav=[...document.querySelectorAll(".plan")].map(e=>{
        const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};
      });
      return{width:g.width,height:g.height,viewport:[innerWidth,innerHeight],
        scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,nav};
    });
    assert.ok(Math.abs(bounds.width-device.width)<3&&Math.abs(bounds.height-device.height)<3);
    assert.ok(bounds.scrollWidth<=device.width+2&&bounds.scrollHeight<=device.height+2);
    assert.equal(bounds.nav.length,5);
    bounds.nav.forEach(r=>{assert.ok(r.width>=38&&r.height>=50);assert.ok(r.x>=-2&&r.right<=device.width+2);});
    const init=await page.evaluate(()=>window.__scenarioQA.getState());
    assert.equal(init.stats.water,23);
    assert.equal(init.projects.length,0);
    await page.screenshot({path:path.join(artifacts,device.name+"-initial.png")});
    await page.getByRole("button",{name:"Закрыть сообщение"}).click();
    assert.ok(await page.locator("#talk").evaluate(e=>e.classList.contains("dismissed")));
    await page.getByRole("button",{name:"Как играть"}).click();
    assert.equal(await page.locator("#helpSheet").isVisible(),true);
    await page.getByRole("button",{name:"Продолжить"}).click();
    await page.getByRole("button",{name:"Огромная плотина"}).click();
    assert.equal(await page.locator("#projectSheet").isVisible(),true);
    await page.getByRole("button",{name:"Проверить последствия"}).click();
    await page.locator("#commitBtn").waitFor({state:"visible"});
    assert.ok(await page.locator("#warnings .warning").count()>0);
    await page.getByRole("button",{name:"Запустить проект"}).click();
    assert.equal((await page.evaluate(()=>window.__scenarioQA.getState())).phase,"simulating");
    for(let j=0;j<3;j++)await page.getByRole("button",{name:/Следующий ход/}).click();
    const after=await page.evaluate(()=>window.__scenarioQA.getState());
    assert.equal(after.phase,"choose");
    assert.equal(after.turn,3);
    assert.ok(after.stats.water<20);
    assert.ok(after.stats.population<48);
    assert.ok(after.history.some(e=>e.type==="drought"&&e.parentId));
    await page.reload({waitUntil:"domcontentloaded"});
    await page.waitForFunction(()=>window.__scenarioQA?.getState().turn===3);
    assert.equal(await page.locator("#stat-water").innerText(),String(after.stats.water));
    await page.getByRole("button",{name:"Восстановить водосбор"}).click();
    await page.getByRole("button",{name:"Проверить последствия"}).click();
    await page.getByRole("button",{name:"Запустить проект"}).click();
    assert.ok(!await page.locator("#forestArt").evaluate(x=>x.classList.contains("visible")),"forest must not be built instantly");
    for(let j=0;j<3;j++){
      await page.getByRole("button",{name:/Следующий ход/}).click();
      if(j===1)assert.ok(await page.locator("#forestArt").evaluate(x=>x.classList.contains("visible")),"forest grows on tick two");
    }
    const recovered=await page.evaluate(()=>window.__scenarioQA.getState());
    assert.ok(recovered.stats.water>after.stats.water);
    assert.equal(recovered.turn,6);
    await page.screenshot({path:path.join(artifacts,device.name+"-recovery.png")});
    await page.getByRole("button",{name:"История мира"}).click();
    assert.equal(await page.locator("#historySheet").isVisible(),true);
    assert.ok(await page.locator("#historyList li").count()>=10);
    await page.getByRole("button",{name:"Вернуться к игре"}).click();
    await page.getByRole("button",{name:"Своя идея"}).click();
    await page.locator("#reason").fill("Построю дом для дракона и запущу воздушную ракету.");
    await page.getByRole("button",{name:"Проверить последствия"}).click();
    assert.ok((await page.locator("#projectError").innerText()).includes("Нужна проверка"));
    await page.locator("#reason").fill("Посажу лес и поставлю солнечные насосы для повторного сбора дождевой воды.");
    await page.getByRole("button",{name:"Проверить последствия"}).click();
    assert.equal(await page.locator("#commitBtn").isVisible(),true);
    await page.getByRole("button",{name:"Запустить проект"}).click();
    const free=await page.evaluate(()=>window.__scenarioQA.getState());
    assert.equal(free.projects.at(-1).planId,"own");
    assert.equal(free.visuals.power,recovered.visuals.power,"starting a project must not change already-built visuals");
    await page.getByRole("button",{name:/Следующий ход/}).click();
    assert.ok((await page.evaluate(()=>window.__scenarioQA.getState())).visuals.power);
    page.once("dialog",dialog=>dialog.accept());
    await page.getByRole("button",{name:"Новый мир"}).click();
    assert.equal((await page.evaluate(()=>window.__scenarioQA.getState())).projects.length,0);
    await page.getByRole("button",{name:"Восстановить водосбор"}).click();
    await page.getByRole("button",{name:"Проверить последствия"}).click();
    await page.getByRole("button",{name:"Запустить проект"}).click();
    for(let j=0;j<3;j++)await page.getByRole("button",{name:/Следующий ход/}).click();
    const balanced=await page.evaluate(()=>window.__scenarioQA.getState());
    assert.ok(balanced.stats.water>=46 && balanced.stats.eco>=44);
    assert.ok(await page.locator("#stage").evaluate(x=>x.classList.contains("recovered")));
    const image=await page.locator("#land").evaluate(x=>getComputedStyle(x).backgroundImage);
    assert.ok(image.includes(device.name==="portrait"?"world_developed_portrait.webp":"world_developed_clean_landscape.webp"));
    await page.screenshot({path:path.join(artifacts,device.name+"-balanced-world.png")});
    assert.deepEqual(errors,[]);
    console.log("BROWSER_SCENARIO_PASS",device.name,JSON.stringify({
      size:bounds.viewport,navMin:Math.round(Math.min(...bounds.nav.map(v=>v.width))),
      droughtWater:after.stats.water,recoveryWater:recovered.stats.water,
      turns:free.turn,events:free.history.length,errors:errors.length
    }));
    await page.close();total++;
  }
  console.log("ALL_SCENARIO_QA_PASS",total,"VIEWPORTS; FULL STORY + FREE INPUT + PERSISTENCE");
  await browser.close();
})().catch(err=>{console.error("SCENARIO_QA_FAIL",err.stack);process.exit(1);});

