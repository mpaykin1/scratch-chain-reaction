import {ASSET_REGISTRY} from './living-actions.mjs';
// The renderer reads a snapshot, never decides how the game evolves.
export function createView(getWorld,doc=document){
  const $=id=>doc.getElementById(id);
  const stats=[...doc.querySelectorAll('[data-stat]')];
  const art=Object.fromEntries(['city','forest','energy','volcano'].map(kind=>[kind,$(kind+'Art')]));
  const cap=$('caption'),map=$('worldLayer'),nodes=new Map();
  function renderMap(){
    if(!map)return;
    const {living,viewport={x:0,z:0},selectedId}=getWorld();
    const objects=[...(living?.objects||[])];
    if(living?.dragon?.hp>0)objects.push({...living.dragon,kind:'dragon'});
    const active=new Set();
    for(const object of objects){
      const asset=ASSET_REGISTRY[object.kind];
      if(!asset)continue;
      active.add(object.id);
      let node=nodes.get(object.id);
      if(!node){
        node=doc.createElement('button');
        node.type='button';node.className='living-object '+object.kind;
        node.dataset.objectId=object.id;
        if(asset.image){
          const image=doc.createElement('img');
          image.src=asset.image;image.alt='';image.decoding='async';node.append(image);
        }else {
          const glyph=doc.createElement('span');glyph.className='living-emoji';
          glyph.textContent=asset.emoji;node.append(glyph);
        }
        if(object.kind==='city'){
          const dome=doc.createElement('span');dome.className='living-dome';
          dome.setAttribute('aria-hidden','true');node.append(dome);
        }
        map.append(node);nodes.set(object.id,node);
      }
      node.style.left=(50+(object.x-viewport.x)*.8)+'%';
      node.style.top=(48+(object.z-viewport.z)*.8)+'%';
      node.hidden=Math.abs(object.x-viewport.x)>73||Math.abs(object.z-viewport.z)>73;
      node.classList.toggle('selected',object.id===selectedId);
      node.classList.toggle('damaged',(object.hp??100)<100);
      if(object.kind==='city')node.querySelector('.living-dome')
        .classList.toggle('active',object.dome>0);
      node.setAttribute('aria-label',asset.alt+(object.kind==='city'?
        ', целостность '+object.hp+'%'+(object.dome?', защитный купол '+object.dome+'%':''):''));
    }
    for(const [id,node] of nodes){
      if(!active.has(id)){node.remove();nodes.delete(id);}
    }
    const scenery=$('scenery');
    scenery.style.backgroundPosition=(50-viewport.x*.2)+'% '+(50-viewport.z*.2)+'%';
  }
  function render(){
    const {state,placed,history=[]}=getWorld();
    for(const node of stats){
      const key=node.dataset.stat,value=state[key];
      if(node.textContent!==String(value))node.textContent=String(value);
      const critical=['power','water','food','eco'].includes(key)&&value<10;
      node.closest('.stat')?.classList.toggle('critical',critical);
      node.closest('.stat')?.setAttribute('aria-label',
        (node.previousElementSibling?.textContent||key)+' '+value+
        (critical?', критический дефицит':''));

    }
    const costs={city:12,forest:10,energy:16,volcano:9,idea:6};
    for(const button of doc.querySelectorAll('.action-dock .option')){
      const cost=costs[button.dataset.action]||0,poor=state.budget<cost;
      button.dataset.unaffordable=String(poor);
      button.title=poor?'Не хватает бюджета: требуется минимум '+cost:
        button.dataset.action==='idea'?'Своя идея: исследование 6 + стоимость всех построек':
        'Построить: '+(button.getAttribute('aria-label')||button.dataset.action);
      button.setAttribute('aria-description',button.title);
    }
    for(const [kind,count]of Object.entries(placed))art[kind]?.classList.toggle('active',
      count>0&&!(getWorld().living?.objects||[]).some(o=>o.kind===kind));
    renderMap();
    $('rotor').classList.toggle('on',placed.energy>0);
    $('scenery').classList.toggle('developed',Object.values(placed).reduce((a,b)=>a+b,0)>=4);
    const log=$('historyLog');if(log){log.replaceChildren();for(const event of history.slice(-8).reverse()){const li=doc.createElement('li');li.textContent=event.text;log.appendChild(li);}}
    window.dispatchEvent(new CustomEvent('worldStateUpdate',{detail:{...state,placed:{...placed}}}));
  }
  function panel(title,body){
    $('dialogTitle').textContent=title;
    $('dialogText').textContent=body;
    $('dialog').classList.remove('hidden');
  }
  function caption(value){
    cap.textContent=value;
    cap.classList.remove('animate');
    void cap.offsetWidth;
    cap.classList.add('animate');
  }
  function embers(){
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    for(let i=0;i<9;i++){
      const ember=doc.createElement('i');ember.className='spark';
      ember.style.right=(8+Math.random()*20)+'%';
      ember.style.top=(24+Math.random()*14)+'%';
      ember.style.setProperty('--wx',(Math.random()*130-60)+'px');
      ember.style.animationDelay=(Math.random()*1.5)+'s';
      $('game').appendChild(ember);
      ember.addEventListener('animationend',()=>ember.remove(),{once:true});
    }
  }
  return {render,renderMap,panel,caption,embers};
}
