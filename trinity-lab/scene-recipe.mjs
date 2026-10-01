export const TRINITY_RECIPE_VERSION='1.0.0';
export const TRINITY_SEED='trinity-lab-2026-10-01';
export const REQUIRED_SEMANTIC_IDS=Object.freeze([
  'terrain:ground','terrain:rocks','architecture:tower','architecture:bridge',
  'vegetation:tree','character:worker','light:lantern'
]);

export const TrinitySceneRecipe=Object.freeze({
  schemaVersion:TRINITY_RECIPE_VERSION,
  type:'TrinitySceneRecipe',
  id:'world-server-trinity-courtyard-v1',
  seed:TRINITY_SEED,
  terrain:{radius:7,relief:1.55,rocks:18,material:'stone-earth'},
  architecture:{
    tower:{id:'architecture:tower',position:[1.65,0,-.55],height:4.5,radius:1.28},
    bridge:{id:'architecture:bridge',position:[-2.55,.18,.35],span:3.4,width:1.1}
  },
  vegetation:{
    tree:{id:'vegetation:tree',position:[-4.1,0,-2.25],height:3.7,crown:1.25},
    count:4
  },  characters:[{
    id:'character:worker',kind:'worker',position:[.15,.02,2.3],
    animation:'walk_idle_cycle',height:1.72
  }],
  lights:[{
    id:'light:lantern',kind:'local',position:[-1.15,2.25,1.05],
    color:'#f1b56f',intensity:2.2,range:7.5
  }],
  water:null,
  events:[],
  evolution:{
    durationSeconds:12,
    stages:[
      ['cube',0,.16],['matter',.10,.34],['terrain',.22,.50],
      ['biome',.38,.66],['architecture',.50,.80],['materials',.64,.88],
      ['lighting',.70,.94],['life',.80,1],['final',.94,1]
    ],
    operations:['split','move','extrude','merge','settle','attach','transform','growth'],
    merge:'REAL'
  }
});

export function evolutionInputFromRecipe(recipe=TrinitySceneRecipe){
  return {
    seed:recipe.seed,
    terrain:{radius:recipe.terrain.radius,relief:recipe.terrain.relief},
    biome:{trees:recipe.vegetation.count,grass:78,rocks:recipe.terrain.rocks},
    architecture:{kind:'ARCH_TOWER',blocks:96},
    life:{walkers:recipe.characters.length,birds:2},
    timeline:recipe.evolution.stages
  };
}export function semanticManifest(recipe=TrinitySceneRecipe){
  return {
    recipeId:recipe.id,
    seed:recipe.seed,
    ids:[...REQUIRED_SEMANTIC_IDS],
    types:{
      'terrain:ground':'terrain','terrain:rocks':'rocks',
      'architecture:tower':'tower','architecture:bridge':'bridge',
      'vegetation:tree':'tree','character:worker':'character',
      'light:lantern':'light'
    }
  };
}

export function sameRecipeEvidence(a,b){
  return Boolean(a&&b&&a.id===b.id&&a.seed===b.seed&&a.schemaVersion===b.schemaVersion);
}
