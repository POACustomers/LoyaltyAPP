const CACHE_NAMESPACE = "poac-app-";
const CACHE = CACHE_NAMESPACE + "v53-home-bestsellers-autoplay-3s";
const SHELL = [
  "./",
  "./index.html",
  "./menu.html",
  "./customer-offers.html",
  "./offers.html",
  "./manifest.webmanifest",
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
  "./assets/customer-navigation.js",
  "./assets/customer-home-categories.js",
  "./assets/customer-home.css",
  "./assets/customer-home-featured.js",
  "./assets/pwa-install.js",
  "./assets/pwa-install.css",
  "./assets/tenant-branding/logo.png",
  "./assets/tenant-branding/icon.png",
  "./assets/menu-display.css",
  "./assets/menu-display.js",
  "./assets/pickup-orders.css",
  "./assets/pickup-orders.js",
  "./assets/customer-addresses.css",
  "./assets/customer-addresses.js",
  "./assets/reward-hot-cold.jpg",
  "./assets/reward-breakfast.jpg",
  "./assets/reward-breakfast-drink.jpg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./customer/customer-login.html",
  "./customer/customer-register.html",
  "./customer/customer-home.html",
  "./customer/customer-offers.html",
  "./customer/customer-card.html",
  "./customer/customer-menu.html",
  "./customer/customer-orders.html",
  "./customer/customer-order-history.html",
  "./customer/customer-rewards.html",
  "./customer/customer-locations.html",
  "./customer/customer-profile.html",
  "./GM/gm-login.html",
  "./GM/gm-dashboard.html",
  "./GM/gm-home-products.html",
  "./GM/gm-categories.html",
  "./GM/gm-menu.html",
  "./GM/gm-offers.html",
  "./GM/gm-locations.html",
  "./GM/gm-delivery-zones.html",
  "./admin/admin-login.html",
  "./admin/admin-dashboard.html",
  "./admin/admin-settings.html",
  "./staff/staff-login.html",
  "./staff/staff-orders.html"
];

const scopeUrl = new URL(self.registration.scope);
const shellUrls = SHELL.map(path => new URL(path, scopeUrl).href);

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(shellUrls))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => (key.startsWith(CACHE_NAMESPACE) || key.startsWith("dina-corner-v33-")) && key !== CACHE).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never cache third-party services or API results in the app shell cache.
  if (url.origin !== self.location.origin || !url.pathname.startsWith(scopeUrl.pathname)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response && response.ok && response.type === "basic") {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch (_) {
      const cached = await cache.match(request);
      if (cached) return cached;
      if (request.mode === "navigate") {
        const appStart = new URL("index.html", scopeUrl).href;
        const fallback = await cache.match(appStart);
        if (fallback) return fallback;
      }
      return Response.error();
    }
  })());
});
