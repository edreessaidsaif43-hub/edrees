/* الاحتياط الذكي — عامل الخدمة: يتيح التثبيت والعمل دون اتصال */
var CACHE_PREFIX = 'ihtiyat-';
var CACHE = CACHE_PREFIX + 'v7';
var SCOPE = new URL(self.registration.scope);
var APP_PAGE = new URL('index.html', SCOPE);
var TEMPLATE_FILE = 'teacher-timetable-template.xlsx';
var TEMPLATE_URL = new URL(TEMPLATE_FILE, SCOPE).href;
var SHELL = ['index.html', 'store.js?v=7', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png', 'apple-touch-icon.png', TEMPLATE_FILE];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) {
      return k.startsWith(CACHE_PREFIX) && k !== CACHE;
    }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var inScope = url.origin === SCOPE.origin && url.pathname.startsWith(SCOPE.pathname);
  // الصفحة: الشبكة أولًا للحصول على آخر إصدار، ثم النسخة المخزنة
  if (inScope && (url.pathname === SCOPE.pathname || url.pathname === APP_PAGE.pathname)) {
    e.respondWith(caches.open(CACHE).then(async function (cache) {
      try {
        var res = await fetch(req);
        if (res.ok) await cache.put(APP_PAGE.href, res.clone()).catch(function () {});
        return res;
      } catch (err) {
        return (await cache.match(APP_PAGE.href)) || Response.error();
      }
    }));
    return;
  }
  // القالب والخطوط والمكتبات والأيقونات: المخزن أولًا
  if (url.href === TEMPLATE_URL || (req.mode !== 'navigate' && (inScope || /^(fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com)$/.test(url.hostname)))) {
    e.respondWith(caches.open(CACHE).then(async function (cache) {
      var hit = await cache.match(req);
      if (hit) return hit;
      var res = await fetch(req);
      if (res.ok || res.type === 'opaque') await cache.put(req, res.clone()).catch(function () {});
      return res;
    }));
  }
});
