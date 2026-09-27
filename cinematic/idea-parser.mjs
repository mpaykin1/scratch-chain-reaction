// Conservative weighted offline classifier. No arbitrary text execution or cloud inference.
export const KEYWORDS=Object.freeze({
  irrigation:{орошени:3,полив:2,канал:2,водопровод:3,насос:2,скважин:3,irrigat:3},
  recycling:{переработ:3,очистк:3,фильтр:2,recycl:3},
  farm:{ферм:3,урожай:2,сельск:2,теплиц:3,farm:3},
  forest:{лес:3,дерев:2,посадк:2,растени:2,парк:1,зелен:1,forest:3},
  city:{город:3,дом:2,здани:2,поселен:2,инфраструктур:2,city:3},
  energy:{энерг:3,солн:2,электр:3,ветр:2,турбин:2,батаре:2,energy:3,solar:3},
  volcano:{вулкан:3,лав:3,геотерм:3,магм:2,volcano:3},
});
const NEGATIONS=new Set(['не','нет','без','никаких','никакого','никакой',
  'избежать','убрать','снести','отменить','запретить','против','вместо']);
const RESTART=new Set(['но','а','зато','однако']);
const ACTION_VERBS=['постро','созда','добав','посад','установ','пролож','организ',
  'возвед','разв','запуст','сдела','постав'];
export function sanitizeIdea(value){
  if(typeof value!=='string')return '';
  return value.normalize('NFKC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\u202A-\u202E\u2066-\u2069]/g,'').trim();
}
export function scoreIdea(input){
  const scores=Object.fromEntries(Object.keys(KEYWORDS).map(key=>[key,0]));
  const clauses=sanitizeIdea(input).toLocaleLowerCase('ru-RU').split(/[,.!?;:\n…]+/);
  for(const clause of clauses){
    const words=clause.match(/[\p{L}\p{N}]+/gu)||[];
    let negated=false;
    for(let index=0;index<words.length;index++){
      const word=words[index];
      if(RESTART.has(word)){negated=false;continue;}
      if(NEGATIONS.has(word)){
        if(word==='не'&&words[index+1]==='только'){index++;continue;}
        negated=true;continue;
      }
      if(negated&&ACTION_VERBS.some(stem=>word.startsWith(stem))&&
        words[index-1]!=='не')negated=false;
      if(negated)continue;
      for(const [kind,terms]of Object.entries(KEYWORDS)){
        const hit=Object.entries(terms).find(([stem])=>word.startsWith(stem));
        if(hit)scores[kind]+=hit[1];
      }
    }
  }
  return scores;
}
export function parseIdeaActions(input){
  const scores=scoreIdea(input);
  return Object.keys(KEYWORDS).filter(kind=>scores[kind]>0);
}
