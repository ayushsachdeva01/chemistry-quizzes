const CACHE='chemory-v30';
const ASSETS=['./','./index.html','./style.css?v=30','./ccf-renderer.js?v=3','./script.js?v=30','./fonts/Englebert-Regular.ttf','./assets/chemory-logo.png','./assets/chemory-192.png','./assets/chemory-180.png','./assets/monocode-logo.png','./packs/packs_config.json','./packs/ccf_smiles_showcase.json'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(
    caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{
      const copy=res.clone();
      caches.open(CACHE).then(c=>c.put(e.request,copy));
      return res;
    }).catch(()=>caches.match('./index.html')))
  );
});
