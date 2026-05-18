const STATIC_CACHE = 'admin-static-v6';
const RUNTIME_CACHE = 'admin-runtime-v6';

/** Do not precache HTML — cached index.html keeps old /assets/* hashes and breaks after deploy. */
const PRECACHE_URLS = [];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      await Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[Admin PWA] Precache skipped:', url, err);
          })
        )
      );
      await self.skipWaiting();
      console.log('[Admin PWA] Service worker installed');
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
      .then(() => {
        console.log('[Admin PWA] Service worker activated');
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

  const h = url.hostname;
  if (
    h.endsWith('.googleapis.com') ||
    h.endsWith('.gstatic.com') ||
    h.endsWith('.google.com') ||
    h.endsWith('.googleusercontent.com')
  ) {
    return;
  }

  const isAPIRequest =
    url.pathname.includes('/api/') ||
    url.pathname.includes('/.netlify/functions/') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('cloudinary.com') ||
    url.hostname.includes('bigdatacloud.net') ||
    url.hostname.includes('api-bdc.io') ||
    url.hostname.includes('nominatim.openstreetmap.org') ||
    request.headers.get('X-Requested-With') === 'XMLHttpRequest';

  if (isAPIRequest) {
    return;
  }

  // Never cache HTML navigations — stale shell references removed vendor chunks (ui-vendor).
  if (request.mode === 'navigate' && isSameOrigin) {
    event.respondWith(fetch(request));
    return;
  }

  // Hashed build assets: network-first, optional runtime cache for offline reuse.
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
