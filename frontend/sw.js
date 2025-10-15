const CACHE = "gitterbox-cache-v2";
const ASSETS = ["/","/index.html","/login.html","/styles.css","/app.js","/login.js","/users.html","/users.js","/manifest.webmanifest"];
self.addEventListener("install",(e)=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener("activate",(e)=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener("fetch",(e)=>{const r=e.request;if(r.url.includes("/api/")) return; e.respondWith(caches.match(r).then(c=>c||fetch(r).catch(()=>c)));});