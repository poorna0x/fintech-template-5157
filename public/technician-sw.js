const STATIC_CACHE = 'technician-static-v4';
const RUNTIME_CACHE = 'technician-runtime-v4';

/** Do not precache HTML — cached login shell breaks Turnstile/ALTCHA and stale /assets/* hashes. */
const PRECACHE_URLS = [];

self.addEventListener('install', (event) => {
  event.waitFor(
    caches.open(STATIC_CACHE).then(async (cache) => {
      await Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[Technician PWA] Precache skipped:', url, err);
          })
        )
      );
      await self.skipWaiting();
      console.log('[Technician PWA] Service worker installed');
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
        console.log('[Technician PWA] Service worker activated');
      })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
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
    h.endsWith('.googleusercontent.com') ||
    h === 'challenges.cloudflare.com'
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
    request.headers.get('X-Requested-With') === 'XMLHttpRequest';

  if (isAPIRequest) {
    return;
  }

  // Always network for HTML — no 10s race that served stale cached login pages in PWA.
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
