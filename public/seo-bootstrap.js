(function () {
  var p = (window.location.pathname || '/').replace(/\/$/, '') || '';
  var pathForTest = '/' + (p || '');
  var noIndex = /^\/(technician|admin|dashboard|search)(\/|$)/.test(pathForTest);
  if (noIndex) {
    var r = document.querySelector('meta[name="robots"]');
    if (r) r.setAttribute('content', 'noindex, nofollow');
    else {
      var m = document.createElement('meta');
      m.name = 'robots';
      m.content = 'noindex, nofollow';
      document.head.appendChild(m);
    }
  } else {
    var h = 'https://hydrogenro.com' + (p ? p : '');
    var link = document.createElement('link');
    link.rel = 'canonical';
    link.href = h;
    document.head.appendChild(link);
  }
})();
