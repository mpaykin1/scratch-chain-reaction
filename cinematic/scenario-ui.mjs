import {
  createScenario, choosePlan, advanceTick, previewPlan, analyzeIntent,
  serialize, restore, PLANS, DEFAULT_EXPLANATIONS
} from "./scenario-engine.mjs";

const $ = id => document.getElementById(id);
const KEY="world-server-water-crisis-v1";
let state=readSave()||createScenario();
let selectedPlan=null;
let checkedRationale=null;
const titles={water:"Вода",power:"Энергия",food:"Еда",eco:"Экология",
  population:"Жители",budget:"Бюджет",happiness:"Довольство"};
const art={city:$("cityArt"),forest:$("forestArt"),power:$("powerArt"),volcano:$("volcanoArt")};
const sheets=["projectSheet","historySheet","helpSheet"];
let persistWarned=false;

function readSave(){
  try {return restore(localStorage.getItem(KEY));}catch{return null;}
}
function save(){
  try {localStorage.setItem(KEY,serialize(state));}
  catch {if(!persistWarned){persistWarned=true;$("banner").textContent="Сохранение в браузере недоступно. Можно экспортировать историю."}}
}
function closeSheets(){
  for(const id of sheets)$(id).hidden=true;
}
function openSheet(id){
  closeSheets();
  $(id).hidden=false;
  $(id).querySelector("h2")?.focus?.();
}
function talk(title,text,show=true){
  $("talkTitle").textContent=title;
  $("talkText").textContent=text;
  if(show)$("talk").classList.remove("dismissed");
}
function animateBanner(text){
  $("banner").textContent=text;
  if($("banner").animate) $("banner").animate([
    {opacity:0,transform:"translate(-50%,13px)"},
    {opacity:1,transform:"translate(-50%,0px)"}
  ],{duration:280,easing:"ease-out"});
}
function render(){
  const stats={...state.stats,turn:state.turn};
  for(const [key,value] of Object.entries(stats)){
    const element=$("stat-"+key);
    if(element){
      element.textContent=String(value);
      element.closest(".stat").setAttribute("aria-label",key+" "+value);
    }
  }
  $("stage").classList.toggle("simulating",state.phase==="simulating");
  $("stage").classList.toggle("drought",state.stats.water<28);
  $("stage").classList.toggle("polluted",state.stats.eco<15);
  $("stage").classList.toggle("blackout",state.stats.power<10);
  $("stage").classList.toggle("recovered",state.stats.water>=46&&state.stats.eco>=44);
  const showForest=state.visuals.forest;
  const showPower=state.visuals.power;
  art.forest.classList.toggle("visible",showForest);
  art.power.classList.toggle("visible",showPower);
  art.volcano.classList.toggle("visible",state.visuals.volcano);
  $("rotor").classList.toggle("visible",showPower&&state.stats.power>5);
  const waiting=state.phase==="choose";
  $("next").hidden=waiting;
  $("choices").setAttribute("aria-disabled",String(!waiting));
  for(const button of document.querySelectorAll("[data-plan]"))button.disabled=!waiting;
  if(waiting){
    $("phaseLabel").textContent=state.ending?
      (state.stats.water<20?"🚨 Кризис продолжается":"🌱 Мир можно развивать дальше"):
      "🌊 Засуха: выбери свой первый проект";
  }else{
    $("phaseLabel").textContent="⏳ Мир меняется · ход "+state.turn;
    const project=state.projects.at(-1);
    $("next").textContent="▶ Следующий ход · "+(state.turn-project.startTick+1)+"/3";
  }
}
function explainTick(oldTurn){
  const events=state.history.filter(e=>e.tick===state.turn&&e.tick>oldTurn);
  const concrete=events.filter(e=>e.type!=="consumption");
  const primary=concrete[0]||events[0];
  if(!primary)return;
  const warnings=concrete.filter(e=>["drought","blackout","pollution","migration"].includes(e.type));
  const message=(warnings.length?warnings.map(e=>e.text).join(" "):primary.text)+
    " Вода: "+state.stats.water+", еда: "+state.stats.food+
    ", довольство: "+state.stats.happiness+".";
  talk(warnings.length?"Джинн нашёл последствия!":"Мир меняется!",message);
  animateBanner(primary.text);
  if(state.ending)talk("Злой Джинн:",state.ending+" Выбери следующую структуру и объясни свой план.");
}
function displayPreview(planId,explanation){
  const parsed=analyzeIntent(explanation,planId);
  if(!parsed.valid)throw Error(parsed.feedback[0]);
  const predicted=previewPlan(state,planId,explanation);
  const forecast=$("forecast");
  forecast.replaceChildren();
  for(const [key,delta] of Object.entries(predicted.delta)){
    const el=document.createElement("span");
    el.className=delta<0?"loss":delta>0?"gain":"";
    el.textContent=(titles[key]||key)+": "+(delta>0?"+":"")+delta;
    forecast.appendChild(el);
  }
  const warnings=$("warnings");
  warnings.replaceChildren();
  const messages=[...parsed.feedback,
    ...predicted.events.filter(e=>["drought","blackout","pollution","migration","budget"].includes(e.type))
      .slice(0,4).map(e=>"Ход "+e.tick+": "+e.text)];
  if(!messages.length)messages.push("Из известных факторов серьёзных ошибок пока не обнаружено. Неизвестные риски остаются.");
  for(const message of messages){
    const p=document.createElement("p");p.className="warning";p.textContent=message;
    warnings.appendChild(p);
  }
  $("preview").hidden=false;
  $("commitBtn").hidden=false;
  checkedRationale=explanation;
}
function startPlanning(planId){
  if(state.phase!=="choose")return;
  selectedPlan=planId;
  checkedRationale=null;
  const plan=PLANS.find(p=>p.id===planId);
  $("projectTitle").textContent=plan?plan.icon+" "+plan.title:"✍ Своя идея";
  $("projectDescription").textContent=plan?plan.detail:
    "Опиши собственный проект. Сейчас поддерживаются лес, накопление дождевой воды, солнечные насосы и фильтрация. Неизвестную идею мы не притворяемся умеющими моделировать.";
  $("reason").value=plan?DEFAULT_EXPLANATIONS[planId]:"";
  $("projectError").hidden=true;
  $("preview").hidden=true;
  $("commitBtn").hidden=true;
  openSheet("projectSheet");
  if(planId==="own")$("reason").focus();
}
function showError(message){
  $("projectError").textContent=message;
  $("projectError").hidden=false;
}
function inspect(){
  $("projectError").hidden=true;
  $("preview").hidden=true;
  $("commitBtn").hidden=true;
  checkedRationale=null;
  try{displayPreview(selectedPlan,$("reason").value.trim());}
  catch(error){showError(error.message);}
}
function commit(event){
  event.preventDefault();
  $("projectError").hidden=true;
  if(!checkedRationale||checkedRationale!==$("reason").value.trim()){
    inspect();return;
  }
  try{
    state=choosePlan(state,selectedPlan,checkedRationale);
    const project=state.projects.at(-1);
    closeSheets();
    render();
    save();
    talk("Проект запущен!",project.title+". "+(project.freeAnalysis||"")+
      " Следи за отложенными последствиями — нажми «Следующий ход».");
    animateBanner("🏗 "+project.title);
  }catch(error){showError(error.message);}
}
function tick(){
  if(state.phase!=="simulating")return;
  const old=state.turn;
  state=advanceTick(state);
  render();
  save();
  explainTick(old);
}
function renderHistory(){
  $("historyList").replaceChildren();
  const projects=new Map(state.projects.map(p=>[p.id,p]));
  for(const event of state.history.slice().reverse()){
    const li=document.createElement("li");
    const strong=document.createElement("strong");
    strong.textContent="Ход "+event.tick+" · "+event.source;
    const text=document.createElement("div");text.textContent=event.text;
    const details=document.createElement("small");
    const parent=projects.get(event.parentId);
    const cause=state.history.find(e=>e.id===event.causedById);
    const deltas=Object.entries(event.delta).filter(([,amount])=>amount!==0)
      .map(([key,amount])=>(titles[key]||key)+" "+(amount>0?"+":"")+amount).join(", ");
    details.textContent=(parent?"Проект: "+parent.title+". ":"")+
      (cause?"Возникло из события «"+cause.source+"» (ход "+cause.tick+"). ":"")+
      (deltas||"Показатели без изменений");
    li.append(strong,text,details);
    $("historyList").appendChild(li);
  }
}
function showHistory(){renderHistory();openSheet("historySheet");}
function exportHistory(){
  const blob=new Blob([serialize(state)],{type:"application/json;charset=utf-8"});
  const href=URL.createObjectURL(blob);
  const anchor=document.createElement("a");
  anchor.href=href;anchor.download="chain-reaction-water-seed-"+state.seed+"-turn-"+state.turn+".json";
  anchor.click();
  setTimeout(()=>URL.revokeObjectURL(href),600);
}
function resetWorld(){
  if(!confirm("Начать мир заново? Текущее сохранение будет удалено."))return;
  state=createScenario(state.seed);
  try{localStorage.removeItem(KEY)}catch{}
  closeSheets();render();save();
  talk("Злой Джинн:","Город построен, но вода заканчивается. Выбери структуру и объясни, как она спасёт людей.");
}
function fillWalkers(){
  const count=matchMedia("(pointer:coarse)").matches?7:12;
  for(let i=0;i<count;i++){
    const person=document.createElement("i");person.className="walker";
    person.style.left=(12+((i*31)%75))+"%";
    person.style.top=(38+((i*17)%32))+"%";
    person.style.setProperty("--duration",(13+(i%7)*4)+"s");
    person.style.animationDelay=(-3*i)+"s";
    $("walkers").appendChild(person);
  }
}
async function fullscreen(){
  if(document.fullscreenEnabled&&$("stage").requestFullscreen){
    try{await $("stage").requestFullscreen();return;}catch{}
  }
  openSheet("helpSheet");
  const notice=document.createElement("p");
  notice.textContent="На iPhone: Safari → Поделиться → На экран Домой. Обычная вкладка Safari не позволяет скрыть верхнюю панель.";
  $("helpSheet").appendChild(notice);
}
for(const button of document.querySelectorAll("[data-plan]"))
  button.addEventListener("click",()=>startPlanning(button.dataset.plan));
$("checkBtn").onclick=inspect;
$("projectForm").addEventListener("submit",commit);
$("reason").addEventListener("input",()=>{
  checkedRationale=null;$("preview").hidden=true;$("commitBtn").hidden=true;
  $("projectError").hidden=true;
});
$("next").onclick=tick;
$("closeTalk").onclick=()=>$("talk").classList.add("dismissed");
$("projectClose").onclick=$("cancelBtn").onclick=()=>closeSheets();
$("historyBtn").onclick=showHistory;
$("historyClose").onclick=$("historyDone").onclick=()=>closeSheets();
$("helpBtn").onclick=()=>openSheet("helpSheet");
$("helpClose").onclick=$("helpDone").onclick=()=>closeSheets();
$("fullscreenBtn").onclick=fullscreen;
$("resetBtn").onclick=resetWorld;
$("exportBtn").onclick=exportHistory;
document.addEventListener("keydown",event=>{if(event.key==="Escape")closeSheets();});
fillWalkers();
render();
if(state.history.length>1){
  talk("Мир восстановлен из сохранения",
    "Ход "+state.turn+". "+(state.ending||state.last?.text||"Продолжай управлять миром."));
}
// Expose read-only state snapshots for reproducible browser QA. Changes still require controls.
window.__scenarioQA={
  getState:()=>JSON.parse(serialize(state)),getHistory:()=>state.history.slice()
};

