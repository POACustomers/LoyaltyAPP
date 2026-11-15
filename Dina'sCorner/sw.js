const CACHE = "dinas-corner-gm-v4";
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest",
  "./GM/index.html", "./GM/gm-login.html", "./GM/gm-dashboard.html",
  "./GM/gm-menu.html", "./GM/gm-categories.html", "./GM/gm-home-products.html",
  "./GM/gm-locations.html",
  "./assets/style.css", "./assets/gm-login.css", "./assets/app.js", "./assets/config.js",
  "./assets/tenant-config.js", "./assets/tenant-branding.js",
  "./assets/dina-corner-logo.png", "./assets/dina-corner-icon.png",
  "./assets/dina-corner-icon-192.png", "./assets/dina-corner-icon-512.png",
  "./assets/dina-floral-tl.png", "./assets/dina-floral-tr.png",
  "./assets/dina-floral-bl.png", "./assets/dina-floral-br.png"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("dinas-corner-gm-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request; if (request.method !== "GET") return;
  const url = new URL(request.url); if (url.origin !== self.location.origin || !url.pathname.includes("/Dina'sCorner/")) return;
  event.respondWith((async () => { const cache = await caches.open(CACHE); try { const response = await fetch(request); if (response && response.ok) cache.put(request, response.clone()).catch(() => {}); return response; } catch (_) { const cached = await cache.match(request); if (cached) return cached; if (request.mode === "navigate") return cache.match(new URL("index.html", self.registration.scope)); return Response.error(); } })());
});
