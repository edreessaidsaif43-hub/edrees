// Attendance pages require a live subscription check before delivery.
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => /^school-attendance-v\d+$/.test(key)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});
