// Pure presentation of authoritative D1 story state. No local story simulation.
// Fire, ruins and retreat only appear after actual server events.
export function createUnifiedStoryEffects(host,doc=document){
  const flame=doc.createElement('div');
  flame.id='cityFire';flame.className='city-fire';
  flame.setAttribute('role','img');
  flame.setAttribute('aria-label','В городе пожар после нападения дракона');
  flame.textContent='🔥🔥🔥';flame.hidden=true;
  host.appendChild(flame);
  let lastReaction='';
  function update(snapshot){
    const story=snapshot?.story||{},placed=snapshot?.placed||{};
    const burning=['dragon_fire','fire'].includes(story.active?.kind);
    const ruined=Array.isArray(story.ruins)&&story.ruins.some(ruin=>
      ['luxury_arcology','tourism','temple'].includes(ruin.type)&&!ruin.complete);
    host.dataset.burning=String(burning);
    host.dataset.ruined=String(ruined);
    flame.hidden=!burning;
    flame.setAttribute('aria-label',ruined?
      'Пожар и руины построенного города':'Пожар в игровом мире');
    const reaction=story.last?.reaction||'';
    if(reaction&&reaction!==lastReaction&&reaction==='dragon_retreat'){
      host.classList.remove('dragon-counterattack');
    }else if(reaction==='dragon_counterattack'){
      host.classList.add('dragon-counterattack');
    }
    lastReaction=reaction;
    window.dispatchEvent(new CustomEvent('worldStoryUpdate',{
      detail:{story,placed,revision:snapshot.revision,burning,ruined}
    }));
  }
  return{update,destroy(){flame.remove()}};
}
