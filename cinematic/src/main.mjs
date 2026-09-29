import { GameEngine } from './game-logic.mjs';
import { GameRenderer } from './renderer.mjs';
import { WalkerAnimation } from './walkers.mjs';
import { SheetController, delegateGameEvents } from './ui.mjs';

const $=id=>document.getElementById(id);
const SAVE_KEY='chain-reaction-cinematic-v1';
function readSave() {
  try {
    const saved=localStorage.getItem(SAVE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
}
const engine=new GameEngine(readSave());
const renderer=new GameRenderer();
const sheets=new SheetController();
new WalkerAnimation($('people'));

function persist() {
  try { localStorage.setItem(SAVE_KEY,JSON.stringify(engine.snapshot())); }
  catch { /* Играть можно даже в приватном режиме без хранилища. */ }
}
function update() {
  renderer.render(engine);
  persist();
}
function build(kind,options) {
  const result=engine.build(kind,options);
  if (!result) return null;
  update();
  renderer.caption('+'+({
    city:' ГОРОД',forest:' ЛЕС',energy:' ЭНЕРГИЯ',volcano:' ВУЛКАН',
  }[kind]));
  if (kind==='volcano') renderer.embers();
  renderer.panel(result.title,result.body);
  if (!options?.fromIdea) sheets.close();
  return result;
}
function decide(index) {
  const result=engine.decide(index);
  if (!result) return null;
  update();
  sheets.close();
  renderer.panel(result.title,result.body);
  return result;
}
function submitIdea(input) {
  const result=engine.submitIdea(input);
  if (!result) return null;
  update();
  for (const change of result.changes) {
    renderer.caption('+'+({
      city:' ГОРОД',forest:' ЛЕС',energy:' ЭНЕРГИЯ',volcano:' ВУЛКАН',
    }[change.kind]));
    if (change.kind==='volcano') renderer.embers();
  }
  sheets.close();
  renderer.panel(result.title,result.body);
  return result;
}
function restart() {
  engine.reset();
  try { localStorage.removeItem(SAVE_KEY); } catch {}
  update();
  sheets.close();
  renderer.panel('Злой Джинн:',
    'Этот мир пока пуст и ждёт твоего решения. Выбери, с чего начать, или поделись своей идеей!');
}
function undo() {
  if (!engine.undo()) return false;
  update();
  sheets.close();
  renderer.panel('Предыдущий ход отменён',
    'Мир и его ресурсы вернулись к состоянию до последнего действия.');
  return true;
}

delegateGameEvents(document,{
  build,decide,openIdea:()=>sheets.open('ideaBox'),
});
$('choiceTrigger').addEventListener('click',()=>sheets.open('choiceBox'));
$('askIdea').addEventListener('click',()=>sheets.open('ideaBox'));
$('showHelp').addEventListener('click',()=>sheets.open('menuBox'));
$('showMenu').addEventListener('click',()=>sheets.open('menuBox'));
$('closeDialog').addEventListener('click',()=>$('dialog').classList.add('hidden'));
$('closeChoices').addEventListener('click',()=>sheets.close());
$('closeIdea').addEventListener('click',()=>sheets.close());
$('closeMenu').addEventListener('click',()=>sheets.close());
$('ideaFromChoices').addEventListener('click',()=>sheets.open('ideaBox'));
$('ideaForm').addEventListener('submit',event=>{
  event.preventDefault();
  const result=submitIdea($('ideaText').value);
  if (result) $('ideaText').value='';
});
$('restart').addEventListener('click',restart);
$('undo').addEventListener('click',undo);
$('fullscreenBtn').addEventListener('click',async()=>{
  if (document.fullscreenEnabled && $('game').requestFullscreen) {
    try {
      await $('game').requestFullscreen();
      sheets.close();
      return;
    } catch { /* На iOS используем PWA-подсказку. */ }
  }
  $('fullscreenHint').hidden=false;
});
$('scratchLaunch').href=new URL('../player/',location.href).href;

// Стабильный тестовый API: совместим с прежними браузерными проверками.
window.__chainReaction={
  build,getState:()=>engine.getState(),getPlaced:()=>engine.getPlaced(),
  submitIdea,decide,openChoices:()=>sheets.open('choiceBox'),
  restart,undo,snapshot:()=>engine.snapshot(),
};
renderer.render(engine);
if (engine.getState().turn>0) renderer.panel('Мир восстановлен',
  'Продолжаем с последнего сохранённого хода. Все построенные объекты и ресурсы на месте.');
