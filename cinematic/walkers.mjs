// Reuse nodes and update compositor transforms; stop RAF while hidden.
export function startWalkers(container,{coarse=matchMedia('(pointer:coarse)').matches}={}) {
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const people=Array.from({length:coarse?7:12},()=>{
    const el=document.createElement('div');
    el.className='person';
    el.innerHTML='<div class="head"></div><div class="coat"></div><div class="legs"></div>';
    container.appendChild(el);
    return {el,x:8+Math.random()*84,y:38+Math.random()*34,
      vx:(.3+Math.random()*.6)*(Math.random()<.5?-1:1),seed:Math.random()*10};
  });
  let raf=null,last=0;
  const minStep=coarse?42:30;
  function paint(now,dt) {
    const width=container.clientWidth,height=container.clientHeight;
    for(const person of people){
      person.x+=person.vx*dt;
      if(person.x<7||person.x>95){
        person.x=Math.max(7,Math.min(95,person.x));person.vx*=-1;
      }
      const bob=reduced.matches?0:Math.sin(now/145+person.seed)*1.9;
      const scale=.75+(person.y-30)/95;
      person.el.style.transform='translate3d('+(width*person.x/100).toFixed(1)+'px,'+
        (height*person.y/100+bob).toFixed(1)+'px,0) scale('+scale.toFixed(3)+')';
      if(!reduced.matches)person.el.style.setProperty('--gait',
        (Math.sin(now/150+person.seed)*30).toFixed(1)+'deg');
    }
  }
  function tick(now) {
    if(raf===null)return;
    if(now-last>=minStep){const dt=Math.min(.06,(now-last)/1000);last=now;paint(now,dt);}
    raf=requestAnimationFrame(tick);
  }
  function stop(){if(raf!==null)cancelAnimationFrame(raf);raf=null;}
  function start(){
    if(raf!==null||document.hidden||reduced.matches)return;
    last=performance.now();raf=requestAnimationFrame(tick);
  }
  const onVisibility=()=>document.hidden?stop():start();
  const onMotion=()=>reduced.matches?stop():start();
  const onResize=()=>paint(performance.now(),0);
  document.addEventListener('visibilitychange',onVisibility);
  window.addEventListener('resize',onResize);
  reduced.addEventListener?.('change',onMotion);
  onResize();start();
  return {stop,start,destroy(){
    stop();window.removeEventListener('resize',onResize);
    document.removeEventListener('visibilitychange',onVisibility);
    reduced.removeEventListener?.('change',onMotion);
    for(const person of people)person.el.remove();
  }};
}
