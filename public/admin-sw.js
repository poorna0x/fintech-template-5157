const STATIC_CACHE = 'admin-static-v8';
const RUNTIME_CACHE = 'admin-runtime-v8';

/** Do not precache HTML — cached index.html keeps old /assets/* hashes and breaks after deploy. */
const PRECACHE_URLS = [];

/** Public Firebase web config (same project as Admin APK FCM). Not a secret. */
const FIREBASE_WEB_CONFIG = {
  apiKey: 'AIzaSyCI7rzGrVWoiu5RYJHEfCn0GdzM6Zy_dKo',
  authDomain: 'hydrogenro-otp.firebaseapp.com',
  projectId: 'hydrogenro-otp',
  messagingSenderId: '449481461674',
  appId: '1:449481461674:web:9dd16bfe8de5d4d42325d3',
};

try {
  importScripts(
    'https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js'
  );
  firebase.initializeApp(FIREBASE_WEB_CONFIG);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const data = (payload && payload.data) || {};
    const title =
      (payload.notification && payload.notification.title) ||
      data.msgTitle ||
      data.title ||
      data.Title ||
      'Hydrogen RO';
    const body =
      (payload.notification && payload.notification.body) ||
      data.msgBody ||
      data.body ||
      data.Body ||
      data.message ||
      '';
    // FCM already displayed a notification payload — avoid duplicate tray entry.
    if (payload.notification && payload.notification.title) {
      return undefined;
    }
    return self.registration.showNotification(title, {
      body,
      icon: '/favicon-32x32.png',
      badge: '/favicon-32x32.png',
      data,
    });
  });
} catch (err) {
  console.warn('[Admin PWA] Firebase messaging SW init skipped:', err);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      await Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((addErr) => {
            console.warn('[Admin PWA] Precache skipped:', url, addErr);
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

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of all) {
        if (client.url && client.url.includes('/admin') && 'focus' in client) {
          try {
            client.postMessage({ type: 'ADMIN_PUSH_CLICK', data });
          } catch {
            /* ignore */
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/admin');
      }
      return undefined;
    })()
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
