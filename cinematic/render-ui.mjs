// The renderer reads a snapshot, never decides how the game evolves.
export function createView(getWorld,doc=document){
  const $=id=>doc.getElementById(id);
  const stats=[...doc.querySelectorAll('[data-stat]')];
  const art=Object.fromEntries(['city','forest','energy','volcano'].map(kind=>[kind,$(kind+'Art')]));
  const cap=$('caption'),game=$('game');
  let placementLayer=$('placedObjects');
  if(!placementLayer){placementLayer=doc.createElement('div');placementLayer.id='placedObjects';game.appendChild(placementLayer);}
  const placementNodes=new Map();
  const placementShape={city:[.30,280,.68],forest:[.32,300,.70],energy:[.22,210,.95],volcano:[.30,300,.85]};
  function renderPlacements(placements,placed){
    const list=Array.isArray(placements)?placements:[],ids=new Set(list.map(item=>item.id));
    for(const [id,node] of placementNodes)if(!ids.has(id)){node.remove();placementNodes.delete(id);}
    const counts={city:0,forest:0,energy:0,volcano:0};
    for(const item of list){
      if(!placementShape[item.kind])continue;
      counts[item.kind]++;
      let node=placementNodes.get(item.id);
      if(!node){node=doc.createElement('img');node.className='placed-object placed-'+item.kind;
        node.src=new URL('./assets/'+item.kind+'.webp',import.meta.url).href;node.alt='';node.decoding='async';
        node.dataset.placementId=item.id;node.dataset.placementKind=item.kind;placementLayer.appendChild(node);placementNodes.set(item.id,node);}
      const [share,max,ratio]=placementShape[item.kind],width=Math.min(max,Math.max(72,game.clientWidth*share));
      node.style.left=(item.x*100)+'%';node.style.top=(item.y*100)+'%';node.style.width=width+'px';node.style.height=(width*ratio)+'px';
    }
    for(const [kind,count]of Object.entries(placed))art[kind]?.classList.toggle('active',count>(counts[kind]||0));
  }
  function render(){
    const {state,placed,placements=[],history=[]}=getWorld();
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
    renderPlacements(placements,placed);
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
  return {render,panel,caption,embers};
}
