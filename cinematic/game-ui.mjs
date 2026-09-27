import {
  createWorld,placeStructure,advanceTick,applyGenieChoice,getGenieChoices,
  applyIdea,interpretIdea,serialize,restore,STRUCTURES
} from "./game-engine.mjs";

const $=id=>document.getElementById(id);
const KEY="chain-reaction-cinematic-v1";
const SHEETS=["choiceBox","ideaBox","menuBox"];
const ART={city:$("cityArt"),forest:$("forestArt"),energy:$("energyArt"),volcano:$("volcanoArt")};
const CAP=$("caption");
let world=readSave()??createWorld();
let lastFocus=null,choicesCache=null,saveWarningShown=false;
let undoStack=[];
const reducedMotion=matchMedia("(prefers-reduced-motion: reduce)");
const touch=matchMedia("(pointer: coarse)");

function readSave(){
  try{return restore(localStorage.getItem(KEY));}catch{return null;}
}
function save(){
  try{localStorage.setItem(KEY,serialize(world));}
  catch{
    if(!saveWarningShown){
      saveWarningShown=true;
      panel("Сохранение отключено","Браузер не разрешил сохранить игру. Историю можно экспортировать через меню.");
    }
  }
}
function remember(){
  undoStack.push(serialize(world));
  if(undoStack.length>20)undoStack.shift();
}
function render(){
  for(const [key,value] of Object.entries(world.stats)){
    for(const element of document.querySelectorAll('[data-stat="'+key+'"]')){
      element.textContent=String(value);
      element.closest(".stat").setAttribute("aria-label",
        (element.previousElementSibling?.textContent||key)+" "+value);
    }
  }
  for(const [kind,count] of Object.entries(world.placed))
    ART[kind].classList.toggle("active",count>0);
  $("rotor").classList.toggle("on",world.placed.energy>0&&world.stats.power>0);
  $("scenery").classList.toggle("developed",
    Object.values(world.placed).reduce((sum,count)=>sum+count,0)>=4);
  $("undoTurn").disabled=undoStack.length===0;
}
function panel(title,body){
  $("dialogTitle").textContent=title;
  $("dialogText").textContent=body;
  $("dialog").classList.remove("hidden");
}
function caption(message){
  CAP.textContent=message;
  CAP.classList.remove("animate");
  if(!reducedMotion.matches){void CAP.offsetWidth;CAP.classList.add("animate");}
}
function explain(result,initial=""){
  const delayed=result.events.filter(event=>event.source==="delayed");
  const crises=result.events.filter(event=>event.source==="crisis");
  const pieces=[initial];
  if(delayed.length)pieces.push("Отложенные последствия: "+delayed.map(event=>event.text).join(" "));
  if(crises.length)pieces.push("Новые кризисы: "+crises.map(event=>event.text).join(" "));
  pieces.push("Вода: "+result.world.stats.water+", энергия: "+result.world.stats.power+
    ", еда: "+result.world.stats.food+", экология: "+result.world.stats.eco+".");
  return pieces.filter(Boolean).join(" ");
}
function finish(result,title,initial,headline){
  world=result.world;
  render();
  save();
  panel(title,explain(result,initial));
  caption(headline);
}
function sparks(){
  if(reducedMotion.matches)return;
  const game=$("game");
  for(let i=0;i<9;i++){
    const element=document.createElement("i");
    element.className="spark";
    element.style.right=(8+Math.random()*20)+"%";
    element.style.top=(24+Math.random()*14)+"%";
    element.style.setProperty("--wx",(Math.random()*130-60)+"px");
    element.style.animationDelay=Math.random()*1.5+"s";
    game.appendChild(element);
    element.addEventListener("animationend",()=>element.remove(),{once:true});
    setTimeout(()=>element.remove(),5500);
  }
}
function build(kind){
  if(!STRUCTURES[kind])return;
  closeSheets(false);
  remember();
  const result=placeStructure(world,kind);
  if(kind==="volcano")sparks();
  const item=STRUCTURES[kind];
  finish(result,item.title,item.description,"+ "+item.label);
  $("choiceTrigger").hidden=false;
}
function modal(){
  return SHEETS.map(id=>$(id)).find(sheet=>!sheet.hidden);
}
function closeSheets(restoreFocus=true){
  for(const id of SHEETS)$(id).hidden=true;
  for(const root of document.querySelectorAll(".hud,.action-dock,#dialog"))root.inert=false;
  if(restoreFocus&&lastFocus?.isConnected)lastFocus.focus();
  if(restoreFocus)lastFocus=null;
}
function openSheet(id){
  if(!modal())lastFocus=document.activeElement;
  closeSheets(false);
  const sheet=$(id);
  sheet.hidden=false;
  for(const root of document.querySelectorAll(".hud,.action-dock,#dialog"))root.inert=true;
  const first=id==="ideaBox"?$("ideaText"):sheet.querySelector("button:not([disabled])");
  first?.focus();
}
function showChoices(){
  const {resource,choices}=getGenieChoices(world);
  choicesCache=choices;
  const names={power:"энергии",water:"воды",food:"еды",eco:"экологии"};
  $("choiceTitle").textContent="Злой Джинн: дефицит "+names[resource];
  for(const button of document.querySelectorAll("[data-decision]")){
    const option=choices[Number(button.dataset.decision)];
    button.textContent=option.label;
    button.dataset.choiceId=String(option.id);
  }
  openSheet("choiceBox");
}
function decide(choiceId){
  closeSheets(false);
  remember();
  const result=applyGenieChoice(world,choiceId);
  finish(result,"Последствия выбора",result.choice.message,"РЕШЕНИЕ ДЖИННА");
  $("choiceTrigger").hidden=false;
}
function submitIdea(text){
  const idea=interpretIdea(text);
  if(!idea.text)return false;
  if(!idea.kinds.length){
    $("ideaHint").hidden=false;
    $("ideaHint").textContent="Пока не могу смоделировать эту идею. Укажи лес, город, энергию или вулкан — мир и ресурсы не изменены.";
    return false;
  }
  remember();
  const result=applyIdea(world,idea.text);
  closeSheets(false);
  $("ideaHint").hidden=true;
  if(idea.kinds.includes("volcano"))sparks();
  finish(result,"Джинн услышал идею!","Твой проект: "+idea.text+
    ". Построено структур: "+idea.kinds.length+".","СВОЯ ИДЕЯ");
  $("choiceTrigger").hidden=false;
  return true;
}
function nextTurn(){
  closeSheets(false);
  remember();
  const result=advanceTick(world);
  const changes=result.events.length?
    result.events.filter(event=>event.source!=="crisis").map(event=>event.text).join(" "):
    "Мир прожил ещё один ход.";
  finish(result,"Мир меняется",changes,"ХОД "+result.world.stats.turn);
}
function undo(){
  const snapshot=undoStack.pop();
  if(!snapshot)return;
  world=restore(snapshot)??createWorld();
  closeSheets();
  render();
  save();
  $("choiceTrigger").hidden=world.stats.turn===0;
  panel("Последний ход отменён","Состояние мира и очередь отложенных последствий восстановлены.");
  caption("ОТМЕНА");
}
function restart(){
  world=createWorld();
  undoStack=[];
  closeSheets();
  render();
  save();
  $("choiceTrigger").hidden=true;
  $("ideaHint").hidden=true;
  $("ideaText").value="";
  panel("Злой Джинн:","Этот мир пока пуст и ждёт твоего решения. Выбери, с чего начать, или поделись своей идеей!");
}
function showHistory(){
  const list=$("historyList");
  list.replaceChildren();
  for(const event of world.history.slice(-20).reverse()){
    const item=document.createElement("li");
    item.textContent="Ход "+event.turn+": "+event.text;
    list.appendChild(item);
  }
  if(!list.children.length){
    const item=document.createElement("li");
    item.textContent="Мир ждёт первого решения.";
    list.appendChild(item);
  }
}
function exportSave(){
  const blob=new Blob([serialize(world)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;link.download="chain-reaction-save.json";
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function setupInteractions(){
  $("choiceTrigger").addEventListener("click",showChoices);
  $("closeDialog").addEventListener("click",()=>$("dialog").classList.add("hidden"));
  $("askIdea").addEventListener("click",()=>openSheet("ideaBox"));
  $("showHelp").addEventListener("click",()=>{showHistory();openSheet("menuBox");});
  $("showMenu").addEventListener("click",()=>{showHistory();openSheet("menuBox");});
  $("closeChoices").addEventListener("click",()=>closeSheets());
  $("closeIdea").addEventListener("click",()=>closeSheets());
  $("closeMenu").addEventListener("click",()=>closeSheets());
  $("ideaFromChoices").addEventListener("click",()=>openSheet("ideaBox"));
  $("nextTurn").addEventListener("click",nextTurn);
  $("undoTurn").addEventListener("click",undo);
  $("exportSave").addEventListener("click",exportSave);
  for(const button of document.querySelectorAll(".option"))
    button.addEventListener("click",()=>{
      if(button.dataset.action==="idea")openSheet("ideaBox");
      else build(button.dataset.action);
    });
  for(const button of document.querySelectorAll("[data-decision]"))
    button.addEventListener("click",()=>decide(Number(button.dataset.choiceId)));
  $("ideaText").addEventListener("input",()=>$("ideaHint").hidden=true);
  $("ideaForm").addEventListener("submit",event=>{
    event.preventDefault();submitIdea($("ideaText").value);
  });
  $("restart").addEventListener("click",restart);
  $("fullscreenBtn").addEventListener("click",async()=>{
    if(document.fullscreenEnabled&&$("game").requestFullscreen){
      try{await $("game").requestFullscreen();closeSheets();return;}catch{}
    }
    $("fullscreenHint").hidden=false;
  });
  $("scratchLaunch").addEventListener("click",function(){
    this.href=new URL("../player/",location.href).href;
  });
  document.addEventListener("keydown",event=>{
    const sheet=modal();
    if(!sheet)return;
    if(event.key==="Escape"){event.preventDefault();closeSheets();return;}
    if(event.key!=="Tab")return;
    const controls=Array.from(sheet.querySelectorAll(
      'button:not([disabled]),textarea:not([disabled]),a[href]'))
      .filter(element=>element.getClientRects().length>0);
    if(!controls.length)return;
    if(event.shiftKey&&document.activeElement===controls[0]){
      event.preventDefault();controls.at(-1).focus();
    }else if(!event.shiftKey&&document.activeElement===controls.at(-1)){
      event.preventDefault();controls[0].focus();
    }
  });
}
function setupWalkers(){
  const people=$("people"),walkers=[];
  const count=touch.matches?7:12;
  for(let i=0;i<count;i++){
    const element=document.createElement("div");
    element.className="person";
    element.innerHTML='<div class="head"></div><div class="coat"></div><div class="legs"></div>';
    people.appendChild(element);
    walkers.push({element,x:8+Math.random()*84,y:38+Math.random()*34,
      speed:(.3+Math.random()*.6)*(Math.random()<.5?-1:1),seed:Math.random()*10});
  }
  let frameId=0,last=0;
  const minStep=touch.matches?42:30;
  function frame(now){
    if(document.hidden||reducedMotion.matches){frameId=0;return;}
    frameId=requestAnimationFrame(frame);
    if(now-last<minStep)return;
    const dt=Math.min(.06,(now-last)/1000);last=now;
    for(const walker of walkers){
      walker.x+=walker.speed*dt;
      if(walker.x<7||walker.x>95)walker.speed*=-1;
      walker.element.style.left=walker.x+"%";
      walker.element.style.top=walker.y+"%";
      walker.element.style.transform="scale("+(.75+(walker.y-30)/95)+") translateY("+
        Math.sin(now/145+walker.seed)*1.9+"px)";
      walker.element.style.setProperty("--gait",Math.sin(now/150+walker.seed)*30+"deg");
    }
  }
  function toggle(){
    if(frameId)cancelAnimationFrame(frameId);
    frameId=0;
    last=performance.now();
    if(!document.hidden&&!reducedMotion.matches)frameId=requestAnimationFrame(frame);
    else for(const walker of walkers){
      walker.element.style.left=walker.x+"%";
      walker.element.style.top=walker.y+"%";
    }
  }
  document.addEventListener("visibilitychange",toggle);
  reducedMotion.addEventListener?.("change",toggle);
  toggle();
}
setupInteractions();
setupWalkers();
render();
$("choiceTrigger").hidden=world.stats.turn===0;
// Existing browser QA uses this tiny, stable public testing interface.
window.__chainReaction={
  build,getState:()=>({...world.stats}),getPlaced:()=>({...world.placed}),
  submitIdea,decide,openChoices:showChoices,advance:nextTurn,undo
};
