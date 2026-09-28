const START={action:'city',label:'Город',visualAsset:'assets/card_city.webp?v=2'};
const EVOLUTIONS=[
  {when:ctx=>!ctx.placed?.energy,action:'energy',label:'Построить электростанцию',visualAsset:'assets/card_energy.webp?v=2'},
  {when:ctx=>!ctx.placed?.forest,action:'forest',label:'Посадить защитный лес',visualAsset:'assets/card_forest.webp?v=2'},
  {when:()=>true,action:'energy',label:'Усилить энергетику',visualAsset:'assets/card_energy.webp?v=2'}
];

export function resolveCityAction(context={}){
  if(!context.placed?.city)return START;
  return EVOLUTIONS.find(candidate=>candidate.when(context))||START;
}

export function applyCityAction(button,context={}){
  if(!button)return null;
  const action=resolveCityAction(context);
  button.dataset.action=action.action;
  button.setAttribute('aria-label',action.label);
  const title=button.querySelector('.accessible-title');
  if(title)title.textContent=action.label;
  const image=button.querySelector('img');
  if(image){image.src=action.visualAsset;image.alt=action.label;}
  return action;
}
