window.addEventListener('load', function () {
  var whatsappLinks = document.querySelectorAll('a[href*="wa.me"]');
  whatsappLinks.forEach(function (link) {
    link.addEventListener('click', function () {
      if (typeof gtag !== 'undefined') {
        gtag('event', 'click', {
          event_category: 'social',
          event_label: 'whatsapp_contact',
        });
      }
    });
  });

  var phoneLinks = document.querySelectorAll('a[href^="tel:"]');
  phoneLinks.forEach(function (link) {
    link.addEventListener('click', function () {
      if (typeof gtag !== 'undefined') {
        gtag('event', 'click', {
          event_category: 'contact',
          event_label: 'phone_call',
        });
      }
    });
  });

  if ('performance' in window) {
    window.addEventListener('load', function () {
      setTimeout(function () {
        var perfData = performance.getEntriesByType('navigation')[0];
        if (perfData && typeof gtag !== 'undefined') {
          gtag('event', 'timing_complete', {
            name: 'load',
            value: Math.round(perfData.loadEventEnd - perfData.loadEventStart),
          });
        }
      }, 0);
    });
  }
});
