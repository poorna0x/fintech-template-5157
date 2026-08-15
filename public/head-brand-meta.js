/**
 * Synchronous host-aware primary meta + Open Graph tags.
 * WhatsApp / Google read static HTML without running deferred scripts — this must run during initial parse.
 */
(function () {
  var host = (location.hostname || '').toLowerCase();
  var isEleven = host.indexOf('elevenro.com') !== -1;
  window.__PUBLIC_SITE_KEY__ = isEleven ? 'elevenro' : 'hydrogenro';

  var profile = isEleven
    ? {
        title: 'Eleven RO - Best RO Water Purifier Service in Bengaluru | Same-Day Service',
        description:
          'Eleven RO - trusted RO water purifier service in Bengaluru, Karnataka. Professional RO installation, repair, maintenance and filter replacement. Same-day service across Bangalore including Anjanapura, JP Nagar, Bannerghatta and South Bangalore. Call +91-9880693311.',
        keywords:
          'Eleven RO, Eleven RO service Bengaluru, RO water purifier Bangalore, RO installation Anjanapura, RO repair South Bangalore, RO service Electronic City, RO service Bommanahalli, RO service Sarjapur, same day RO service Eleven RO',
        author: 'Eleven RO - Water Purifier Services',
        origin: 'https://elevenro.com',
        ogImage: 'https://elevenro.com/elevenro-og.webp',
        siteName: 'Eleven RO',
        ogTitle: 'Eleven RO - Best RO Water Purifier Service in Bengaluru | Same-Day Service',
        ogDescription:
          'Expert RO water purifier installation, repair and maintenance in Bengaluru by Eleven RO. Same-day service across South Bangalore. Call +91-9880693311.',
      }
    : {
        title: 'Hydrogen RO - #1 Best RO Service in Bengaluru Bangalore | 5★ Rated',
        description:
          'Hydrogen RO - #1 best RO water purifier service in Bengaluru, Bangalore. 5★ rated with 2300+ reviews. RO service in Electronic City, BTM, HSR, Whitefield, Koramangala, Hebbal, Yelahanka, Sarjapur, Bellandur, JP Nagar, Banashankari, Tumakuru, Nelamangala, Attibele, Chandapura, Devanahalli and all areas. Same-day service, 24/7 support. Call +91-8884944288.',
        keywords:
          'Hydrogen RO, best RO service Bengaluru, best RO service Bangalore, RO water purifier service Bangalore, RO installation Bengaluru, RO repair Bangalore, RO service Electronic City, RO service BTM Layout, RO service HSR Layout, same day RO service Bangalore',
        author: 'Hydrogen RO - Water Purifier Services',
        origin: 'https://hydrogenro.com',
        ogImage: 'https://hydrogenro.com/og-image.jpg',
        siteName: 'Hydrogen RO',
        ogTitle: 'Best RO Water Purifier Services in Bengaluru Bangalore | RO Installation & Repair',
        ogDescription:
          'Expert RO water purifier installation, repair & maintenance in Bengaluru, Bangalore. Serving Electronic City, BTM, HSR, Whitefield, Koramangala, Hebbal, Sarjapur, Bellandur, Tumakuru, Nelamangala, Attibele, Chandapura, Devanahalli and all areas. Same-day service, 24/7 support. Trusted by 2300+ customers.',
      };

  function esc(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '');
  }

  function w(html) {
    document.write(html);
  }

  var pathSegment = (location.pathname || '/').replace(/\/$/, '') || '';
  var pageUrl = profile.origin + (pathSegment ? pathSegment : '');
  var isNoIndex =
    /^\/(technician-id|technician\/|technician$|admin|dashboard|search|settings|calling|product-verify|review|c)(\/|$)/.test(
      '/' + (pathSegment || '')
    );

  w('<title>' + esc(profile.title) + '</title>');
  w('<meta name="title" content="' + esc(profile.title) + '" />');
  w('<meta name="description" content="' + esc(profile.description) + '" />');
  w('<meta name="keywords" content="' + esc(profile.keywords) + '" />');
  w('<meta name="author" content="' + esc(profile.author) + '" />');
  if (isNoIndex) {
    w('<meta name="robots" content="noindex, nofollow" />');
  } else {
    w('<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />');
  }
  w('<meta property="og:type" content="website" />');
  w('<meta property="og:url" content="' + esc(pageUrl) + '" />');
  w('<meta property="og:title" content="' + esc(profile.ogTitle) + '" />');
  w('<meta property="og:description" content="' + esc(profile.ogDescription) + '" />');
  w('<meta property="og:image" content="' + esc(profile.ogImage) + '" />');
  w('<meta property="og:image:width" content="1200" />');
  w('<meta property="og:image:height" content="630" />');
  w('<meta property="og:image:alt" content="' + esc(profile.siteName + ' — RO water purifier service in Bengaluru') + '" />');
  w('<meta property="og:site_name" content="' + esc(profile.siteName) + '" />');
  w('<meta property="og:locale" content="en_IN" />');
  w('<meta name="twitter:card" content="summary_large_image" />');
  w('<meta name="twitter:url" content="' + esc(pageUrl) + '" />');
  w('<meta name="twitter:title" content="' + esc(profile.ogTitle) + '" />');
  w('<meta name="twitter:description" content="' + esc(profile.ogDescription) + '" />');
  w('<meta name="twitter:image" content="' + esc(profile.ogImage) + '" />');
})();
