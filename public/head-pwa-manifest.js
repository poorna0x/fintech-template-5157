(function () {
  var path = window.location.pathname;
  var TOKEN_RE = /^[A-Za-z0-9_-]{40,48}$/;
  var STORAGE_KEY = 'hro_where_pwa_token_v1';

  function tokenFromPath(p) {
    var m = String(p || '').match(/^\/where\/([A-Za-z0-9_-]{40,48})\/?$/);
    return m && TOKEN_RE.test(m[1]) ? m[1] : null;
  }

  function readSavedToken() {
    try {
      var t = localStorage.getItem(STORAGE_KEY);
      return t && TOKEN_RE.test(t) ? t : null;
    } catch (e) {
      return null;
    }
  }

  function saveToken(t) {
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch (e) {
      /* ignore */
    }
  }

  function applyWhereManifest(startUrl) {
    var existing = document.getElementById('pwa-manifest');
    if (existing) existing.remove();
    var origin = window.location.origin || '';
    var manifest = {
      name: 'Office status',
      short_name: 'Office',
      description: 'See if they are in the office, or how long to arrive',
      id: startUrl,
      scope: '/where/',
      start_url: startUrl,
      display: 'standalone',
      display_override: ['standalone', 'fullscreen'],
      background_color: '#f8fafc',
      theme_color: '#f8fafc',
      orientation: 'portrait-primary',
      icons: [
        {
          src: origin + '/android-chrome-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any maskable',
        },
        {
          src: origin + '/android-chrome-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable',
        },
      ],
      lang: 'en-IN',
      dir: 'ltr',
    };
    var blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
    var link = document.createElement('link');
    link.rel = 'manifest';
    link.href = URL.createObjectURL(blob);
    link.id = 'pwa-manifest';
    document.head.appendChild(link);

    var appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleTitle) appleTitle.setAttribute('content', 'Office');
    var appName = document.querySelector('meta[name="application-name"]');
    if (appName) appName.setAttribute('content', 'Office');
    var winStart = document.querySelector('meta[name="msapplication-starturl"]');
    if (winStart) winStart.setAttribute('content', startUrl);
    var themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', '#f8fafc');
  }

  if (path === '/where' || path === '/where/' || path.startsWith('/where/')) {
    var token = tokenFromPath(path) || readSavedToken();
    if (token) saveToken(token);
    applyWhereManifest(token ? '/where/' + token : '/where/');
    return;
  }

  var manifestHref = '/site.webmanifest';
  if (path.startsWith('/technician')) {
    manifestHref = '/technician-manifest.json';
    document.title = 'Hydrogen RO Technician';
    var themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', '#ffffff');
    var appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleTitle) appleTitle.setAttribute('content', 'HRO Technician');
    var appName = document.querySelector('meta[name="application-name"]');
    if (appName) appName.setAttribute('content', 'HRO Technician');
  } else if (path.startsWith('/admin') || path.startsWith('/settings')) {
    manifestHref = '/admin-manifest.json';
  }

  var existing = document.getElementById('pwa-manifest');
  if (existing) existing.remove();

  var link = document.createElement('link');
  link.rel = 'manifest';
  link.href = manifestHref;
  link.id = 'pwa-manifest';
  document.head.appendChild(link);
})();
