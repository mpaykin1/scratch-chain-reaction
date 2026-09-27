// Pure, deterministic simulation for the cinematic mode. No DOM, network, time or RNG.
export const VERSION = 2;
export const INITIAL = Object.freeze({
  turn: 0, population: 32, power: 8, water: 5, food: 8, eco: 5, budget: 50
});
export const MAX_PLACED = 3; // limit per buildable type
export const BUILD_EFFECTS = Object.freeze({
  city:    { population: 11, power: -9, water: -8, food: -5, eco: -5, budget: -12 },
  forest:  { eco: 18, water: 12, food: 9, budget: -10 },
  energy:  { power: 32, eco: -8, water: -5, budget: -16 },
  volcano: { power: 21, eco: -20, population: -3, water: -7, budget: -9 }
});
export const DECISIONS = Object.freeze([
  { power: 13, eco: -19, water: -6 },
  { power: 19, eco: -15, food: -7 },
  { power: 9, budget: -18, water: -4 },
  { power: 8, eco: 8, budget: -10 }
]);
export const DECISION_MESSAGES = [
  'Энергии прибавилось, но лес выжжен.',
  'Мегазавод запущен: загрязнение угрожает урожаю.',
  'Импорт помог пережить кризис, но бюджет истощается.',
  'Модернизация и восстановление природы требуют вложений.'
];

const EXTRA = Object.freeze({
  irrigation: { water: 14, food: 7, power: -3, budget: -9 },
  recycling:  { eco: 11, water: 4, budget: -8 },
  farm:       { food: 16, water: -5, budget: -9 }
});

// Weighted patterns — higher weight = stronger match priority
const KEYWORDS = [
  { name: 'irrigation', re: /орошени|полив|канал|водопровод|насос|скважин|irrigat/i, weight: 2 },
  { name: 'recycling',  re: /переработ|очистк|фильтр|recycl/i, weight: 2 },
  { name: 'farm',       re: /ферм|урожай|сельск|теплиц|farm/i, weight: 2 },
  { name: 'forest',     re: /лес|дерев|посадк|растени|парк|forest/i, weight: 1 },
  { name: 'city',       re: /город|дом|здани|поселен|city/i, weight: 1 },
  { name: 'energy',     re: /энерг|солн|электр|ветр|турбин|energy|solar|атом/i, weight: 1 },
  { name: 'volcano',    re: /вулкан|лав|геотерм|volcano/i, weight: 1 }
];

// Combo patterns for smarter free-text ideas
const COMBOS = [
  { re: /солнечн.*город|эко.?город|зелён.*город/i, actions: ['city', 'energy', 'forest'], weight: 3 },
  { re: /геотерм.*энерг|энерг.*вулкан/i, actions: ['volcano', 'energy'], weight: 3 },
  { re: /ферм.*лес|лес.*ферм|агролес/i, actions: ['farm', 'forest'], weight: 2 }
];

const ACTION_LABEL = {
  city: 'Город', forest: 'Лес', energy: 'Энергия', volcano: 'Вулкан',
  irrigation: 'Орошение', recycling: 'Очистка воды', farm: 'Фермы'
};

const clamp = value => Math.max(0, Math.min(100, Math.round(value)));

const copy = world => ({
  state: { ...world.state },
  placed: { ...world.placed },
  queue: world.queue.map(item => ({ ...item, delta: { ...item.delta } })),
  history: world.history.map(item => ({ ...item })),
  ended: world.ended || null
});

const update = (stats, delta) => {
  for (const [key, value] of Object.entries(delta)) {
    if (!Object.hasOwn(INITIAL, key) || key === 'turn' || !Number.isFinite(value)) {
      throw Error('Invalid resource delta: ' + key);
    }
    stats[key] = clamp(stats[key] + value);
  }
};

const record = (world, type, text, parentId, delta = {}) => {
  const event = {
    id: world.history.length ? world.history.at(-1).id + 1 : 1,
    tick: world.state.turn,
    type, text, parentId, delta
  };
  world.history.push(event);
  if (world.history.length > 150) world.history.shift();
  return event;
};

export function createWorld() {
  return {
    state: { ...INITIAL },
    placed: { city: 0, forest: 0, energy: 0, volcano: 0 },
    queue: [],
    history: [],
    ended: null
  };
}

/** Can this action still be built? */
export function canBuild(world, key) {
  if (!Object.hasOwn(BUILD_EFFECTS, key) && !Object.hasOwn(EXTRA, key)) return false;
  if (world.ended) return false;
  if (Object.hasOwn(world.placed, key) && world.placed[key] >= MAX_PLACED) return false;
  if (world.state.budget < 5) return false;
  return true;
}

function advanceQueue(world, events) {
  const due = world.queue.filter(item => item.turn <= world.state.turn);
  world.queue = world.queue.filter(item => item.turn > world.state.turn);
  for (const item of due) {
    update(world.state, item.delta);
    events.push(record(world, 'delayed', item.text, item.parentId, item.delta));
  }
}

/** Multi-pass cascade: each rule fires at most once per turn, but can unlock others */
function cascade(world, events, parentId) {
  const fired = new Set();
  let safety = 8;
  let changed = true;
  while (changed && safety-- > 0) {
    changed = false;
    const s = world.state;
    const checks = [
      {
        id: 'shortage',
        when: () => s.power < 10,
        delta: { population: -2, food: -6 },
        type: 'shortage',
        text: 'Дефицит энергии: −2 жителя, −6 еды.'
      },
      {
        id: 'drought',
        when: () => s.water < 10,
        delta: { food: -6, eco: -4 },
        type: 'drought',
        text: 'Засуха: −6 еды, −4 экологии.'
      },
      {
        id: 'pollution',
        when: () => s.eco < 10,
        delta: { food: -4 },
        type: 'pollution',
        text: 'Экологический кризис: −4 еды.'
      },
      {
        id: 'famine',
        when: () => s.food < 5 && s.population > 0,
        delta: { population: -3 },
        type: 'famine',
        text: 'Голод: население сокращается (−3).'
      }
    ];
    for (const rule of checks) {
      if (fired.has(rule.id)) continue;
      if (rule.when()) {
        const before = { ...s };
        update(s, rule.delta);
        if (Object.keys(rule.delta).some(k => before[k] !== s[k])) {
          events.push(record(world, rule.type, rule.text, parentId, rule.delta));
          fired.add(rule.id);
          changed = true;
        }
      }
    }
  }
}

/** Passive income from existing buildings / population */
function passiveIncome(world, events, parentId) {
  const s = world.state;
  const p = world.placed;
  const delta = {};
  if (p.forest > 0) {
    delta.eco = (delta.eco || 0) + Math.min(3, p.forest);
    delta.water = (delta.water || 0) + Math.min(2, p.forest);
  }
  if (p.energy > 0 && s.power > 15) {
    delta.budget = (delta.budget || 0) + 2;
  }
  if (s.population >= 40) {
    delta.budget = (delta.budget || 0) + 1;
  }
  if (Object.keys(delta).length) {
    update(s, delta);
    events.push(record(world, 'passive', 'Пассивный доход от инфраструктуры.', parentId, delta));
  }
}

/** Check win / lose conditions */
export function checkEnd(world) {
  const s = world.state;
  if (s.population <= 0) {
    return { type: 'lose', title: 'Мир опустел', text: 'Население исчезло. Цепная реакция завершилась катастрофой.' };
  }
  if (s.eco >= 80 && s.population >= 55 && s.power >= 20 && s.water >= 20 && s.food >= 20) {
    return { type: 'win', title: 'Гармония достигнута', text: 'Ты научился управлять сложным миром. Экология, ресурсы и люди в балансе.' };
  }
  if (s.turn >= 25 && s.population < 15) {
    return { type: 'lose', title: 'Медленный упадок', text: 'Мир продержался долго, но население так и не восстановилось.' };
  }
  return null;
}

function applyActions(world, actions, description, charge = 0) {
  if (world.ended) {
    return { world: copy(world), events: [], actions: [], blocked: true, reason: 'Игра уже завершена.' };
  }

  // Filter actions that exceed build limits
  const allowed = [];
  const blocked = [];
  for (const key of actions) {
    if (Object.hasOwn(world.placed, key) && world.placed[key] >= MAX_PLACED) {
      blocked.push(key);
    } else {
      allowed.push(key);
    }
  }
  if (!allowed.length && blocked.length) {
    return {
      world: copy(world),
      events: [],
      actions: [],
      blocked: true,
      reason: 'Лимит построек достигнут (макс. ' + MAX_PLACED + ' каждого типа).'
    };
  }

  const next = copy(world);
  const events = [];
  next.state.turn++;
  advanceQueue(next, events);
  if (charge) update(next.state, { budget: -charge });

  const actionEvent = record(next, 'action', description, null);

  for (const key of allowed) {
    const delta = BUILD_EFFECTS[key] || EXTRA[key];
    if (!delta) continue;
    update(next.state, delta);
    if (Object.hasOwn(next.placed, key)) next.placed[key]++;
    events.push(record(next, 'construction', ACTION_LABEL[key] + ' изменил мир.', actionEvent.id, delta));

    // Delayed chain effects
    if (key === 'forest') {
      next.queue.push({
        turn: next.state.turn + 2,
        delta: { eco: 4, food: 3 },
        text: 'Подросший лес восстанавливает почву и питание.',
        parentId: actionEvent.id
      });
    }
    if (key === 'city') {
      next.queue.push({
        turn: next.state.turn + 2,
        delta: { water: -3, power: -3 },
        text: 'Разросшемуся городу снова требуются вода и энергия.',
        parentId: actionEvent.id
      });
    }
    if (key === 'volcano') {
      next.queue.push({
        turn: next.state.turn + 1,
        delta: { eco: -4 },
        text: 'Пепел вулкана ухудшил состояние воздуха.',
        parentId: actionEvent.id
      });
    }
    if (key === 'energy') {
      next.queue.push({
        turn: next.state.turn + 3,
        delta: { eco: -3, water: -2 },
        text: 'Долгосрочный след энергетики: нагрузка на экологию и воду.',
        parentId: actionEvent.id
      });
    }
  }

  passiveIncome(next, events, actionEvent.id);
  cascade(next, events, actionEvent.id);

  // End-game check
  const ending = checkEnd(next);
  if (ending) {
    next.ended = ending;
    events.push(record(next, ending.type, ending.text, actionEvent.id));
  }

  return { world: next, events, actions: allowed, blocked: blocked.length > 0 };
}

export function playBuild(world, key) {
  if (!Object.hasOwn(BUILD_EFFECTS, key)) throw Error('Unknown build action');
  if (!canBuild(world, key)) {
    return {
      world: copy(world),
      events: [],
      actions: [],
      blocked: true,
      reason: world.ended
        ? 'Игра уже завершена.'
        : world.placed[key] >= MAX_PLACED
          ? `Лимит «${ACTION_LABEL[key]}» достигнут (макс. ${MAX_PLACED}).`
          : 'Недостаточно бюджета.'
    };
  }
  return applyActions(world, [key], 'Построено: ' + ACTION_LABEL[key]);
}

export function playDecision(world, index) {
  if (!Number.isInteger(index) || index < 0 || index >= DECISIONS.length) {
    throw Error('Unknown decision');
  }
  if (world.ended) {
    return { world: copy(world), events: [], actions: [], blocked: true, reason: 'Игра уже завершена.' };
  }
  const next = copy(world);
  const event = record(next, 'decision', DECISION_MESSAGES[index], null, DECISIONS[index]);
  update(next.state, DECISIONS[index]);
  cascade(next, [event], event.id);
  const ending = checkEnd(next);
  if (ending) {
    next.ended = ending;
    next.history.push(record(next, ending.type, ending.text, event.id));
  }
  return { world: next, events: [event], actions: [] };
}

export function interpretIdea(input) {
  const text = typeof input === 'string' ? input.trim() : '';
  if (!text || text.length > 800) {
    return { actions: [], reason: 'Напиши идею длиной от 1 до 800 символов.' };
  }

  // Explicit negation is ambiguous without full language understanding
  const negated = /(?:^|[^\p{L}])не\s+(?:надо\s+|хочу\s+|нужно\s+)?(?:строить|создавать|сажать|делать)(?=$|[^\p{L}])/iu.test(text);
  if (negated) {
    return { actions: [], reason: 'Я пока не умею надёжно разбирать отрицания. Сформулируй, что именно построить.' };
  }

  // Check combo patterns first
  for (const combo of COMBOS) {
    if (combo.re.test(text)) {
      return { actions: combo.actions.slice(0, 4), reason: '' };
    }
  }

  // Weighted keyword match
  const scores = new Map();
  for (const { name, re, weight } of KEYWORDS) {
    if (re.test(text)) {
      scores.set(name, (scores.get(name) || 0) + weight);
    }
  }

  const actions = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
    .slice(0, 4);

  return {
    actions,
    reason: actions.length
      ? ''
      : 'Пока не могу рассчитать именно эту идею. Попробуй указать лес, город, энергию, вулкан, ферму, насос или очистку воды.'
  };
}

export function playIdea(world, input) {
  const parsed = interpretIdea(input);
  if (!parsed.actions.length) {
    return { world, events: [], actions: [], reason: parsed.reason, recognized: false };
  }
  const result = applyActions(world, parsed.actions, 'Идея: ' + input.trim().slice(0, 180), 6);
  return { ...result, recognized: true, reason: result.reason || '' };
}

export function serializeWorld(world) {
  return JSON.stringify({ version: VERSION, ...world });
}

export function restoreWorld(raw) {
  try {
    const data = JSON.parse(raw);
    // Accept both v1 and v2 saves
    if ((data.version !== 1 && data.version !== VERSION) || !data.state || !data.placed ||
        !Array.isArray(data.queue) || !Array.isArray(data.history)) {
      return null;
    }
    if (Object.keys(INITIAL).some(k =>
      !Number.isInteger(data.state[k]) || data.state[k] < 0 || data.state[k] > (k === 'turn' ? 100000 : 100)
    )) return null;
    if (Object.keys(createWorld().placed).some(k =>
      !Number.isInteger(data.placed[k]) || data.placed[k] < 0 || data.placed[k] > 10000
    )) return null;
    if (data.queue.length > 400 || data.history.length > 150 || data.queue.some(e =>
      !Number.isInteger(e.turn) || e.turn < 0 || e.turn > 100000 ||
      !e.delta || Object.entries(e.delta).some(([k, v]) =>
        !Object.hasOwn(INITIAL, k) || k === 'turn' || !Number.isFinite(v)
      )
    )) return null;

    const world = copy(data);
    world.ended = data.ended || null;
    return world;
  } catch {
    return null;
  }
}
