import { BUILD_KINDS, CONFIG, GameState } from './game-state.mjs';
import { parseIdea, sanitizeIdea } from './idea-parser.mjs';

export const EFFECTS = Object.freeze({
  city: { population:11, power:-9, water:-8, food:-5, eco:-5, budget:-12 },
  forest: { eco:18, water:12, food:9, budget:-10 },
  energy: { power:32, eco:-8, water:-5, budget:-16 },
  volcano: { power:21, eco:-20, population:-3, water:-7, budget:-9 },
});
export const MESSAGES = Object.freeze({
  city: ['Город построен!','Жители получили дома, но теперь им нужны вода, пища и энергия.'],
  forest: ['Мир меняется!','Лес вырос! Экология и запасы воды постепенно восстанавливаются.'],
  energy: ['Мир меняется!','Электростанция заработала! Энергии стало больше, но бюджет и вода уменьшаются.'],
  volcano: ['Осторожно!','Вулкан проснулся! Появилась геотермальная энергия — и опасная лава.'],
});
export const DECISIONS = Object.freeze([
  { effect:{ power:13, eco:-19, water:-6 }, message:'Джинн смеётся: энергии прибавилось, но лес выжжен.' },
  { effect:{ power:19, eco:-15, food:-7 }, message:'Мегазавод запущен: грязный воздух и угроза урожаю.' },
  { effect:{ power:9, budget:-18, water:-4 }, message:'Импорт помог пережить кризис, но бюджет истощается.' },
  { effect:{ power:8, eco:8, budget:-10 }, message:'Компромисс: модернизация и восстановление природы.' },
]);

export function applyCrisis(gameState) {
  const values=gameState.values, events=[];
  if (values.power<CONFIG.CRISIS_THRESHOLD) {
    gameState.applyEffect({population:-2,food:-6});
    events.push('Дефицит энергии: −2 жителя, −6 еды.');
  }
  if (values.water<CONFIG.CRISIS_THRESHOLD) {
    gameState.applyEffect({food:-6,eco:-4});
    events.push('Засуха: −6 еды, −4 экологии.');
  }
  if (values.eco<CONFIG.CRISIS_THRESHOLD) {
    gameState.applyEffect({food:-4});
    events.push('Экологический кризис: −4 еды.');
  }
  return events;
}

export class GameEngine {
  constructor(snapshot) { this.state=new GameState(snapshot); this.history=[]; }
  getState() { return {...this.state.values}; }
  getPlaced() { return {...this.state.placed}; }
  snapshot() { return this.state.snapshot(); }
  reset() { this.state.reset(); this.history=[]; }
  checkpoint() {
    this.history.push(this.snapshot());
    if (this.history.length>20) this.history.shift();
  }
  build(kind,{fromIdea=false,checkpoint=true}={}) {
    if (!BUILD_KINDS.includes(kind)) return null;
    if (checkpoint) this.checkpoint();
    this.state.placed[kind]+=1;
    this.state.applyEffect(EFFECTS[kind]);
    this.state.values.turn+=1;
    const crises=applyCrisis(this.state);
    this.state.pendingDecision=true;
    this.state.record('Ход '+this.state.values.turn+': '+kind);
    return {
      kind,title:MESSAGES[kind][0],
      body:[MESSAGES[kind][1],...crises].join(' '),fromIdea,crises,
    };
  }
  decide(index) {
    if (!Number.isInteger(index) || index<0 || index>=DECISIONS.length ||
      !this.state.pendingDecision) return null;
    this.checkpoint();
    const chosen=DECISIONS[index];
    this.state.applyEffect(chosen.effect);
    this.state.pendingDecision=false;
    this.state.record('Решение Джинна: '+(index+1));
    return {title:'Последствия выбора',body:chosen.message};
  }
  submitIdea(input) {
    const idea=sanitizeIdea(input);
    if (!idea) return null;
    this.checkpoint();
    const found=parseIdea(idea);
    this.state.applyEffect({budget:-CONFIG.IDEA_COST});
    this.state.record('Идея: '+idea);
    if (found.length) {
      const changes=found.map(kind=>this.build(kind,{fromIdea:true,checkpoint:false}));
      return {
        title:'Джинн услышал идею!',
        body:'Ты предложил: '+idea+'. Я вижу '+found.length+
          ' новых направлений. Следи за ресурсами!',found,changes,
      };
    }
    this.state.applyEffect({eco:3});
    return {
      title:'Джинн услышал идею!',
      body:'Твоя идея записана: '+idea+
        '. Жители начали исследование. Пока бюджет −6, экология +3.',
      found,changes:[],
    };
  }
  undo() {
    const previous=this.history.pop();
    return previous ? this.state.restore(previous) : false;
  }
}
