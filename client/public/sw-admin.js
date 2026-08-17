const CACHE_NAME = 'modo-sabor-admin-v4';
const FALLBACK_INDEX = '/index.html';
const STATIC_ASSETS = ['/manifest.json', '/admin-icon.svg', '/admin-icon-maskable.svg'];
const CATALOGO_TPV_PATH = '/api/productos/catalogo-tpv';
const CATEGORIAS_PATH = '/api/categorias';

function esLecturaCatalogoSegura(url) {
  return url.pathname === CATALOGO_TPV_PATH || url.pathname === CATEGORIAS_PATH;
}

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
  /*
   * El TPV necesita poder volver a abrir la carta sin red. Sólo se cachean
   * estas dos respuestas: el endpoint de catálogo usa una proyección sin
   * costo ni stock real. El resto de /api sigue excluido a propósito.
   */
  if (esLecturaCatalogoSegura(url)) {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response && response.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone()).catch(() => null);
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) || Response.error())
    );
    return;
  }

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
