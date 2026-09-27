import {
  createWorld, getRates, dispatch, advance, interpretLocalIdea, validateAIPlan,
  serialize, restore, POLICIES
} from "./world-engine.mjs";

const $=id=>document.getElementById(id);
const STORAGE_KEY="chain-reaction-world-v2";
const art={city:$("cityArt"),forest:$("forestArt"),energy:$("energyArt"),volcano:$("volcanoArt")};
const cap=$("caption");
const reduce=matchMedia("(prefers-reduced-motion:reduce)").matches;
let world=createWorld();
try{world=restore(localStorage.getItem(STORAGE_KEY))||world;}catch{}
function save(){try{localStorage.setItem(STORAGE_KEY,serialize(world));}catch{}}
function panel(title,body){
  $("dialogTitle").textContent=title;$("dialogText").textContent=body;
  $("dialog").classList.remove("hidden");
}
function caption(message){
  cap.textContent=message;cap.classList.remove("animate");
  if(!reduce){void cap.offsetWidth;cap.classList.add("animate");}
  else cap.style.opacity="1";
}
function deltaText(delta){
  const icons={population:"♟",power:"⚡",water:"💧",food:"🍃",
    eco:"🌱",budget:"🪙",happiness:"❤"};
  return Object.entries(delta).filter(([,n])=>n!==0)
    .map(([k,n])=>icons[k]+(n>0?"+":"")+n).join(" ");
}
function render(previous=null){
  const rates=getRates(world);
  for(const [key,value]of Object.entries(world.stats)){
    const element=document.querySelector('[data-stat="'+key+'"]');
    if(!element)continue;
    element.textContent=String(value);
    const container=element.closest(".stat");
    const rate=container.querySelector(".stat-rate");
    if(rate){
      const n=rates[key]||0;
      rate.textContent=(n>0?"+":"")+n+"/ход";
      rate.style.color=n<0?"#ffb8a8":n>0?"#b1fcb5":"#b9c8d8";
    }
    if(previous&&previous.stats[key]!==value&&!reduce){
      const n=value-previous.stats[key],bubble=document.createElement("span");
      bubble.className="floating-text";bubble.textContent=(n>0?"+":"")+n;
      bubble.style.color=n>0?"#a5f9ae":"#ff9b85";
      container.appendChild(bubble);bubble.addEventListener("animationend",()=>bubble.remove(),{once:true});
    }
    container.setAttribute("aria-label",container.querySelector(".lbl").textContent+
      " "+value+"; "+(rates[key]>=0?"+":"")+rates[key]+" за ход");
  }
  document.querySelector('[data-stat="turn"]').textContent=world.turn;
  for(const key of Object.keys(art))art[key].classList.toggle("active",world.counts[key]>0);
  $("rotor").classList.toggle("on",world.built.energy>0);
  $("scenery").classList.toggle("developed",
    Object.values(world.counts).reduce((n,v)=>n+v,0)>=4);
  const liveDragon=world.entities.some(e=>e.kind==="dragon"&&e.hp>0);
  $("dragonArt").classList.toggle("active",liveDragon);
  $("dragonArt").setAttribute("aria-label",liveDragon?
    "Дракон летает над миром, здоровье "+
      world.entities.filter(e=>e.kind==="dragon"&&e.hp>0).at(-1).hp:"Дракон отсутствует");
}
function notify(previous,title,description){
  const ids=new Set(previous.history.map(e=>e.id));
  const updates=world.history.filter(e=>!ids.has(e.id));
  const important=updates.filter(e=>!["tick","crisis-effect"].includes(e.type));
  const changes=Object.fromEntries(Object.keys(world.stats)
    .map(k=>[k,world.stats[k]-previous.stats[k]]));
  const consequences=important.slice(-3).map(e=>e.source+": "+e.text).join(" ");
  const rateInfo=deltaText(changes);
  panel(title,description+(consequences?" "+consequences:"")+
    (rateInfo?" Изменения: "+rateInfo+".":""));
  caption(important.at(-1)?.source||title);
  $("choiceTrigger").hidden=false;save();
  if(world.history.some(e=>!ids.has(e.id)&&e.type==="retaliation"))flashDragon();
}
function perform(command,title,description=""){
  try{
    const previous=world;
    world=dispatch(world,command);
    render(previous);notify(previous,title,description);
    closeSheets();
    return true;
  }catch(error){panel("Джинн не согласен",error.message);closeSheets();return false;}
}
function build(kind){
  const names={city:"Город",forest:"Лес",energy:"Энергия",volcano:"Вулкан",
    farm:"Ферма",factory:"Завод"};
  const success=perform({type:"build",kind},names[kind]||kind,
    "Объект строится. Его производство и потребление начнутся после завершения.");
  if(success&&kind==="volcano")embers();
}
function decide(index){
  const policy=POLICIES[index];
  if(policy)perform({type:"policy",id:policy.id},
    "Последствия решения",policy.title+".");
}
async function resolveIdea(text){
  const local=interpretLocalIdea(text,world);
  if(local.supported||!window.CHAIN_REACTION_AI_ENDPOINT)return local;
  // Optional same-origin AI endpoint: keys stay on the server, never in browser code.
  const endpoint=new URL(window.CHAIN_REACTION_AI_ENDPOINT,location.href);
  if(endpoint.origin!==location.origin||!["http:","https:"].includes(endpoint.protocol))
    return {supported:false,reason:"AI endpoint должен находиться на этом же сайте."};
  const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),5000);
  try{
    const response=await fetch(endpoint,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({text,context:{turn:world.turn,stats:world.stats,
        lastEntity:world.lastEntity,entities:world.entities.slice(-5)}}),
      signal:abort.signal
    });
    if(!response.ok)throw Error("AI API: HTTP "+response.status);
    return validateAIPlan(await response.json());
  }catch(error){return {supported:false,
    reason:"AI-сервер недоступен: "+error.message+". "+local.reason};}
  finally{clearTimeout(timeout);}
}
let ideaBusy=false;
async function submitIdea(value){
  const text=String(value||"").trim().slice(0,500);
  if(!text||ideaBusy)return;
  ideaBusy=true;
  const send=$("ideaForm").querySelector('[type="submit"]');send.disabled=true;
  try{
    const result=await resolveIdea(text);
    if(!result.supported){panel("Джинн просит уточнить",result.reason);closeSheets();return;}
    const command=result.steps.length===1?result.steps[0]:
      {type:"batch",steps:result.steps};
    perform(command,"Джинн исполняет твою идею",result.description);
    $("ideaText").value="";
  }finally{ideaBusy=false;send.disabled=false;}
}
function embers(){
  if(reduce)return;
  for(let j=0;j<7;j++){
    const e=document.createElement("i");e.className="spark";
    e.style.right=(8+Math.random()*20)+"%";e.style.top=(24+Math.random()*14)+"%";
    e.style.setProperty("--wx",(Math.random()*130-60)+"px");
    e.style.animationDelay=(Math.random()*1.5)+"s";
    $("game").appendChild(e);
    e.addEventListener("animationend",()=>e.remove(),{once:true});
  }
}
function flashDragon(){
  if(reduce)return;
  const dragon=$("dragonArt");dragon.classList.remove("struck");
  void dragon.offsetWidth;dragon.classList.add("struck");
}
function closeSheets(){
  for(const id of ["choiceBox","ideaBox","menuBox","historyBox"])$(id).hidden=true;
}
function openSheet(id){
  closeSheets();$(id).hidden=false;
  if(id==="ideaBox")setTimeout(()=>$("ideaText").focus(),60);
  if(id==="historyBox")renderHistory();
}
function renderHistory(){
  const list=$("historyList");list.replaceChildren();
  const byId=new Map(world.history.map(e=>[e.id,e]));
  for(const event of world.history.slice(-32).reverse()){
    const entry=document.createElement("li"),cause=byId.get(event.causeId);
    entry.className="history-item";
    const heading=document.createElement("strong");
    heading.textContent="Ход "+event.turn+" · "+event.source;
    const body=document.createElement("p");body.textContent=event.text;
    entry.append(heading,body);
    const changes=deltaText(event.delta);
    if(changes){const amount=document.createElement("small");
      amount.textContent=changes;entry.appendChild(amount);}
    if(cause){const link=document.createElement("small");
      link.textContent="↳ Причина: "+cause.source+" (ход "+cause.turn+")";
      entry.appendChild(link);}
    list.appendChild(entry);
  }
}
$("choiceTrigger").onclick=()=>openSheet("choiceBox");
$("closeDialog").onclick=()=>$("dialog").classList.add("hidden");
$("askIdea").onclick=()=>openSheet("ideaBox");
$("showHelp").onclick=()=>openSheet("menuBox");
$("showMenu").onclick=()=>openSheet("menuBox");
$("showHistory").onclick=()=>openSheet("historyBox");
for(const [button,sheet] of [["closeChoices","choiceBox"],["closeIdea","ideaBox"],
  ["closeMenu","menuBox"],["closeHistory","historyBox"]]){
  $(button).onclick=closeSheets;
}
$("ideaFromChoices").onclick=()=>openSheet("ideaBox");
document.querySelectorAll(".option").forEach(button=>button.addEventListener("click",()=>{
  button.dataset.action==="idea"?openSheet("ideaBox"):build(button.dataset.action);
}));
document.querySelectorAll("[data-decision]").forEach(button=>
  button.onclick=()=>decide(Number(button.dataset.decision)));
$("ideaForm").onsubmit=event=>{
  event.preventDefault();submitIdea($("ideaText").value);
};
$("restart").onclick=()=>{
  world=createWorld();try{localStorage.removeItem(STORAGE_KEY);}catch{}
  $("choiceTrigger").hidden=true;render();closeSheets();
  panel("Злой Джинн:","Мир снова пуст. Выбери объект или предложи событие.");
};
$("fullscreenBtn").onclick=async()=>{
  if(document.fullscreenEnabled&&$("game").requestFullscreen){
    try{await $("game").requestFullscreen();closeSheets();return;}catch{}
  }
  $("fullscreenHint").hidden=false;
};
$("scratchLaunch").onclick=function(){
  this.href=new URL("../player/",location.href).href;
};
for(const container of document.querySelectorAll(".stat")){
  if(container.querySelector('[data-stat="turn"]'))continue;
  const span=document.createElement("span");span.className="stat-rate";
  container.querySelector(".num").after(span);
}
const walkers=[],people=$("people");
for(let i=0;i<(matchMedia("(pointer:coarse)").matches?7:12);i++){
  const person=document.createElement("div");person.className="person";
  person.innerHTML='<div class="head"></div><div class="coat"></div><div class="legs"></div>';
  people.appendChild(person);
  walkers.push({e:person,x:8+Math.random()*84,y:38+Math.random()*34,
    v:(.3+Math.random()*.6)*(Math.random()<.5?-1:1),seed:Math.random()*10});
}
let last=performance.now(),minimum=matchMedia("(pointer:coarse)").matches?42:30;
function frame(now){
  if(!document.hidden&&now-last>=minimum){
    const dt=Math.min(.06,(now-last)/1000);last=now;
    if(!reduce)for(const w of walkers){
      w.x+=w.v*dt;if(w.x<7||w.x>95)w.v*=-1;
      w.e.style.left=w.x+"%";w.e.style.top=w.y+"%";
      w.e.style.transform="scale("+(.75+(w.y-30)/95)+") translateY("+
        (Math.sin(now/145+w.seed)*1.9)+"px)";
      w.e.style.setProperty("--gait",Math.sin(now/150+w.seed)*30+"deg");
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if(world.turn>0)panel("Мир восстановлен","Игра сохранена. Продолжай строить и следи за последствиями.");
render();
window.__chainReaction={
  build,getState:()=>({...world.stats,turn:world.turn}),
  getPlaced:()=>({...world.counts}),submitIdea,decide,
  getHistory:()=>world.history.slice(),getWorld:()=>JSON.parse(serialize(world)),
  tick:()=>{const old=world;world=advance(world);render(old);notify(old,"Следующий ход");},
  openChoices:()=>openSheet("choiceBox"),preview:async kind=>{
    const mod=await import("./world-engine.mjs");
    return mod.preview(world,{type:"build",kind});
  }
};
