/**
 * Growcord scanner service worker — app-shell caching so /scan opens offline.
 *
 * Rules:
 *  - NEVER touches /api/* (auth + freshness live there; the offline action
 *    queue in the app handles failed mutations with idempotency keys).
 *  - navigations: network-first, falling back to the cached shell.
 *  - static same-origin GETs (js/css/svg/fonts): stale-while-revalidate.
 */
const SHELL_CACHE = 'growcord-shell-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('/__shell__', copy));
          return res;
        })
        .catch(() => caches.match('/__shell__'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      const refresh = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || refresh;
    })
  );
});
