(function () {
  var SHARED_AREAS =
    'Whitefield, ITPL, Electronic City, Bommanahalli, Bommasandra, Sarjapur, Sarjapura, Sarjapur Road, Attibele, Chandapura, Jigani, Anekal, Singasandra, Hosur Road, Silk Board, BTM Layout, HSR Layout, Koramangala, Bellandur, Varthur, Kadubeesanahalli, Panathur, Haralur, Yelahanka, Thanisandra, Jakkur, Bagalur, Budigere Cross, Devanahalli, Manyata Tech Park, RT Nagar, Nagawara, Hebbal, Hoskote, JP Nagar, Banashankari, Anjanapura, Tumakuru, Nelamangala';

  var SITE_PROFILES = {
    hydrogenro: {
      origin: 'https://hydrogenro.com',
      brandName: 'Hydrogen RO',
      legalName: 'Hydrogen RO',
      defaultTitle: 'Hydrogen RO - #1 Best RO Service in Bengaluru Bangalore | 5★ Rated',
      defaultDescription:
        'Hydrogen RO - #1 best RO water purifier service in Bengaluru, Bangalore. 5★ rated with 2300+ reviews. Same-day RO installation, repair, maintenance and filter replacement across all Bangalore areas. Call +91-8884944288.',
      keywords:
        'Hydrogen RO, best RO service Bengaluru, RO service Electronic City, RO service Bommanahalli, RO service Sarjapur, RO service Attibele, RO service Chandapura, RO service Bommasandra, RO service Jigani, RO service Hosur Road, RO service Silk Board, RO service Sarjapur Road, RO installation Bengaluru, RO repair Bangalore, same day RO service South Bangalore',
      ogImage: 'https://hydrogenro.com/og-image.jpg',
      logoPath: 'https://hydrogenro.com/fulllogo.png',
      phones: ['+91-8884944288', '+91-9886944288'],
      primaryPhone: '+91-8884944288',
      email: 'mail@hydrogenro.com',
      streetAddress:
        'Ground Floor, 13, 4th Main Road, Next To Jain Temple, Seshadripuram, Kumara Park West',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560020',
      geo: { latitude: 12.9716, longitude: 77.5946 },
    },
    elevenro: {
      origin: 'https://elevenro.com',
      brandName: 'Eleven RO',
      legalName: 'ELEVEN RO',
      defaultTitle: 'Eleven RO - Best RO Water Purifier Service in Bengaluru | Same-Day Service',
      defaultDescription:
        'Eleven RO - trusted RO water purifier service in Bengaluru, Karnataka. Professional RO installation, repair, maintenance and filter replacement. Same-day service across Bangalore including Anjanapura, JP Nagar, Bannerghatta and South Bangalore. Call 9880693311.',
      keywords:
        'Eleven RO, Eleven RO service Bengaluru, RO service Electronic City, RO service Bommanahalli, RO service Sarjapur, RO service Attibele, RO service Chandapura, RO service Bommasandra, RO service Jigani, RO service Hosur Road, RO installation Anjanapura, RO repair South Bangalore, same day RO service Eleven RO',
      ogImage: 'https://elevenro.com/elevenro-og.webp',
      logoPath: 'https://elevenro.com/elevenrofulloogo.webp',
      phones: ['+91-9880693311', '+91-8792467611'],
      primaryPhone: '+91-9880693311',
      email: 'mail@elevenro.com',
      streetAddress: '170, 2nd Cross Rd, Anjanapura 5th Block, Anjanapura Township',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560108',
      geo: { latitude: 12.8926, longitude: 77.5993 },
    },
  };

  function detectSiteKey() {
    var host = (window.location.hostname || '').toLowerCase();
    return host.indexOf('elevenro.com') !== -1 ? 'elevenro' : 'hydrogenro';
  }

  function setMetaName(name, content) {
    var el = document.querySelector('meta[name="' + name + '"]');
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('name', name);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  }

  function setMetaProperty(property, content) {
    var el = document.querySelector('meta[property="' + property + '"]');
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('property', property);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  }

  function injectJsonLd(data, id) {
    var script = document.createElement('script');
    script.type = 'application/ld+json';
    if (id) script.id = id;
    script.setAttribute('data-brand-seo', 'elevenro');
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  }

  function buildElevenJsonLd(profile, pageUrl) {
    var areaServed = [
      {
        '@type': 'City',
        name: profile.city,
        alternateName: 'Bangalore',
        containedInPlace: { '@type': 'State', name: profile.state, alternateName: 'KA' },
      },
      { '@type': 'AdministrativeArea', name: SHARED_AREAS },
    ];

    injectJsonLd(
      {
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        name: profile.brandName + ' - RO Water Purifier Service in Bengaluru',
        description: profile.defaultDescription,
        url: profile.origin,
        '@id': profile.origin + '/#localbusiness',
        telephone: profile.primaryPhone,
        email: profile.email,
        image: profile.ogImage,
        logo: profile.logoPath,
        priceRange: '₹₹',
        address: {
          '@type': 'PostalAddress',
          streetAddress: profile.streetAddress,
          addressLocality: profile.city,
          addressRegion: profile.state,
          postalCode: profile.pincode,
          addressCountry: 'IN',
        },
        geo: {
          '@type': 'GeoCoordinates',
          latitude: profile.geo.latitude,
          longitude: profile.geo.longitude,
        },
        areaServed: areaServed,
        sameAs: [profile.origin],
        potentialAction: {
          '@type': 'ReserveAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: profile.origin + '/book',
          },
        },
        mainEntityOfPage: pageUrl,
      },
      'elevenro-localbusiness'
    );

    injectJsonLd(
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: profile.brandName,
        legalName: profile.legalName,
        url: profile.origin,
        logo: profile.logoPath,
        email: profile.email,
        telephone: profile.primaryPhone,
        address: {
          '@type': 'PostalAddress',
          streetAddress: profile.streetAddress,
          addressLocality: profile.city,
          addressRegion: profile.state,
          postalCode: profile.pincode,
          addressCountry: 'IN',
        },
        contactPoint: profile.phones.map(function (phone) {
          return {
            '@type': 'ContactPoint',
            telephone: phone,
            contactType: 'customer service',
            areaServed: 'IN-KA',
            availableLanguage: ['English', 'Kannada', 'Hindi'],
          };
        }),
      },
      'elevenro-organization'
    );

    injectJsonLd(
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: profile.brandName,
        url: profile.origin,
        description: profile.defaultDescription,
        publisher: { '@type': 'Organization', name: profile.brandName, logo: profile.logoPath },
        potentialAction: {
          '@type': 'SearchAction',
          target: profile.origin + '/services?q={search_term_string}',
          'query-input': 'required name=search_term_string',
        },
      },
      'elevenro-website'
    );

    injectJsonLd(
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'What RO services does Eleven RO offer in Bengaluru?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Eleven RO provides RO installation, repair, filter replacement, AMC maintenance, water softener service and emergency same-day RO support across Bengaluru.',
            },
          },
          {
            '@type': 'Question',
            name: 'How do I book RO service with Eleven RO?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Book online at https://elevenro.com/book or call +91-9880693311. Same-day RO service is available in most Bengaluru areas.',
            },
          },
          {
            '@type': 'Question',
            name: 'Which RO brands does Eleven RO service?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Eleven RO services Kent, Aquaguard, Pureit, Livpure, Blue Star, Eureka Forbes, Havells, AO Smith, LG, Samsung and all major RO brands in Bengaluru.',
            },
          },
          {
            '@type': 'Question',
            name: 'What is the Eleven RO contact number?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Call +91-9880693311 or +91-8792467611, or email mail@elevenro.com for RO service in Bengaluru.',
            },
          },
        ],
      },
      'elevenro-faq'
    );
  }

  function titleCaseSlug(slug) {
    return slug.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function resolveRouteSeo(profile, path) {
    var clean = path || '/';
    if (clean === '/') {
      return { title: profile.defaultTitle, description: profile.defaultDescription, keywords: profile.keywords };
    }
    if (clean.indexOf('/ro-service-') === 0) {
      var slug = clean.replace('/ro-service-', '');
      var area = titleCaseSlug(slug);
      // AUTO:BENGALURU_LOCALITY_SLUGS
      var BENGALURU_LOCALITY_SLUGS = new Set(["aecs-layout","agara","allalasandra","ambalipura","anjanapura","arekere","attibele","attur-layout","bagalur","banashankari","banaswadi","bannerghatta","basavanagudi","basaveshwaranagar","begur","bellandur","benson-town","bilekahalli","bommanahalli","bommasandra","bommasandra-industrial-area","brookefield","btm-layout","budigere-cross","carmelaram","chandapura","cox-town","cv-raman-nagar","dasarahalli","doddaballapur-road","doddakannelli","domlur","dommasandra","ejipura","electronic-city","frazer-town","girinagar","goraguntepalya","gottigere","graphite-india-road","hal","halasuru","haralur","hbr-layout","hebbal","hennur","hongasandra","hoodi","hope-farm","horamavu","hosa-road","hosur-road","hrbr-layout","hsr-layout","hulimavu","iblur","indiranagar","itpl","jakkur","jalahalli","jayanagar","jeevan-bima-nagar","jigani","jp-nagar","kacharakanahalli","kadubeesanahalli","kadugodi","kaikondrahalli","kalyan-nagar","kammanahalli","kannamangala","kasavanahalli","kathriguppe","kengeri","kodathi","kogilu","konanakunte","koramangala","kudlu-gate","kumaraswamy-layout","kundalahalli","laggere","lingarajapuram","madiwala","magadi-road","mahadevapura","mahalakshmi-layout","malleshwaram","manyata-tech-park","marathahalli","munnekollal","murugeshpalya","mysore-road","nagarbhavi","nagarbhavi-2nd-stage","nagasandra","nagawara","nallurahalli","nayandahalli","old-airport-road","outer-ring-road","padmanabhanagar","panathur","parappana-agrahara","peenya","pulakeshinagar","rajajinagar","rajanukunte","ramamurthy-nagar","richmond-town","rr-nagar","rt-nagar","sadashivanagar","sahakar-nagar","sanjaynagar","sarakki","sarjapur","seegehalli","silk-board","singasandra","sunkadakatte","thanisandra","tilak-nagar","ulsoor","uttarahalli","varthur","vidyapeeta","vijayanagar","whitefield","wilson-garden","wipro-gate","yelahanka","yelahanka-new-town","yeshwanthpur"]);
      // END:BENGALURU_LOCALITY_SLUGS
      if (slug === 'hosur') {
        return {
          title: 'RO Service in Hosur | Installation & Repair | ' + profile.brandName,
          description: 'RO water purifier service in Hosur near Bengaluru border by ' + profile.brandName + '. Same-day installation, repair and AMC. Call ' + profile.primaryPhone + '.',
          keywords: 'RO service Hosur, RO repair Hosur, ' + profile.brandName,
        };
      }
      if (!BENGALURU_LOCALITY_SLUGS.has(slug)) {
        return {
          title: 'RO Service in ' + area + ' Karnataka | Installation & Repair | ' + profile.brandName,
          description: 'Best RO water purifier service in ' + area + ', Karnataka by ' + profile.brandName + '. Same-day RO installation, repair, filter replacement and AMC. Call ' + profile.primaryPhone + '.',
          keywords: 'RO service ' + area + ' Karnataka, RO repair ' + area + ', RO installation ' + area + ', water purifier service ' + area + ', ' + profile.brandName,
        };
      }
      var southAreas = ['electronic-city', 'bommanahalli', 'sarjapur', 'attibele', 'chandapura', 'bommasandra', 'jigani', 'singasandra', 'anekal', 'bellandur', 'hsr-layout', 'haralur', 'varthur', 'kadubeesanahalli', 'panathur', 'silk-board'];
      var northAreas = ['yelahanka', 'thanisandra', 'jakkur', 'bagalur', 'budigere-cross', 'devanahalli', 'manyata-tech-park', 'rt-nagar', 'nagawara', 'hebbal', 'hoskote', 'itpl'];
      var corridorExtra = '';
      if (southAreas.indexOf(slug) >= 0) {
        corridorExtra = ' Serving Electronic City, Bommanahalli, Sarjapur, Sarjapura, Attibele, Chandapura, Bommasandra, Hosur Road, Silk Board and South Bangalore corridor.';
      } else if (northAreas.indexOf(slug) >= 0) {
        corridorExtra = ' Serving Yelahanka, Thanisandra, Jakkur, Bagalur, Budigere Cross, Devanahalli, Manyata Tech Park, Hebbal and North Bangalore corridor.';
      }
      return {
        title: 'RO Service in ' + area + ' Bengaluru | Installation & Repair | ' + profile.brandName,
        description: 'Best RO water purifier service in ' + area + ', Bengaluru by ' + profile.brandName + '. Same-day RO installation, repair, filter replacement and AMC.' + corridorExtra + ' Call ' + profile.primaryPhone + '.',
        keywords: 'RO service ' + area + ', RO repair ' + area + ', RO installation ' + area + ' Bangalore, ' + profile.brandName + ' ' + area + ', RO service Yelahanka, RO service Sarjapur, RO service Budigere Cross, RO service Devanahalli, RO service Attibele',
      };
    }
    var serviceTitles = {
      '/ro-installation': 'RO Installation in Bengaluru',
      '/ro-repair': 'RO Repair in Bengaluru',
      '/filter-replacement': 'RO Filter Replacement in Bengaluru',
      '/ro-maintenance': 'RO Maintenance in Bengaluru',
      '/water-softener': 'Water Softener Service in Bengaluru',
      '/ro-troubleshooting': 'RO Troubleshooting in Bengaluru',
      '/ro-spare-parts': 'RO Spare Parts in Bengaluru',
      '/ro-brands': 'All RO Brands Service in Bengaluru',
      '/ro-price-list': 'RO Service Price List Bengaluru',
      '/ro-warranty': 'RO Warranty Service Bengaluru',
      '/emergency-ro-repair': 'Emergency RO Repair Bengaluru',
      '/same-day-ro-service': 'Same Day RO Service Bengaluru',
      '/ro-amc': 'RO AMC Karnataka',
      '/ro-service': 'RO Service Karnataka',
      '/water-purifier-repair': 'Water Purifier Repair Karnataka',
      '/commercial-ro-service': 'Commercial RO Service Karnataka',
      '/industrial-ro-service': 'Industrial RO Service Karnataka',
      '/ro-annual-maintenance': 'RO Annual Maintenance Karnataka',
      '/membrane-replacement': 'RO Membrane Replacement Karnataka',
      '/ro-sanitization': 'RO Sanitization Karnataka',
      '/services': 'RO Services in Bengaluru',
      '/service-areas': 'RO Service Areas in Bengaluru',
      '/book': 'Book RO Service in Bengaluru',
      '/booking': 'Book RO Service in Bengaluru',
      '/contact': 'Contact ' + profile.brandName + ' Bengaluru',
      '/about': 'About ' + profile.brandName,
      '/blog': profile.brandName + ' RO Water Purifier Blog',
      '/spare-parts': 'RO Spare Parts Bengaluru',
      '/warranty': 'RO Warranty & AMC Bengaluru',
    };
    if (serviceTitles[clean]) {
      return {
        title: serviceTitles[clean] + ' | ' + profile.brandName,
        description: serviceTitles[clean] + ' by ' + profile.brandName + '. Same-day RO water purifier service across Bangalore. Call ' + profile.primaryPhone + '.',
        keywords: profile.keywords,
      };
    }
    if (clean.indexOf('/blog/') === 0) {
      var slug = clean.replace('/blog/', '');
      return {
        title: titleCaseSlug(slug) + ' | ' + profile.brandName + ' Blog',
        description: 'Expert RO water purifier guide for Bengaluru from ' + profile.brandName + '.',
        keywords: profile.keywords,
      };
    }
    return { title: profile.defaultTitle, description: profile.defaultDescription, keywords: profile.keywords };
  }

  var siteKey = detectSiteKey();
  var profile = SITE_PROFILES[siteKey];
  var p = (window.location.pathname || '/').replace(/\/$/, '') || '';
  var pathForTest = '/' + (p || '');
  var noIndex =
    /^\/(technician-id|technician\/|technician$|admin|dashboard|search|settings|calling|product-verify)(\/|$)/.test(
      pathForTest
    );
  var canonical = profile.origin + (p ? p : '');
  var routeSeo = resolveRouteSeo(profile, p ? p : '/');

  if (noIndex) {
    setMetaName('robots', 'noindex, nofollow');
    return;
  }

  var link = document.createElement('link');
  link.rel = 'canonical';
  link.href = canonical;
  document.head.appendChild(link);

  document.title = routeSeo.title;
  setMetaName('title', routeSeo.title);
  setMetaName('description', routeSeo.description);
  setMetaName('keywords', routeSeo.keywords);

  if (!p || p === '/') {
    var heroPreload = document.createElement('link');
    heroPreload.rel = 'preload';
    heroPreload.as = 'image';
    heroPreload.href = '/hero-ro-purifier-640.webp';
    heroPreload.type = 'image/webp';
    heroPreload.setAttribute('fetchpriority', 'high');
    heroPreload.setAttribute('imagesrcset', '/hero-ro-purifier-640.webp 640w, /hero-ro-purifier.webp 1100w');
    heroPreload.setAttribute('imagesizes', '(max-width: 1024px) 100vw, 50vw');
    document.head.appendChild(heroPreload);
  }
  setMetaName('author', profile.brandName + ' - Water Purifier Services');
  setMetaName('robots', 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1');
  setMetaName('business:contact_data:phone_number', profile.primaryPhone);
  setMetaName('business:contact_data:website', profile.origin);
  setMetaName('apple-mobile-web-app-title', profile.brandName);
  setMetaName('application-name', profile.brandName);

  setMetaProperty('og:type', 'website');
  setMetaProperty('og:url', canonical);
  setMetaProperty('og:title', routeSeo.title);
  setMetaProperty('og:description', routeSeo.description);
  setMetaProperty('og:image', profile.ogImage);
  setMetaProperty('og:site_name', profile.brandName);

  setMetaName('twitter:card', 'summary_large_image');
  setMetaName('twitter:url', canonical);
  setMetaName('twitter:title', routeSeo.title);
  setMetaName('twitter:description', routeSeo.description);
  setMetaName('twitter:image', profile.ogImage);

  if (siteKey === 'elevenro') {
    var ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < ldScripts.length; i++) {
      var node = ldScripts[i];
      if (node.parentNode) node.parentNode.removeChild(node);
    }
    buildElevenJsonLd(profile, canonical);

    var hydrogenCrawler = document.getElementById('crawler-seo-hydrogenro');
    var elevenCrawler = document.getElementById('crawler-seo-elevenro');
    if (hydrogenCrawler) {
      hydrogenCrawler.setAttribute('hidden', '');
      hydrogenCrawler.setAttribute('aria-hidden', 'true');
    }
    if (elevenCrawler) {
      elevenCrawler.removeAttribute('hidden');
      elevenCrawler.removeAttribute('aria-hidden');
    }
  }

  function removeFoucGuards() {
    var el = document.getElementById('async-css-fouc-guards');
    if (el) el.remove();
  }

  function activateAsyncStyles() {
    function activate(link) {
      if (link.getAttribute('data-async-css') !== 'true') return;
      link.rel = 'stylesheet';
      link.removeAttribute('data-async-css');
      link.removeAttribute('as');
      removeFoucGuards();
    }

    function isPreloadComplete(href) {
      var absoluteHref = href;
      try {
        absoluteHref = new URL(href, document.baseURI || window.location.href).href;
      } catch (e) {
        // keep relative href
      }

      if (performance.getEntriesByName(absoluteHref).length > 0) return true;
      if (absoluteHref !== href && performance.getEntriesByName(href).length > 0) return true;

      var resources = performance.getEntriesByType('resource');
      for (var i = 0; i < resources.length; i++) {
        if (resources[i].name.indexOf(href) !== -1) return true;
      }
      return false;
    }

    var links = document.querySelectorAll('link[data-async-css="true"]');
    for (var i = 0; i < links.length; i++) {
      (function (link) {
        var href = link.getAttribute('href');
        if (!href) return;

        link.addEventListener('load', function () {
          activate(link);
        });
        link.addEventListener('error', function () {
          activate(link);
        });

        // Cached preloads can finish before listeners attach (relative href broke the old check).
        if (isPreloadComplete(href)) {
          activate(link);
        }
      })(links[i]);
    }

    // Last resort: never leave the page unstyled if activation was missed.
    window.setTimeout(function () {
      var pending = document.querySelectorAll('link[data-async-css="true"]');
      for (var j = 0; j < pending.length; j++) {
        activate(pending[j]);
      }
      removeFoucGuards();
    }, 2500);
  }

  activateAsyncStyles();
})();
