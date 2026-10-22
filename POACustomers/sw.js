// Compatibility file retained for old bookmarked URLs. The current app registers the single root-scoped ../sw.js worker.
// Do not register this worker from HTML; app.js detects and unregisters older registrations using this file.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  await self.registration.unregister();
  await self.clients.claim();
})()));
