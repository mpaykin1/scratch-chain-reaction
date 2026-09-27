const SHEETS=['choiceBox','ideaBox','menuBox'];
export function createSheets(doc=document) {
  let backdrop=doc.getElementById('modalBackdrop');
  if (!backdrop) {
    backdrop=doc.createElement('div');
    backdrop.id='modalBackdrop';
    backdrop.hidden=true;
    (doc.getElementById('game')||doc.body).appendChild(backdrop);
  }
  const background=['.hud','.action-dock','#dialog'].map(selector=>doc.querySelector(selector)).filter(Boolean);
  let active=null,opener=null;
  function closeSheets({restoreFocus=true,keepOpener=false}={}) {
    for(const id of SHEETS)doc.getElementById(id).hidden=true;
    backdrop.hidden=true;
    for(const element of background)element.inert=false;
    active=null;
    if(restoreFocus && opener?.isConnected)opener.focus();
    if(!keepOpener)opener=null;
  }
  function openSheet(id) {
    if(!SHEETS.includes(id))return;
    if(!active)opener=doc.activeElement;
    closeSheets({restoreFocus:false,keepOpener:true});
    active=doc.getElementById(id);
    active.hidden=false;backdrop.hidden=false;
    for(const element of background)element.inert=true;
    const first=id==='ideaBox'?doc.getElementById('ideaText'):
      active.querySelector('[data-decision],button,a[href],textarea');
    first?.focus();
  }
  backdrop.addEventListener('click',()=>closeSheets());
  doc.addEventListener('keydown',event=>{
    if(!active)return;
    if(event.key==='Escape'){event.preventDefault();closeSheets();return;}
    if(event.key!=='Tab')return;
    const focusable=[...active.querySelectorAll('button:not(:disabled),a[href],textarea:not(:disabled),input:not(:disabled)')]
      .filter(element=>!element.hidden && element.getClientRects().length);
    if(!focusable.length)return;
    const first=focusable[0],last=focusable.at(-1);
    if(event.shiftKey && (doc.activeElement===first || !active.contains(doc.activeElement))){
      event.preventDefault();last.focus();
    }else if(!event.shiftKey && (doc.activeElement===last || !active.contains(doc.activeElement))){
      event.preventDefault();first.focus();
    }
  });
  return {closeSheets,openSheet};
}
export function delegateGameEvents(doc,{build,decide,openSheet}) {
  const dock=doc.querySelector('.action-dock'),decisions=doc.querySelector('.decisions');
  dock.addEventListener('click',event=>{
    const button=event.target.closest('.option');
    if(!button || !dock.contains(button))return;
    button.dataset.action==='idea'?openSheet('ideaBox'):build(button.dataset.action);
  });
  decisions.addEventListener('click',event=>{
    const button=event.target.closest('[data-decision]');
    if(!button || !decisions.contains(button))return;
    const id=Number(button.dataset.decision);
    if(Number.isInteger(id))decide(id);
  });
}
