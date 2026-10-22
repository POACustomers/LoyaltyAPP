const CACHE = "dina-corner-unified-root-v40-order-points";
const SHELL = ["./", "./index.html", "./POACustomers/manifest.webmanifest", "./POACustomers/assets/style.css", "./POACustomers/assets/dina-theme.css", "./POACustomers/assets/dina-corner-logo.png", "./POACustomers/assets/dina-corner-icon.png", "./POACustomers/assets/dina-floral-tl.png", "./POACustomers/assets/dina-floral-tr.png", "./POACustomers/assets/dina-floral-bl.png", "./POACustomers/assets/dina-floral-br.png", "./POACustomers/assets/app.js", "./POACustomers/assets/config.js", "./POACustomers/assets/tenant-config.js", "./POACustomers/assets/tenant-branding.js", "./POACustomers/assets/customer-navigation.js", "./POACustomers/assets/pwa-install.js", "./POACustomers/assets/pwa-install.css", "./POACustomers/assets/tenant-branding/logo.png", "./POACustomers/assets/tenant-branding/icon.png", "./POACustomers/assets/menu-display.css", "./POACustomers/assets/menu-display.js", "./POACustomers/assets/pickup-orders.css", "./POACustomers/assets/pickup-orders.js", "./POACustomers/assets/customer-addresses.css", "./POACustomers/assets/customer-addresses.js", "./POACustomers/assets/reward-hot-cold.jpg", "./POACustomers/assets/reward-breakfast.jpg", "./POACustomers/assets/reward-breakfast-drink.jpg", "./POACustomers/assets/icons/icon-192.png", "./POACustomers/assets/icons/icon-512.png", "./POACustomers/customer/customer-login.html", "./POACustomers/customer/customer-register.html", "./POACustomers/customer/customer-home.html", "./POACustomers/customer/customer-menu.html", "./POACustomers/customer/customer-orders.html", "./POACustomers/customer/customer-order-history.html", "./POACustomers/customer/customer-rewards.html", "./POACustomers/customer/customer-locations.html", "./POACustomers/customer/customer-profile.html", "./POACustomers/GM/gm-login.html", "./POACustomers/GM/gm-dashboard.html", "./POACustomers/GM/gm-categories.html", "./POACustomers/GM/gm-menu.html", "./POACustomers/GM/gm-offers.html", "./POACustomers/GM/gm-locations.html", "./POACustomers/admin/admin-login.html", "./POACustomers/admin/admin-dashboard.html", "./POACustomers/admin/admin-settings.html", "./POACustomers/admin/admin-users.html", "./POACustomers/admin/admin-staff.html", "./POACustomers/staff/staff-login.html", "./POACustomers/staff/staff-scan.html", "./POACustomers/staff/staff-orders.html", "./POACustomers/menu.html", "./POACustomers/offers.html", "./POACustomers/rewards.html", "./POACustomers/locations.html"];
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
        keys.filter(key => key.startsWith("dina-corner-") && key !== CACHE).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(scopeUrl.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response && response.ok && response.type === "basic") cache.put(request, response.clone()).catch(() => {});
      return response;
    } catch (_) {
      const cached = await cache.match(request);
      if (cached) return cached;
      if (request.mode === "navigate") {
        const fallback = await cache.match(new URL("index.html", scopeUrl).href);
        if (fallback) return fallback;
      }
      return Response.error();
    }
  })());
});
