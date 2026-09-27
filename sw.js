// Network-first HTML + cached same-origin assets. Scoped to this GitHub Pages project.
const VERSION='chain-reaction-v3-module-bundle-20260927';
const CORE=['./','./index.html',
  './cinematic/','./cinematic/index.html','./manifest.webmanifest',
  './cinematic/main.mjs','./cinematic/ui.mjs',
  './cinematic/walkers.mjs','./cinematic/render-ui.mjs',
  './cinematic/idea-parser.mjs','./cinematic/style.css',
  './cinematic/chain-engine.mjs','./cinematic/quality.mjs',
  './cinematic/render-effects.mjs','./cinematic/ambient-audio.mjs',
  './cinematic/enhancements.mjs','./app-icon-192.png',
  './cinematic/assets/world_portrait.webp','./cinematic/assets/world_landscape.webp',
  './cinematic/assets/world_developed_portrait.webp','./cinematic/assets/world_developed_landscape.webp',
  './cinematic/assets/genie.webp','./cinematic/assets/city.webp',
  './cinematic/assets/forest.webp','./cinematic/assets/energy.webp',
  './cinematic/assets/volcano.webp','./cinematic/assets/card_city.webp',
  './cinematic/assets/card_forest.webp','./cinematic/assets/card_energy.webp',
  './cinematic/assets/card_volcano.webp','./cinematic/assets/card_idea.webp'
];
const scope=new URL('./',self.location.href);
const local=url=>url.origin===scope.origin&&url.pathname.startsWith(scope.pathname);
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(VERSION);
    const saved=await Promise.allSettled(CORE.map(path=>cache.add(new URL(path,scope).href)));
    if(saved.some(item=>item.status==='rejected'))console.warn('Some offline resources could not be cached');
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    for(const key of await caches.keys())if(key.startsWith('chain-reaction-')&&key!==VERSION)await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||!local(url))return;
  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      try{const response=await fetch(request);
        if(response.ok){const cache=await caches.open(VERSION);cache.put(request,response.clone()).catch(()=>{});}
        return response;
      }catch{return await caches.match(request)||await caches.match(new URL('./cinematic/',scope).href)||Response.error();}
    })());return;
  }
  event.respondWith((async()=>{
    const saved=await caches.match(request);
    if(saved)return saved;
    const response=await fetch(request);
    if(response.ok&&url.origin===scope.origin){
      const cache=await caches.open(VERSION);cache.put(request,response.clone()).catch(()=>{});
    }
    return response;
  })());
});
