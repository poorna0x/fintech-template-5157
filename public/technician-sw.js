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

  // NEVER cache API requests - always fetch from network
  const isAPIRequest = 
    url.pathname.includes('/api/') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('cloudinary.com') ||
    url.hostname.includes('cashfree.com') ||
    url.hostname.includes('bigdatacloud.net') ||
    url.hostname.includes('api-bdc.io') ||
    url.hostname.includes('nominatim.openstreetmap.org') ||
    url.hostname.includes('maps.googleapis.com') ||
    request.headers.get('X-Requested-With') === 'XMLHttpRequest';

  // For API requests, always fetch from network with timeout
  if (isAPIRequest) {
    event.respondWith(
      Promise.race([
        fetch(request),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 30000)
        )
      ]).catch((error) => {
        console.error('[Technician PWA] API request failed:', error);
        // Return error response instead of hanging
        return new Response(JSON.stringify({ error: 'Network request failed' }), {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  if (request.mode === 'navigate' && isSameOrigin) {
    event.respondWith(
      Promise.race([
        fetch(request),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 10000)
        )
      ])
        .then((response) => {
          // Only cache successful HTML responses
          if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
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
      Promise.race([
        fetch(request),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 10000)
        )
      ])
        .then((response) => {
          // Only cache successful responses
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




