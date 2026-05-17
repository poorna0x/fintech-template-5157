(function () {
  var path = window.location.pathname;
  var manifestHref = '/site.webmanifest';
  if (path.startsWith('/technician')) {
    manifestHref = '/technician-manifest.json';
  } else if (
    path.startsWith('/admin') ||
    path.startsWith('/settings') ||
    path.startsWith('/calling')
  ) {
    manifestHref = '/admin-manifest.json';
  }
  var link = document.createElement('link');
  link.rel = 'manifest';
  link.href = manifestHref;
  link.id = 'pwa-manifest';
  document.head.appendChild(link);
})();
