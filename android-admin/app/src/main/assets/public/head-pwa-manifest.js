(function () {
  var path = window.location.pathname;
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
