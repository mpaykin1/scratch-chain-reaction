import {BUILD_EFFECTS,quoteBuild,quoteFeature} from './chain-engine.mjs';

// One source image is shared by the scene, construction catalogue and action dock.
// A GLB/APNG recipe can replace a poster later without creating a second UI asset.
export const ASSET_REGISTRY=Object.freeze({
  city:{image:'assets/city.webp',alt:'Город',model:'city'},
  forest:{image:'assets/forest.webp',alt:'Лес',model:'forest'},
  volcano:{image:'assets/volcano.webp',alt:'Вулкан',model:'volcano'},
  energy:{image:'assets/energy.webp',alt:'Электростанция',model:'energy'},
  idea:{image:'assets/card_idea.webp',alt:'Идея'},
  dragon:{emoji:'🐉',alt:'Дракон'}
});
const BASE=[
  {id:'build-city',kind:'city',label:'Город'},
  {id:'build-forest',kind:'forest',label:'Лес'},
  {id:'build-volcano',kind:'volcano',label:'Вулкан'},
  {id:'build-energy',kind:'energy',label:'Энергия'},
  {id:'idea',kind:'idea',label:'Своя идея'}
];
const SPECIAL={
  dome:['city','Защитный купол','🛡️'], 'summon-dragon':['dragon','Вызвать дракона','🐉'],
  archers:['city','Поднять лучников','🏹'],negotiate:['dragon','Переговоры','🕊️'],
  evacuate:['city','Укрыть жителей','🏃'],repair:['city','Восстановить город','🔧'],
  'expand-city':['city','Развивать город','🏗️'],
  wildlife:['forest','Заселить животными','🦌'], 'expand-forest':['forest','Расширить лес','🌳'],
  'guide-lava':['volcano','Направить лаву','🌋'],
  geothermal:['volcano','Геотермальная станция','⚡'],
  island:['volcano','Создать остров','🏝️'],
  'volcano-research':['volcano','Исследовать вулкан','🔬'],
  'connect-grid':['energy','Подключить город','🔌'],
  battery:['energy','Построить накопитель','🔋'],
  'expand-grid':['energy','Расширить энергосеть','⚡'],
  'stabilize-grid':['energy','Стабилизировать сеть','🛠️'],
  'upgrade-grid':['energy','Модернизировать сеть','⚙️'],
  'reinforce-dome':['city','Усилить купол','✨']
};
const visible=(o,v)=>Math.abs(o.x-v.x)<=55&&Math.abs(o.z-v.z)<=55;
export function getLivingActions(world,{selectedId=null,viewport={x:0,z:0}}={}){
  const objects=world.living?.objects||[];
  const selected=objects.find(o=>o.id===selectedId);
  const nearby=objects.filter(o=>visible(o,viewport));
  const nearest=kind=>[...(selected?.kind===kind?[selected]:[]),
    ...nearby.filter(o=>o.kind===kind)].sort((a,b)=>
    (a.id===selectedId?-10000:Math.hypot(a.x-viewport.x,a.z-viewport.z))-
    (b.id===selectedId?-10000:Math.hypot(b.x-viewport.x,b.z-viewport.z)))[0];
  const city=nearest('city'),forest=nearest('forest'),volcano=nearest('volcano');
  const energy=nearest('energy'),dragon=world.living?.dragon;
  const danger=dragon?.hp>0&&city&&Math.hypot(dragon.x-city.x,dragon.z-city.z)<60;
  let slots=BASE.map(a=>({...a}));
  if(city)slots[0]={id:city.hp<100&&!danger?'repair':
    !city.dome?'dome':danger?'archers':dragon?.hp===0?'expand-city':'summon-dragon',targetId:city.id};
  if(forest)slots[1]={id:forest.wildlife?'expand-forest':'wildlife',targetId:forest.id};
  if(volcano)slots[2]={id:!volcano.lavaGuided?'guide-lava':
    !volcano.geothermal?'geothermal':volcano.island?'volcano-research':'island',targetId:volcano.id};
  if(energy)slots[3]={id:city&&!city.gridConnected?'connect-grid':
    !energy.battery?'battery':!energy.gridExpanded?'expand-grid':
    energy.gridStable?'upgrade-grid':'stabilize-grid',targetId:energy.id};
  if(danger) {
    slots[0]={id:'archers',targetId:city.id};
    slots[1]={id:'negotiate',targetId:city.id};
    slots[2]={id:'evacuate',targetId:city.id};
    slots[3]={id:city.dome?'reinforce-dome':'dome',targetId:city.id};
  } else if(city?.dome&&dragon?.hp===0&&city.hp<100) {
    slots[0]={id:'repair',targetId:city.id};
  }
  return slots.map((slot,index)=>{
    if(slot.id==='idea')return {...slot,available:true,cost:0,reason:'',overlay:'✍️'};
    const base=slot.id.startsWith('build-');
    const kind=base?slot.kind:SPECIAL[slot.id][0];
    const quote=base?quoteBuild(world,kind):quoteFeature(world,slot.id,slot.targetId);
    const target=objects.find(o=>o.id===slot.targetId);
    const level=slot.id==='volcano-research'?target?.researchCount:
      slot.id==='upgrade-grid'?target?.upgradeCount:null;
    return {...slot,kind,label:(base?slot.label:SPECIAL[slot.id][1])+
      (level==null?'':' · '+((level||0)+1)),
      overlay:base?'':SPECIAL[slot.id][2],available:quote.allowed,cost:quote.cost,
      reason:quote.reason,slot:index};
  });
}
export function paintActionDock(doc,actions){
  const buttons=[...doc.querySelectorAll('.action-dock .option')];
  for(let i=0;i<buttons.length;i++){
    const button=buttons[i],action=actions[i],asset=ASSET_REGISTRY[action.kind];
    button.dataset.livingId=action.id;
    button.dataset.targetId=action.targetId||'';
    button.dataset.action=action.kind;
    button.disabled=!action.available;
    button.dataset.unaffordable=String(!action.available);
    button.setAttribute('aria-label',action.label);
    button.title=action.available?action.label+(action.cost?' · бюджет '+action.cost:''):
      action.label+' · '+action.reason;
    button.querySelector('.accessible-title').textContent=action.label;
    const image=button.querySelector('img');image.hidden=!asset.image;
    if(asset.image&&image.getAttribute('src')!==asset.image)image.src=asset.image;
    let overlay=button.querySelector('.preview-overlay');
    if(!overlay){overlay=doc.createElement('span');overlay.className='preview-overlay';button.append(overlay);}
    overlay.textContent=action.overlay||asset.emoji||'';
    overlay.hidden=!overlay.textContent;
  }
}
export const BUILD_KINDS=Object.keys(BUILD_EFFECTS);
