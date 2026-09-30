// 篮球经理 service worker：代码网络优先，图片缓存优先 + 后台更新
const VER='bbm-v2';
const SHELL=['./','./index.html','./site.webmanifest','./favicon.ico','./logos.png','./icon/icon-192.png','./icon/icon-512.png','./icon/icon-180.png','./icon/icon-32.png'];
self.addEventListener('install',e=>{ e.waitUntil(caches.open(VER).then(c=>c.addAll(SHELL))); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VER).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('message',e=>{ if(e.data==='skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch',e=>{
  const req=e.request; if(req.method!=='GET') return;
  const url=new URL(req.url); if(url.origin!==location.origin) return;
  const img=/\.(png|jpg|jpeg|webp|gif|svg|ico)$/i.test(url.pathname);
  if(img){
    e.respondWith(caches.open(VER).then(async c=>{ const hit=await c.match(req);
      const net=fetch(req).then(r=>{ if(r.ok) c.put(req,r.clone()); return r; }).catch(()=>hit);
      return hit||net; }));
  } else {
    e.respondWith(fetch(req).then(r=>{ if(r.ok){ const cp=r.clone(); caches.open(VER).then(c=>c.put(req,cp)); } return r; })
      .catch(async()=>{ const c=await caches.open(VER); return (await c.match(req)) || (req.mode==='navigate'? (await c.match('./index.html'))||(await c.match('./')) : Response.error()); }));
  }
});
