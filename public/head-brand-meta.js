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
        phone: '+91-9880693311',
        email: 'mail@elevenro.com',
        street: '170, 2nd Cross Rd, Anjanapura 5th Block, Anjanapura Township',
        city: 'Bengaluru',
        region: 'Karnataka',
        pincode: '560108',
        geo: '12.8926;77.5993',
        icbm: '12.8926, 77.5993',
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
        phone: '+91-8884944288',
        email: 'mail@hydrogenro.com',
        street: 'Ground Floor, 13, 4th Main Road, Next To Jain Temple, Seshadripuram, Kumara Park West',
        city: 'Bengaluru',
        region: 'Karnataka',
        pincode: '560020',
        geo: '12.9716;77.5946',
        icbm: '12.9716, 77.5946',
      };

  function esc(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '');
  }

  function w(html) {
    var template = document.createElement('template');
    template.innerHTML = html;
    var node = template.content.firstElementChild;
    if (node) document.head.appendChild(node);
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

  // NAP / geo — overwrite Hydrogen-hardcoded index.html values for Eleven hosts
  // (local SEO: consistent phone, address, coordinates across brands).
  function setName(name, content) {
    var el = document.querySelector('meta[name="' + name + '"]');
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('name', name);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  }
  setName('geo.region', 'IN-KA');
  setName('geo.placename', profile.city);
  setName('geo.position', profile.geo);
  setName('ICBM', profile.icbm);
  setName('business:contact_data:street_address', profile.street);
  setName('business:contact_data:locality', profile.city);
  setName('business:contact_data:region', profile.region);
  setName('business:contact_data:postal_code', profile.pincode);
  setName('business:contact_data:country_name', 'India');
  setName('business:contact_data:phone_number', profile.phone);
  setName('business:contact_data:email', profile.email);
  setName('business:contact_data:website', profile.origin);
})();
