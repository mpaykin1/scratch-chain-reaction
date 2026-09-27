const assert=require("node:assert/strict");
const path=require("node:path");
let playwright;
try{playwright=require("playwright");}
catch{playwright=require(path.join(process.env.USERPROFILE||"","Desktop","World_server","node_modules","playwright"));}
const {chromium}=playwright;
const base=process.env.BASE_URL||"http://127.0.0.1:8765/";
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.CI?undefined:"chrome"});
 try{
  for(const view of [{name:"phone",width:390,height:844},{name:"desktop",width:1440,height:900}]){
   const page=await browser.newPage({viewport:{width:view.width,height:view.height}});
   const errors=[];page.on("pageerror",error=>errors.push(error.message));
   await page.goto(base,{waitUntil:"domcontentloaded",timeout:25000});
   await page.waitForURL("**/cinematic/");
   await page.waitForFunction(()=>Boolean(window.__chainReaction),{timeout:12000});
   const bounds=await page.locator("#game").boundingBox();
   assert.ok(bounds.width*bounds.height/(view.width*view.height)>.85,
     "game occupies less than 85% of viewport");
   assert.equal(await page.locator(".option").count(),5);
   assert.equal(await page.locator("#volcanoArt.active").count(),0);
   await page.getByRole("button",{name:"Предложить свою идею"}).click();
   await page.locator("#ideaText").fill("Прилетел дракон");
   await page.getByRole("button",{name:/Отправить идею/}).click();
   await page.waitForFunction(()=>__chainReaction.getWorld().entities.some(e=>e.hp===100));
   assert.equal(await page.locator("#dragonArt.active").count(),1);
   await page.getByRole("button",{name:"Предложить свою идею"}).click();
   await page.locator("#ideaText").fill("Люди в него стреляют");
   await page.getByRole("button",{name:/Отправить идею/}).click();
   await page.waitForFunction(()=>__chainReaction.getHistory().some(e=>e.type==="combat"));
   const afterShot=await page.evaluate(()=>__chainReaction.getWorld());
   assert.ok(afterShot.entities[0].hp<100);
   assert.ok(!afterShot.history.some(e=>e.type==="retaliation"));
   await page.evaluate(()=>__chainReaction.tick());
   assert.ok(await page.evaluate(()=>__chainReaction.getHistory().some(e=>e.type==="retaliation")));
   await page.reload({waitUntil:"domcontentloaded"});
   await page.waitForFunction(()=>Boolean(window.__chainReaction));
   assert.ok(await page.evaluate(()=>__chainReaction.getHistory().some(e=>e.type==="retaliation")),
     "reload loses history");
   await page.getByRole("button",{name:"Меню"}).click();
   await page.getByRole("button",{name:/История событий/}).click();
   const history=await page.locator("#historyList").innerText();
   assert.match(history,/Дракон/);
   assert.match(history,/Причина:/);
   await page.getByRole("button",{name:"Закрыть историю"}).click();
   const beforeUnknown=await page.evaluate(()=>__chainReaction.getWorld().turn);
   await page.getByRole("button",{name:"Предложить свою идею"}).click();
   await page.locator("#ideaText").fill("Пусть вселенная танцует под музыку");
   await page.getByRole("button",{name:/Отправить идею/}).click();
   await page.waitForFunction(()=>document.getElementById("dialogTitle").textContent.includes("уточнить"));
   assert.equal(await page.evaluate(()=>__chainReaction.getWorld().turn),beforeUnknown);
   assert.deepEqual(errors,[],"browser errors in "+view.name);
   console.log("WORLD_UI_PASS",view.name,"screen coverage",bounds.width*bounds.height/(view.width*view.height));
   await page.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error("WORLD_UI_FAIL",error.stack);process.exitCode=1;});
