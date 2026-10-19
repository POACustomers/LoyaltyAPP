const CACHE = "poa-customers-v10-pickup-orders";
const SHELL = [
  "./",
  "./index.html",
  "./menu.html",
  "./assets/style.css",
  "./assets/app.js",
  "./assets/config.js",
  "./assets/menu-display.css",
  "./assets/menu-display.js",
  "./assets/pickup-orders.css",
  "./assets/pickup-orders.js",
  "./manifest.webmanifest",
  "./assets/poac-logo-full.png",
  "./assets/poac-logo-icon.png",
  "./assets/reward-hot-cold.jpg",
  "./assets/reward-breakfast.jpg",
  "./assets/reward-breakfast-drink.jpg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./customer/customer-home.html",
  "./customer/customer-menu.html",
  "./customer/customer-orders.html",
  "./gm/gm-orders.html",
  "./staff/staff-orders.html",
  "./customer/customer-locations.html",
  "./gm/gm-dashboard.html",
  "./gm/gm-categories.html",
  "./gm/gm-menu.html",
  "./gm/gm-locations.html",
  "./admin/admin-dashboard.html"
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
