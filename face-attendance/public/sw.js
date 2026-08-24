// Minimal hand-rolled service worker for the attendance kiosk.
//
// Its ONLY job is to keep the app shell (HTML/JS/CSS + face-api model files)
// available through a brief network blip so a wall-mounted kiosk survives Wi-Fi
// hiccups and can be "installed" fullscreen. It deliberately does NOT try to
// cache or replay /api calls — the offline check-in queue is owned by the app
// itself in IndexedDB (see src/db/idb.ts) and works whether or not this SW is
// active or even registered.
const CACHE = 'kiosk-shell-v1';
const SHELL = ['/', '/index.html', '/icon.svg', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never intercept API traffic — auth, sync and check-in must always hit the
  // network (and fail loudly to the app's own offline handling when they can't).
  if (url.pathname.startsWith('/api/')) return;

  // Model weight files + hashed build assets: cache-first (immutable-ish, big).
  const isAsset = url.pathname.startsWith('/models/') || url.pathname.startsWith('/assets/');
  if (isAsset) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // App shell / navigations: network-first, fall back to cache when offline.
  // res.clone() MUST happen synchronously here, before this function returns
  // res — cloning inside the caches.open().then() below ran too late (after
  // the browser had already started consuming the original response body
  // elsewhere), which threw "Response body is already used".
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(req)) || (await caches.match('/index.html'))),
  );
});
