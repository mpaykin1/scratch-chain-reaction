// Один DOM-элемент на жителя, только compositor-friendly transform при движении.
export class WalkerAnimation {
  constructor(container,{coarse=matchMedia('(pointer:coarse)').matches}={}) {
    this.container=container;
    this.minStep=coarse?42:30;
    this.walkers=[];
    this.frameId=null;
    this.last=0;
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)');
    for (let i=0;i<(coarse?7:12);i++) {
      const el=document.createElement('div');
      el.className='person';
      el.innerHTML='<div class="head"></div><div class="coat"></div><div class="legs"></div>';
      container.appendChild(el);
      this.walkers.push({
        el,x:8+Math.random()*84,y:38+Math.random()*34,
        velocity:(.3+Math.random()*.6)*(Math.random()<.5?-1:1),
        seed:Math.random()*10,
      });
    }
    this.layout=()=>this.paint(performance.now(),0);
    this.onVisibility=()=>document.hidden?this.stop():this.start();
    this.onMotion=()=>this.reduced.matches?this.stop():this.start();
    window.addEventListener('resize',this.layout);
    document.addEventListener('visibilitychange',this.onVisibility);
    this.reduced.addEventListener?.('change',this.onMotion);
    this.layout();
    this.start();
  }

  paint(now,dt) {
    const width=this.container.clientWidth;
    const height=this.container.clientHeight;
    for (const w of this.walkers) {
      w.x+=w.velocity*dt;
      if (w.x<7 || w.x>95) {
        w.x=Math.max(7,Math.min(95,w.x));
        w.velocity*=-1;
      }
      const bob=this.reduced.matches?0:Math.sin(now/145+w.seed)*1.9;
      const scale=.75+(w.y-30)/95;
      w.el.style.transform='translate3d('+((w.x/100)*width).toFixed(2)+
        'px,'+((w.y/100)*height+bob).toFixed(2)+'px,0) scale('+scale.toFixed(3)+')';
      if (!this.reduced.matches) {
        w.el.style.setProperty('--gait',
          (Math.sin(now/150+w.seed)*30).toFixed(1)+'deg');
      }
    }
  }

  tick=(now)=>{
    if (this.frameId===null) return;
    if (now-this.last>=this.minStep) {
      const dt=Math.min(.06,(now-this.last)/1000);
      this.last=now;
      this.paint(now,dt);
    }
    this.frameId=requestAnimationFrame(this.tick);
  };

  start() {
    if (this.frameId!==null || document.hidden || this.reduced.matches) return;
    this.last=performance.now();
    this.frameId=requestAnimationFrame(this.tick);
  }

  stop() {
    if (this.frameId!==null) cancelAnimationFrame(this.frameId);
    this.frameId=null;
  }
}
