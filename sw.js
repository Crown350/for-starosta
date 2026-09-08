const CACHE='starosta-v14';
const SHELL=['./','./index.html','./app.js?v=schedule-snapshot-1','./cloud.js','./local-copy.js','./dialogs.js','./config.js','./manifest.webmanifest','./icon-192.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('starosta-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(e.request.method!=='GET'||u.origin!==location.origin||u.pathname.includes('/api/'))return;
 e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(async()=>{
  const cached=await caches.match(e.request);if(cached)return cached;
  if(e.request.mode==='navigate')return caches.match('./index.html');
  return new Response('Offline',{status:503});
 }));
});
