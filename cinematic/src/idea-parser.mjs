// Офлайн-словарь с весами; не притворяется подключённым ИИ.
const KEYWORDS = Object.freeze({
  forest: { лес:3, дерев:2, растен:2, парк:2, зелен:1, сад:1 },
  city: { город:3, дом:2, здан:2, поселен:2, жил:1, инфраструктур:2 },
  energy: { энерг:3, солн:2, электр:3, ветр:2, генерац:2, батаре:2 },
  volcano: { вулкан:3, лав:3, геотерм:3, магм:2, извержен:2 },
});
const NEGATIONS = new Set([
  'не','без','никаких','никакого','никакой','избежать',
  'убрать','снести','отменить','запретить','против',
]);
const RESTART = new Set(['а','но','зато','однако','вместо']);
const POSITIVE_VERBS = ['постро','созда','добав','посад','возвед','установ','разв','запуст','постав','организ'];

export function sanitizeIdea(input) {
  if (typeof input!=='string') return '';
  // Контент безопасно вставляется через textContent: сохраняем < и >.
  return input.normalize('NFKC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\u202A-\u202E\u2066-\u2069]/g,'')
    .trim().slice(0,800);
}
export function scoreIdea(input) {
  const clauses=sanitizeIdea(input).toLocaleLowerCase('ru-RU').split(/[.,;!?…\n]+/);
  const scores=Object.fromEntries(Object.keys(KEYWORDS).map(kind=>[kind,0]));
  for (const clause of clauses) {
    const tokens=clause.match(/[\p{L}\p{N}]+/gu)||[];
    let excluded=false;
    for (let i=0;i<tokens.length;i++) {
      const word=tokens[i];
      if (RESTART.has(word) && word!=='вместо') { excluded=false;continue; }
      if (NEGATIONS.has(word) || word==='вместо') {
        if (word==='не' && tokens[i+1]==='только') { i++;continue; }
        excluded=true;continue;
      }
      if (excluded && POSITIVE_VERBS.some(stem=>word.startsWith(stem)) &&
        tokens[i-1]!=='не') excluded=false;
      if (excluded) continue;
      for (const [kind,terms] of Object.entries(KEYWORDS)) {
        const match=Object.entries(terms).find(([stem])=>word.startsWith(stem));
        if (match) scores[kind]+=match[1];
      }
    }
  }
  return scores;
}
export function parseIdea(input) {
  const scores=scoreIdea(input);
  return Object.keys(KEYWORDS).filter(kind=>scores[kind]>0);
}
