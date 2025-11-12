const STATIC_CACHE = 'technician-static-v1';
const RUNTIME_CACHE = 'technician-runtime-v1';
const OFFLINE_FALLBACK = '/technician';
const PRECACHE_URLS = [
  '/',
  '/technician',
  '/technician/login'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => {
        // Don't automatically skip waiting - wait for user to close all tabs
        // This prevents automatic page refresh
        console.log('[Technician PWA] Service worker installed, waiting for activation');
      })
      .catch((error) => {
        console.error('[Technician PWA] Install failed:', error);
      })
  );
  // Don't call skipWaiting() to prevent automatic refresh
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => {
      // Don't automatically claim clients - this prevents automatic refresh
      // The service worker will activate when all tabs are closed
      console.log('[Technician PWA] Service worker activated');
    })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isTechnicianPath = url.pathname.startsWith('/technician');

  if (request.mode === 'navigate' && isSameOrigin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          if (isTechnicianPath) {
            const offlineResponse = await caches.match(OFFLINE_FALLBACK);
            if (offlineResponse) {
              return offlineResponse;
            }
          }
          return caches.match('/') || Response.error();
        })
    );
    return;
  }

  if (isSameOrigin && isTechnicianPath) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
          .catch(() => cached);

        return cached || fetchPromise;
      })
    );
  }
});




