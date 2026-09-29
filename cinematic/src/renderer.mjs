import { BUILD_KINDS } from './game-state.mjs';

export class GameRenderer {
  constructor(doc=document) {
    this.doc=doc;
    this.byId=id=>doc.getElementById(id);
    this.stats=Object.fromEntries(
      [...doc.querySelectorAll('[data-stat]')].map(el=>[el.dataset.stat,el]),
    );
    this.art=Object.fromEntries(
      BUILD_KINDS.map(kind=>[kind,this.byId(kind+'Art')]),
    );
    this.captionNode=this.byId('caption');
  }

  render(engine) {
    const values=engine.getState(), placed=engine.getPlaced();
    for (const [key,el] of Object.entries(this.stats)) {
      if (el.textContent!==String(values[key])) el.textContent=String(values[key]);
      const name=el.previousElementSibling?.textContent || key;
      el.closest('.stat')?.setAttribute('aria-label',name+' '+values[key]);
    }
    for (const kind of BUILD_KINDS) {
      this.art[kind]?.classList.toggle('active',placed[kind]>0);
    }
    this.byId('rotor').classList.toggle('on',placed.energy>0);
    this.byId('scenery').classList.toggle('developed',
      Object.values(placed).reduce((a,b)=>a+b,0)>=4);
    this.byId('choiceTrigger').hidden=!engine.state.pendingDecision;
    const undo=this.byId('undo');
    if (undo) undo.disabled=engine.history.length===0;
    this.renderHistory(engine.state.log);
  }

  renderHistory(entries) {
    const container=this.byId('historyLog');
    if (!container) return;
    container.replaceChildren();
    for (const line of [...entries].reverse().slice(0,10)) {
      const item=this.doc.createElement('li');
      item.textContent=line;
      container.appendChild(item);
    }
  }

  panel(title,body) {
    this.byId('dialogTitle').textContent=title;
    this.byId('dialogText').textContent=body;
    this.byId('dialog').classList.remove('hidden');
  }

  caption(label) {
    this.captionNode.textContent=label;
    this.captionNode.classList.remove('animate');
    // Явный restart CSS-анимации делаем только при реальном игровом событии.
    void this.captionNode.offsetWidth;
    this.captionNode.classList.add('animate');
  }

  embers() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (let i=0;i<9;i++) {
      const spark=this.doc.createElement('i');
      spark.className='spark';
      spark.style.right=(8+Math.random()*20)+'%';
      spark.style.top=(24+Math.random()*14)+'%';
      spark.style.setProperty('--wx',(Math.random()*130-60)+'px');
      spark.style.animationDelay=(Math.random()*1.5)+'s';
      this.byId('game').appendChild(spark);
      spark.addEventListener('animationend',()=>spark.remove(),{once:true});
    }
  }
}
