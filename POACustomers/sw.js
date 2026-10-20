const CACHE = "dina-corner-v18-bilingual-language-switcher-performance-fix";
const SHELL = [
  "./",
  "./index.html",
  "./menu.html",
  "./assets/style.css",
  "./assets/dina-theme.css",
  "./assets/dina-corner-logo.png",
  "./assets/dina-corner-icon.png",
  "./assets/dina-floral-tl.png",
  "./assets/dina-floral-tr.png",
  "./assets/dina-floral-bl.png",
  "./assets/dina-floral-br.png",
  "./assets/app.js",
  "./assets/config.js",
  "./assets/tenant-config.js",
  "./assets/tenant-branding.js",
  "./assets/tenant-branding/logo.png",
  "./assets/tenant-branding/icon.png",
  "./assets/menu-display.css",
  "./assets/menu-display.js",
  "./assets/pickup-orders.css",
  "./assets/pickup-orders.js",
  "./manifest.webmanifest",
  "./assets/reward-hot-cold.jpg",
  "./assets/reward-breakfast.jpg",
  "./assets/reward-breakfast-drink.jpg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./customer/customer-home.html",
  "./customer/customer-menu.html",
  "./customer/customer-orders.html",
  "./customer/customer-rewards.html",
  "./customer/customer-locations.html",
  "./customer/customer-profile.html",
  "./gm/gm-dashboard.html",

  "./gm/gm-categories.html",
  "./gm/gm-menu.html",
  "./gm/gm-locations.html",
  "./admin/admin-dashboard.html",
  "./staff/staff-orders.html"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(response =>
          response || caches.match("./index.html")
        )
      )
  );
});
