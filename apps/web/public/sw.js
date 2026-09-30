/* SwiftLog PWA worker: authenticated API responses and mutations are never cached. */
const VERSION='swiftlog-pwa-v1', STATIC_CACHE=`${VERSION}-static`, PAGE_CACHE=`${VERSION}-pages`, OFFLINE_URL='/offline.html';
const PRECACHE=[OFFLINE_URL,'/manifest.webmanifest','/icons/swiftlog-192.png','/icons/swiftlog-512.png','/icons/swiftlog-maskable-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(STATIC_CACHE).then(cache=>cache.addAll(PRECACHE))));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>![STATIC_CACHE,PAGE_CACHE].includes(key)).map(key=>caches.delete(key)))),self.clients.claim()])));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')){event.respondWith(fetch(request));return}
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).then(response=>{if(response.ok&&(url.pathname==='/'||url.pathname.startsWith('/track/'))){const copy=response.clone();event.waitUntil(caches.open(PAGE_CACHE).then(cache=>cache.put(request,copy)))}return response}).catch(async()=>await caches.match(request)||await caches.match(OFFLINE_URL)));return;
  }
  const safe=url.pathname.startsWith('/_next/static/')||url.pathname.startsWith('/icons/')||url.pathname.startsWith('/rider-speed/')||url.pathname.startsWith('/assets/')||url.pathname.startsWith('/vendor/')||['style','script','font','image'].includes(request.destination);
  if(!safe){event.respondWith(fetch(request));return}
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok&&response.type==='basic')event.waitUntil(caches.open(STATIC_CACHE).then(cache=>cache.put(request,response.clone())));return response})));
});
