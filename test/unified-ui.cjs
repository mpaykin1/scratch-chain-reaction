// Mocked HTTP transport tests the real cinematic DOM and multi-client sync.
// Real Telegram auth + D1 revision tests live in World_server/test/unified-chain-game.test.mjs.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const BASE=process.env.BASE_URL||'http://127.0.0.1:8765';
const API='https://world-server.mmmpaykin.workers.dev/api/chain';
const clone=x=>structuredClone(x);
const fresh=()=>({revision:0,turn:0,linked:true,
  state:{turn:0,population:104,power:50,water:65,food:62,eco:75,budget:147,health:75},
  placed:{city:1,forest:0,energy:0,volcano:0,dragon:false},
  story:{last:null,active:null,dragon:null,ruins:[]},
  history:[],choices:[{type:'solar',label:'Солнечная станция',cost:40,days:2},
    {type:'coal',label:'Угольная станция',cost:35,days:2},
    {type:'geothermal',label:'Геотермальная',cost:50,days:2},
    {type:'greenhouse',label:'Теплицы',cost:25,days:2}],
  actions:{shoot:false,defend:false},message:'Общий мир'});
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--disable-gpu']});
  const accounts=new Map(),tokens=new Map();
  accounts.set('tg',fresh());let next=0;
  async function intercept(route){
    const req=route.request(),url=new URL(req.url()),path=url.pathname;
    const method=req.method(),data=method==='POST'?req.postDataJSON()||{}:{};
    const cors={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type',
      'access-control-allow-methods':'GET,POST,OPTIONS','content-type':'application/json'};
    const reply=(data,status=200)=>route.fulfill({status,headers:cors,body:JSON.stringify(data)});
    if(method==='OPTIONS')return route.fulfill({status:204,headers:cors,body:''});
    if(path.endsWith('/session')){
      const tg=!!data.initData,id=tg?'tg':'guest-'+(++next),token=String.fromCharCode(tg?66:65).repeat(43);
      if(!accounts.has(id))accounts.set(id,fresh());
      tokens.set(token,id);return reply({token,linked:tg},201);
    }
    const token=(req.headers()['authorization']||'').replace(/^Bearer /,'');
    let id=tokens.get(token);
    if(!id)return reply({error:'Unauthorized'},401);
    if(path.endsWith('/link')){
      if(data.code!=='ABCDEFGHJKLM')return reply({error:'Wrong code'},400);
      tokens.set(token,'tg');return reply({...clone(accounts.get('tg')),linked:true});
    }
    const world=accounts.get(id);
    if(path.endsWith('/state'))return reply({...clone(world),linked:id==='tg'});
    if(path.endsWith('/action')){
      if(data.revision!==world.revision)return reply({error:'Conflict',...clone(world)},409);
      world.revision++;
      if(data.kind==='idea'&&/дракон/i.test(data.text)){
        world.story.dragon={active:true,hp:100};
        world.story.last={kind:'dragon_arrival',title:'🐉 Прилетел дракон',
          description:'Дракон кружит над городом.'};
        world.placed.dragon=true;world.actions.shoot=true;
      }else if(data.kind==='story_action'&&data.type==='shoot'){
        world.story.dragon.hp-=28;world.state.budget-=5;
        world.story.last={kind:'defense',title:'🏹 Люди стреляют',
          description:'Здоровье дракона: '+world.story.dragon.hp};
      }else if(data.kind==='next'){world.turn++;world.state.turn++;}
      world.history.push({tick:world.turn,text:world.story.last?.description||'Новый ход'});
      return reply({...clone(world),linked:id==='tg',notice:'Изменения записаны.'});
    }
    return reply({error:'Missing route'},404);
  }
  const contexts=[];
  try{
    const a=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,
      isMobile:true,hasTouch:true});
    const b=await browser.newContext({viewport:{width:1280,height:720}});
    contexts.push(a,b);
    await b.addInitScript(()=>{window.Telegram={WebApp:{initData:'test-signed-webapp',
      ready(){},expand(){}}};});
    for(const context of contexts){
      await context.route(API+'/**',intercept);
      await context.route('https://telegram.org/js/telegram-web-app.js',r=>r.fulfill({
        status:200,contentType:'text/javascript',body:''}));
    }
    const [pageA,pageB]=[await a.newPage(),await b.newPage()];
    const url=BASE+'/cinematic/?unified=1';
    await Promise.all([pageA.goto(url),pageB.goto(url)]);
    await pageA.waitForFunction(()=>window.__chainReaction?.getState().population===104);
    await pageB.waitForFunction(()=>window.__chainReaction?.getState().population===104);
    await pageB.locator('#askIdea').click();
    await pageB.locator('#ideaText').fill('Прилетел дракон');
    await pageB.locator('#ideaForm button[type=submit]').click();
    await pageB.waitForFunction(()=>!!document.querySelector('#dragonArt:not([hidden])'));
    await pageA.locator('#showMenu').click();
    await pageA.locator('#linkCode').fill('ABCDEFGHJKLM');
    await pageA.locator('#linkForm button[type=submit]').click();
    await pageA.waitForFunction(()=>!!document.querySelector('#dragonArt:not([hidden])'));
    await pageA.locator('#shootDragon').click();
    await pageB.waitForFunction(()=>document.querySelector('#dragonArt')?.dataset.hp==='72',
      {timeout:10000});
    assert.equal(accounts.get('tg').story.dragon.hp,72);
    for(const [name,page]of [['portrait',pageA],['landscape',pageB]]){
      const coverage=await page.evaluate(()=>{
        const r=document.querySelector('#game').getBoundingClientRect();
        const w=Math.max(0,Math.min(innerWidth,r.right)-Math.max(0,r.left));
        const h=Math.max(0,Math.min(innerHeight,r.bottom)-Math.max(0,r.top));
        return(w*h)/(innerWidth*innerHeight);
      });
      assert(coverage>=.85,name+' game viewport coverage below 85%: '+coverage);
      assert.equal(await page.locator('#dragonArt').isVisible(),true);
      fs.mkdirSync('qa-artifacts',{recursive:true});
      await page.screenshot({path:'qa-artifacts/unified-'+name+'.png'});
      console.log('PASS '+name+' visual coverage '+Math.round(coverage*100)+'%');
    }
    console.log('PASS: shared WebApp + browser dragon, shooting and cross-device sync');
  }finally{
    for(const c of contexts)await c.close();
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
