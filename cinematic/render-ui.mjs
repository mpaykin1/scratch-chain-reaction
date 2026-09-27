// The renderer reads a snapshot, never decides how the game evolves.
export function createView(getWorld,doc=document){
  const $=id=>doc.getElementById(id);
  const stats=[...doc.querySelectorAll('[data-stat]')];
  const art=Object.fromEntries(['city','forest','energy','volcano'].map(kind=>[kind,$(kind+'Art')]));
  const cap=$('caption');
  function render(){
    const {state,placed,history=[]}=getWorld();
    for(const node of stats){
      const key=node.dataset.stat,value=state[key];
      if(node.textContent!==String(value))node.textContent=String(value);
      node.closest('.stat')?.setAttribute('aria-label',
        (node.previousElementSibling?.textContent||key)+' '+value);
    }
    for(const [kind,count]of Object.entries(placed))art[kind]?.classList.toggle('active',count>0);
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
