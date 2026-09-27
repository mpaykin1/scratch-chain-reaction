import {createEffectLayer} from './render-effects.mjs';
import {createAmbientAudio} from './ambient-audio.mjs';
const host=document.getElementById('game');
const effects=createEffectLayer(host);
const audio=createAmbientAudio();
const controls=document.querySelector('.controls');
if(controls){
  const button=document.createElement('button');
  button.id='soundBtn';button.className='ctrl';button.type='button';
  button.title='Включить или выключить звук';
  button.setAttribute('aria-label','Включить звук');
  button.setAttribute('aria-pressed','false');
  button.textContent='🔇';controls.appendChild(button);
  button.addEventListener('click',async()=>{
    const enabled=await audio.toggle();
    button.textContent=enabled?'🔊':'🔇';
    button.setAttribute('aria-pressed',String(enabled));
    button.setAttribute('aria-label',enabled?'Выключить звук':'Включить звук');
  });
}
const update=state=>{effects?.setWorldState(state);audio.setWorldState(state);};
window.addEventListener('worldStateUpdate',event=>update(event.detail));
window.addEventListener('worldAction',event=>{
  effects?.pulse(event.detail.kind);
  audio.pulse(event.detail.kind);
});
if(window.__chainReaction)update(window.__chainReaction.getState());
document.addEventListener('visibilitychange',()=>audio.muteOnHidden());
if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1')){
  window.addEventListener('load',()=>navigator.serviceWorker.register(new URL('../sw.js',import.meta.url),{
    scope:new URL('../',import.meta.url).pathname
  }).catch(error=>console.info('Offline mode unavailable:',error.message)),{once:true});
}
