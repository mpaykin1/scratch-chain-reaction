import {parseIdeaActions,sanitizeIdea} from './idea-parser.mjs';
// Pure, deterministic simulation for the cinematic mode. No DOM, network, time or RNG.
export const VERSION=1;
export const INITIAL=Object.freeze({turn:0,population:32,power:0,water:0,food:0,eco:0,budget:50});
export const BUILD_EFFECTS=Object.freeze({
  city:{population:11,power:-9,water:-8,food:-5,eco:-5,budget:-12},
  forest:{eco:18,water:12,food:9,budget:-10},
  energy:{power:32,eco:-8,water:-5,budget:-16},
  volcano:{power:21,eco:-20,population:-3,water:-7,budget:-9}
});
export const DECISIONS=Object.freeze([
  {power:13,eco:-19,water:-6},
  {power:19,eco:-15,food:-7},
  {power:9,budget:-18,water:-4},
  {power:8,eco:8,budget:-10}
]);
export const DECISION_MESSAGES=[
  'Энергии прибавилось, но лес выжжен.',
  'Мегазавод запущен: загрязнение угрожает урожаю.',
  'Импорт помог пережить кризис, но бюджет истощается.',
  'Модернизация и восстановление природы требуют вложений.'
];
const EXTRA=Object.freeze({
  irrigation:{water:14,food:7,power:-3,budget:-9},
  recycling:{eco:11,water:4,budget:-8},
  farm:{food:16,water:-5,budget:-9}
});
const ACTION_LABEL={city:'Город',forest:'Лес',energy:'Энергия',volcano:'Вулкан',
  irrigation:'Орошение',recycling:'Очистка воды',farm:'Фермы'};
const clamp=value=>Math.max(0,Math.min(100,Math.round(value)));
const copy=world=>({
  state:{...world.state},placed:{...world.placed},
  queue:world.queue.map(item=>({...item,delta:{...item.delta}})),
  history:world.history.map(item=>({...item})),
  living:world.living?{
    objects:world.living.objects.map(o=>({...o})),
    dragon:world.living.dragon?{...world.living.dragon}:null,
    nextId:world.living.nextId,
    recentRequests:[...world.living.recentRequests]
  }:{
    objects:Object.entries(world.placed).flatMap(([kind,count])=>
      Array.from({length:count},(_,i)=>({id:'legacy-'+kind+'-'+i,kind,
        x:i*8,z:0,hp:100,dome:0}))),
    dragon:null,nextId:1,recentRequests:[]
  }
});
const update=(stats,delta)=>{for(const [key,value] of Object.entries(delta)){
  if(!Object.hasOwn(INITIAL,key)||key==='turn'||!Number.isFinite(value))throw Error('Invalid resource delta: '+key);
  stats[key]=clamp(stats[key]+value);
}};
const record=(world,type,text,parentId,delta={})=>{
  const event={id:world.history.length?world.history.at(-1).id+1:1,tick:world.state.turn,type,text,parentId,delta};
  world.history.push(event);
  if(world.history.length>150)world.history.shift();
  return event;
};
export function quoteBuild(world,key){
  if(!Object.hasOwn(BUILD_EFFECTS,key))return {allowed:false,reason:'Неизвестное действие',cost:0};
  const cost=Math.abs(BUILD_EFFECTS[key].budget||0);
  if(world.state.budget<cost)return {allowed:false,reason:'Нужно ещё '+(cost-world.state.budget)+' к бюджету',cost};
  return {allowed:true,reason:'',cost};
}
export function quoteIdea(world,input){
  const idea=sanitizeIdea(input);
  const actions=idea.length>800?[]:parseIdeaActions(idea);
  if(!actions.length)return {allowed:false,reason:'Идея не распознана или превышает 800 символов.',cost:0,actions:[]};
  const cost=6+actions.reduce((sum,key)=>sum+Math.abs((BUILD_EFFECTS[key]||EXTRA[key]||{}).budget||0),0);
  if(world.state.budget<cost)return {allowed:false,reason:'Нужно ещё '+(cost-world.state.budget)+' к бюджету',cost,actions};
  return {allowed:true,reason:'',cost,actions};
}
export function createWorld(){
  return {state:{...INITIAL},placed:{city:0,forest:0,energy:0,volcano:0},
    queue:[],history:[],living:{objects:[],dragon:null,nextId:1,recentRequests:[]}};
}
function advanceQueue(world,events){
  const due=world.queue.filter(item=>item.turn<=world.state.turn);
  world.queue=world.queue.filter(item=>item.turn>world.state.turn);
  for(const item of due){
    update(world.state,item.delta);
    events.push(record(world,'delayed',item.text,item.parentId,item.delta));
  }
}
function cascade(world,events,parentId){
  const s=world.state;
  if(s.power<10){
    const delta={population:-2,food:-6};update(s,delta);
    events.push(record(world,'shortage','Дефицит энергии: −2 жителя, −6 еды.',parentId,delta));
  }
  if(s.water<10){
    const delta={food:-6,eco:-4};update(s,delta);
    events.push(record(world,'drought','Засуха: −6 еды, −4 экологии.',parentId,delta));
  }
  if(s.eco<10){
    const delta={food:-4};update(s,delta);
    events.push(record(world,'pollution','Экологический кризис: −4 еды.',parentId,delta));
  }
  if(s.food<5&&s.population>0){
    const delta={population:-2};update(s,delta);
    events.push(record(world,'hunger','Голод: −2 жителя.',parentId,delta));
  }
}
function applyActions(world,actions,description,charge=0,position={x:0,z:0}){
  const next=copy(world),events=[];
  next.state.turn++;
  advanceQueue(next,events);
  if(charge)update(next.state,{budget:-charge});
  const actionEvent=record(next,'action',description,null);
  for(const key of actions){
    const delta=BUILD_EFFECTS[key]||EXTRA[key];
    update(next.state,delta);
    if(Object.hasOwn(next.placed,key)){
      next.placed[key]++;
      next.living.objects.push({id:'object-'+next.living.nextId++,kind:key,
        x:Math.max(-100000,Math.min(100000,Number(position?.x)||0)),
        z:Math.max(-100000,Math.min(100000,Number(position?.z)||0)),
        hp:100,dome:0});
    }
    events.push(record(next,'construction',ACTION_LABEL[key]+' изменил мир.',actionEvent.id,delta));
    if(key==='forest')next.queue.push({turn:next.state.turn+2,delta:{eco:4,food:3},text:'Подросший лес восстанавливает почву и питание.',parentId:actionEvent.id});
    if(key==='city')next.queue.push({turn:next.state.turn+2,delta:{water:-3,power:-3},text:'Разросшемуся городу снова требуются вода и энергия.',parentId:actionEvent.id});
    if(key==='volcano')next.queue.push({turn:next.state.turn+1,delta:{eco:-4},text:'Пепел вулкана ухудшил состояние воздуха.',parentId:actionEvent.id});
  }
  cascade(next,events,actionEvent.id);
  return {world:next,events,actions};
}
export function playBuild(world,key,{position}={}){
  if(!Object.hasOwn(BUILD_EFFECTS,key))throw Error('Unknown build action');
  return applyActions(world,[key],'Построено: '+ACTION_LABEL[key],0,position);
}
const CRISIS_ORDER=['power','water','food','eco'];
const CRISIS_LABEL={power:'энергии',water:'воды',food:'еды',eco:'экологии'};
const GENIE_OPTIONS={
  power:[
    {label:'⚡ Сжечь лес ради энергии: экология и вода пострадают',delta:{power:18,eco:-18,water:-6},role:'worsens'},
    {label:'🏭 Быстрый запуск энергетики: больше энергии ценой экологии',delta:{power:23,eco:-15,food:-7},role:'worsens'},
    {label:'🚚 Импортировать электроэнергию за счёт бюджета и воды',delta:{power:16,budget:-18,water:-7},role:'shifts'},
    {label:'🌱 Поэтапное обновление сети с экономией ресурсов',delta:{power:11,eco:5,budget:-9},role:'balanced'}
  ],
  water:[
    {label:'🚰 Срочная добыча воды: меньше экологии, выше нагрузка',delta:{water:23,eco:-15,power:-4},role:'worsens'},
    {label:'🏗️ Перекрыть реку ради воды: вред соседним лесам',delta:{water:20,eco:-13,food:-5},role:'worsens'},
    {label:'🚚 Импорт воды за счёт бюджета и энергии',delta:{water:15,budget:-17,power:-8},role:'shifts'},
    {label:'🌧️ Водосбор и постепенное восстановление реки',delta:{water:11,eco:7,budget:-9},role:'balanced'}
  ],
  food:[
    {label:'🚜 Ускорить производство еды за счёт воды и почвы',delta:{food:22,water:-13,eco:-11},role:'worsens'},
    {label:'🏭 Интенсивная ферма: еды больше, загрязнение растёт',delta:{food:18,eco:-15,power:-5},role:'worsens'},
    {label:'🚛 Импорт еды, оплаченный из общего бюджета',delta:{food:16,budget:-19,water:-3},role:'shifts'},
    {label:'🌿 Смешанные фермы с бережным поливом',delta:{food:11,eco:5,water:-3,budget:-7},role:'balanced'}
  ],
  eco:[
    {label:'🌳 Быстрое озеленение: экология растёт, вода убывает',delta:{eco:23,water:-17,power:-5},role:'worsens'},
    {label:'🏭 Агрессивная очистка: экология ценой энергии и еды',delta:{eco:19,power:-16,food:-8},role:'worsens'},
    {label:'🚚 Перенести загрязнение из города в соседний район',delta:{eco:15,budget:-17,water:-10},role:'shifts'},
    {label:'🌱 Постепенно восстановить почву и биоразнообразие',delta:{eco:11,food:5,budget:-9},role:'balanced'}
  ]
};
export function getGenieChoices(world){
  const crisis=CRISIS_ORDER.reduce((chosen,key)=>
    world.state[key]<world.state[chosen]?key:chosen,CRISIS_ORDER[0]);
  const choices=GENIE_OPTIONS[crisis].map((option,index)=>({...option,target:crisis,id:index,delta:{...option.delta}}));
  return {title:'Злой Джинн: нехватка '+CRISIS_LABEL[crisis],crisis,choices};
}
export function getDecisionOptions(world){return getGenieChoices(world).choices;}
export function playDecision(world,index){
  if(!Number.isInteger(index)||index<0||index>3)throw Error('Unknown decision');
  const choice=getDecisionOptions(world)[index];
  const next=copy(world),events=[];
  next.state.turn++;
  advanceQueue(next,events);
  const event=record(next,'decision',choice.label,null,choice.delta);
  events.push(event);
  update(next.state,choice.delta);
  cascade(next,events,event.id);
  return {world:next,events,actions:[]};
}
export function interpretIdea(input){
  const text=sanitizeIdea(input);
  if(!text||text.length>800)return {actions:[],reason:'Напиши идею длиной от 1 до 800 символов.'};
  const actions=parseIdeaActions(text);
  return {actions,reason:actions.length?'':'Пока не могу рассчитать именно эту идею. Попробуй указать лес, город, энергию, вулкан, ферму, насос или очистку воды.'};
}
export function playIdea(world,input){
  const parsed=interpretIdea(input);
  if(!parsed.actions.length)return {world,events:[],actions:[],reason:parsed.reason,recognized:false};
  const quote=quoteIdea(world,input);
  if(!quote.allowed)return {world,events:[],actions:parsed.actions,reason:quote.reason,recognized:false};
  return {...applyActions(world,parsed.actions,'Идея: '+String(input).trim().slice(0,180),6),recognized:true,reason:''};
}
export function playCustomDecision(world,input){
  const parsed=interpretIdea(input);
  if(!parsed.actions.length)return {world,events:[],actions:[],reason:parsed.reason,recognized:false};
  const quote=quoteIdea(world,input);
  if(!quote.allowed)return {world,events:[],actions:parsed.actions,reason:quote.reason,recognized:false};
  const result=applyActions(world,parsed.actions,'Своё решение: '+String(input).trim().slice(0,120),6);
  const event=result.world.history.find(e=>e.type==='action'&&e.tick===result.world.state.turn);
  if(event){event.type='decision';result.events.unshift(event);}
  return {...result,recognized:true,reason:''};
}
const FEATURE_COST=Object.freeze({
  dome:9,'summon-dragon':0,archers:0,negotiate:12,evacuate:2,repair:10,
  'expand-city':12,wildlife:4,'expand-forest':10,'guide-lava':3,
  'connect-grid':7,battery:6,'reinforce-dome':8,
  geothermal:12,island:10,'expand-grid':12,'stabilize-grid':8
});
export function quoteFeature(world,id,targetId){
  if(!Object.hasOwn(FEATURE_COST,id))return {allowed:false,cost:0,reason:'Неизвестное действие'};
  const cost=FEATURE_COST[id],objects=world.living?.objects||[];
  const city=objects.find(o=>o.id===targetId&&o.kind==='city');
  const target=objects.find(o=>o.id===targetId);
  const dragon=world.living?.dragon,active=dragon?.hp>0;
  let reason='';
  if(['dome','summon-dragon','archers','negotiate','evacuate','repair',
    'expand-city','reinforce-dome'].includes(id)&&!city)reason='Выбери город.';
  else if(id==='dome'&&city.dome)reason='Купол уже создан.';
  else if(id==='summon-dragon'&&(!city.dome||active))reason='Нужен купол и отсутствие дракона.';
  else if(['archers','negotiate','evacuate'].includes(id)&&
    (!active||Math.hypot(dragon.x-city.x,dragon.z-city.z)>60))
    reason='Поблизости нет дракона.';
  else if(id==='evacuate'&&city.evacuated)reason='Жители уже укрыты.';
  else if(id==='repair'&&city.hp>=100)reason='Город не повреждён.';
  else if(id==='reinforce-dome'&&(!city.dome||city.dome>=100))reason='Купол не требует усиления.';
  else if(id==='wildlife'&&(!target||target.kind!=='forest'||target.wildlife))reason='Нужен лес без животных.';
  else if(id==='expand-forest'&&target?.kind!=='forest')reason='Выбери лес.';
  else if(id==='guide-lava'&&(!target||target.kind!=='volcano'||target.lavaGuided))reason='Нужен вулкан с ненаправленной лавой.';
  else if(id==='geothermal'&&(!target||target.kind!=='volcano'||
    !target.lavaGuided||target.geothermal))reason='Сначала направь лаву вулкана.';
  else if(id==='island'&&(!target||target.kind!=='volcano'||!target.geothermal||
    target.island))reason='Нужен геотермальный вулкан без нового острова.';
  else if(['connect-grid','battery','expand-grid','stabilize-grid'].includes(id)&&
    target?.kind!=='energy')reason='Нужна электростанция.';
  else if(id==='battery'&&target.battery)reason='Накопитель уже создан.';
  else if(id==='expand-grid'&&(!target.battery||target.gridExpanded))
    reason='Сначала построй накопитель.';
  else if(id==='stabilize-grid'&&(!target.gridExpanded||target.gridStable))
    reason='Сначала расширь сеть.';
  else if(id==='connect-grid'&&!objects.some(o=>o.kind==='city'&&!o.gridConnected))
    reason='Все города уже подключены.';
  else if(world.state.budget<cost)reason='Недостаточно бюджета: нужно '+cost+'.';
  return {allowed:!reason,reason,cost};
}
export function playFeature(world,id,targetId,{requestId}={}){
  if(requestId!==undefined&&!/^[a-zA-Z0-9_-]{1,90}$/.test(requestId))
    throw Error('Некорректный идентификатор запроса');
  if(requestId&&world.living?.recentRequests.includes(requestId))
    return {world,events:[],actions:[],duplicate:true};
  const quote=quoteFeature(world,id,targetId);
  if(!quote.allowed)throw Error(quote.reason);
  if(id==='expand-city'||id==='expand-forest'){
    const target=world.living.objects.find(o=>o.id===targetId);
    const result=playBuild(world,id==='expand-city'?'city':'forest',
      {position:{x:target.x+8,z:target.z+8}});
    if(requestId)result.world.living.recentRequests.push(requestId);
    return result;
  }
  const next=copy(world),events=[];next.state.turn++;advanceQueue(next,events);
  const target=next.living.objects.find(o=>o.id===targetId);
  const dragon=next.living.dragon;
  if(quote.cost)update(next.state,{budget:-quote.cost});
  const action=record(next,'action',id+' → '+(target?.id||'мир'),null);
  const mark=(type,text,delta={})=>{
    if(Object.keys(delta).length)update(next.state,delta);
    events.push(record(next,type,text,action.id,delta));
  };
  if(id==='dome'){target.dome=50;mark('construction','Над городом возник прозрачный защитный купол.');}
  if(id==='reinforce-dome'){target.dome=Math.min(100,target.dome+35);
    mark('construction','Защитный купол укреплён.');}
  if(id==='summon-dragon'){
    next.living.dragon={id:'dragon-'+next.living.nextId++,x:target.x+6,z:target.z-7,
      hp:100,status:'approaching'};
    mark('creature','К городу приближается дракон.');
  }
  if(id==='archers'){
    const damage=target.dome?65:42;dragon.hp=Math.max(0,dragon.hp-damage);
    mark('combat','Лучники ранили дракона: '+damage+' урона.');
    if(!dragon.hp){dragon.status='defeated';mark('combat','Дракон отступил, город защищён.',{population:2});}
    else {
      dragon.status='attacking';
      const blocked=Math.min(target.dome,40);target.dome-=blocked;
      const hit=blocked?12:42;
      target.hp=Math.max(0,target.hp-hit);
      mark('retaliation','Дракон атаковал город. Купол поглотил '+blocked+' урона.',
        {population:blocked?-1:-5,eco:-3,budget:-3});
    }
  }
  if(id==='negotiate'){dragon.hp=0;dragon.status='departed';
    mark('diplomacy','Дракон согласился покинуть город.');}
  if(id==='evacuate'){target.evacuated=true;mark('evacuation','Жители укрылись от дракона.',
    {population:-1});}
  if(id==='repair'){target.hp=Math.min(100,target.hp+50);mark('construction','Город восстановлен.');}
  if(id==='wildlife'){target.wildlife=true;mark('ecology','В лес вернулись животные.',{food:6,eco:4});}
  if(id==='guide-lava'){target.lavaGuided=true;mark('construction','Лава направлена в безопасное русло.',{eco:4});}
  if(id==='geothermal'){target.geothermal=true;
    mark('construction','У вулкана заработала геотермальная станция.',{power:24,water:-2,eco:-3});}
  if(id==='island'){target.island=true;
    mark('construction','Лава образовала новый остров.',{eco:-4,water:-3});}
  if(id==='connect-grid'){const city=next.living.objects.find(o=>o.kind==='city'&&!o.gridConnected);
    city.gridConnected=true;target.gridBuilt=true;
    mark('construction','Город подключён к электросети.',{power:15});}
  if(id==='battery'){target.battery=true;mark('construction','Построен накопитель энергии.',{power:10});}
  if(id==='expand-grid'){target.gridExpanded=true;
    mark('construction','Энергосеть расширена.',{power:18,water:-4});}
  if(id==='stabilize-grid'){target.gridStable=true;
    mark('construction','Энергосеть стабилизирована.',{power:6,eco:5});}
  cascade(next,events,action.id);
  if(requestId){next.living.recentRequests.push(requestId);
    next.living.recentRequests=next.living.recentRequests.slice(-32);}
  return {world:next,events,actions:[id]};
}
export function serializeWorld(world){return JSON.stringify({version:VERSION,...world});}
export function restoreWorld(raw){
  try{
    const data=JSON.parse(raw);
    if(data.version!==VERSION||!data.state||!data.placed||!Array.isArray(data.queue)||!Array.isArray(data.history))return null;
    if(Object.keys(INITIAL).some(k=>!Number.isInteger(data.state[k])||data.state[k]<0||data.state[k]>(k==='turn'?100000:100)))return null;
    if(Object.keys(createWorld().placed).some(k=>!Number.isInteger(data.placed[k])||data.placed[k]<0||data.placed[k]>10000))return null;
    if(data.queue.length>400||data.history.length>150||data.queue.some(e=>!Number.isInteger(e.turn)||e.turn<0||e.turn>100000||
      !e.delta||Object.entries(e.delta).some(([k,v])=>!Object.hasOwn(INITIAL,k)||k==='turn'||!Number.isFinite(v))))return null;
    if(data.living){
      const l=data.living;
      if(!Array.isArray(l.objects)||l.objects.length>1000||
        !Number.isSafeInteger(l.nextId)||l.nextId<1||
        !Array.isArray(l.recentRequests)||l.recentRequests.length>32||
        l.recentRequests.some(id=>typeof id!=='string'||id.length>90)||
        l.objects.some(o=>!o||typeof o.id!=='string'||!Object.hasOwn(data.placed,o.kind)||
          !Number.isFinite(o.x)||!Number.isFinite(o.z)||!Number.isInteger(o.hp)||
          o.hp<0||o.hp>100||!Number.isInteger(o.dome)||o.dome<0||o.dome>100)||
        (l.dragon&&(!Number.isInteger(l.dragon.hp)||l.dragon.hp<0||
          l.dragon.hp>100||typeof l.dragon.id!=='string')))return null;
    }
    return copy(data);
  }catch{return null;}
}
export function advanceTick(world){
  const next=copy(world),events=[];
  next.state.turn++;
  advanceQueue(next,events);
  const economy={budget:next.state.population>0?2:0};
  update(next.state,economy);
  events.push(record(next,'economy','Налоговые поступления пополнили бюджет.',null,economy));
  cascade(next,events,null);
  events.push(record(next,'tick','Прошёл ход '+next.state.turn+'.',null));
  return {world:next,events,actions:[]};
}
