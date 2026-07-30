const CACHE_NAME = 'modo-sabor-admin-v3';
const FALLBACK_INDEX = '/index.html';
const STATIC_ASSETS = ['/manifest.json', '/admin-icon.svg', '/admin-icon-maskable.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/uploads')) return;
  if (url.pathname.startsWith('/rider')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            const cache = await caches.open(CACHE_NAME);
            cache.put(FALLBACK_INDEX, copy).catch(() => null);
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(FALLBACK_INDEX);
          return cached || Response.error();
        })
    );
    return;
  }

  if (!['style', 'script', 'image', 'font'].includes(request.destination)) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then(async (response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, copy).catch(() => null);
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});
