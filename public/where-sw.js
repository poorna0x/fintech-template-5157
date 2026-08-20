const STATIC_CACHE = 'where-static-v1';
const RUNTIME_CACHE = 'where-runtime-v1';

/** Do not precache HTML — status page must always hit the network for the API. */
const PRECACHE_URLS = [];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      await Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[Office PWA] Precache skipped:', url, err);
          })
        )
      );
      await self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const h = url.hostname;
  if (
    h.endsWith('.googleapis.com') ||
    h.endsWith('.gstatic.com') ||
    h.endsWith('.google.com') ||
    h === 'challenges.cloudflare.com'
  ) {
    return;
  }

  if (
    url.pathname.includes('/.netlify/functions/') ||
    url.hostname.includes('supabase.co')
  ) {
    return;
  }

  // Keep the requested /where/{token} URL. Do not rewrite to / or /where.
  if (request.mode === 'navigate' && isSameOrigin) {
    event.respondWith(fetch(request));
    return;
  }

  if (isSameOrigin && url.pathname.startsWith('/assets/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || Response.error();
        })
    );
  }
});
