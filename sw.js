/*
 * SensZone Service Worker（手写，零依赖）
 * 缓存版本号需与 src/version.js 的 SZ.VERSION 手动同步（当前对应 v1.4.1）。
 * 策略：
 *   - 页面导航：network-first，离线回退已缓存的 index.html
 *   - src/*.js 与 icons/*：cache-first，按完整 URL（含 ?v=）作为缓存键，
 *     发版后 ?v= 变化即自然命中新资源
 *   - 跨域请求一律不缓存
 */
const CACHE = 'senszone-v1.4.1';
const PRECACHE = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE && k.indexOf('senszone-') === 0)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // 不缓存跨域请求

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  const cacheFirst =
    (url.pathname.indexOf('/src/') === 0 && /\.js$/.test(url.pathname)) ||
    url.pathname.indexOf('/icons/') === 0 ||
    url.pathname === '/manifest.webmanifest';
  if (!cacheFirst) return;

  event.respondWith(
    caches.match(req.url).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req.url, copy));
          }
          return res;
        }),
    ),
  );
});
