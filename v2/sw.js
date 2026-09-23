const CACHE='starosta-new-v1';
const BASE=new URL('../',self.location.href);
const SHELL=["v2/","v2/index.html","schedule.json","data/curriculum.json","ui-mode.js","icon-180.png","config.js?v=proxy-1","api-transport.js?v=failover-2","local-copy.js","v2/manifest.webmanifest","v2/styles.css?v=ui11","config.js?v=ui11","api-transport.js?v=ui11","v2/app.js?v=ui11","v2/dialogs.js?v=ui11","v2/cloud.js?v=ui11"].map(path=>new URL(path,BASE).href);
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&(k.startsWith('starosta-new-'))).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(e.request.method!=='GET'||u.origin!==BASE.origin||!u.pathname.startsWith(BASE.pathname)||u.pathname.includes('/api/'))return;
 e.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  try{
   const response=await fetch(e.request);
   if(response.ok)await cache.put(e.request,response.clone());
   return response;
  }catch(_){
   const cached=await cache.match(e.request);if(cached)return cached;
   if(e.request.mode==='navigate'){
    const entry='v2/index.html';
    const page=await cache.match(new URL(entry,BASE).href);if(page)return page;
   }
   return new Response('Offline',{status:503});
  }
 })());
});
