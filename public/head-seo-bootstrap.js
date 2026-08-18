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
      ogImage: 'https://hydrogenro.com/og-image.jpg', // TODO(seo): add a proper 1200x630 brand OG image (placeholder removed)
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
        'Eleven RO - trusted RO water purifier service in Bengaluru, Karnataka. Professional RO installation, repair, maintenance and filter replacement. Same-day service across Bangalore including Anjanapura, JP Nagar, Bannerghatta and South Bangalore. Call +91-9880693311.',
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

  function injectJsonLd(data, id, brandKey) {
    var script = document.createElement('script');
    script.type = 'application/ld+json';
    if (id) script.id = id;
    script.setAttribute('data-brand-seo', brandKey || detectSiteKey());
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
      var BENGALURU_LOCALITY_SLUGS = new Set(["adugodi","aecs-layout","agara","allalasandra","ambalipura","anjanapura","arekere","attibele","attur-layout","bagalur","banashankari","banaswadi","bannerghatta","basavanagudi","basaveshwaranagar","begur","bellandur","benniganahalli","benson-town","bharath-nagar","bilekahalli","bommanahalli","bommasandra","bommasandra-industrial-area","brookefield","btm-layout","budigere-cross","carmelaram","chamrajpet","chandapura","chickpet","chikkajala","cooke-town","cox-town","cv-raman-nagar","dasarahalli","doddaballapur-road","doddakannelli","doddanekundi","domlur","dommasandra","ejipura","electronic-city","frazer-town","ganganagar","girinagar","goraguntepalya","gottigere","graphite-india-road","hal","halasuru","haralur","hbr-layout","hebbal","hennur","hennur-road","hesaraghatta","hongasandra","hoodi","hope-farm","horamavu","hosa-road","hosur-road","hrbr-layout","hsr-layout","hulimavu","iblur","indiranagar","itpl","jakkur","jalahalli","jayanagar","jeevan-bima-nagar","jigani","jp-nagar","kacharakanahalli","kadubeesanahalli","kadugodi","kaggadasapura","kaikondrahalli","kalyan-nagar","kammanahalli","kannamangala","kasavanahalli","kasturi-nagar","kathriguppe","kempapura","kengeri","kodathi","kodigehalli","kogilu","konanakunte","koramangala","kr-puram","kudlu-gate","kumaraswamy-layout","kumbalgodu","kundalahalli","laggere","lingarajapuram","madiwala","magadi-road","mahadevapura","mahalakshmi-layout","majestic","malleshwaram","manyata-tech-park","marathahalli","munnekollal","murugeshpalya","mysore-road","nagarbhavi","nagarbhavi-2nd-stage","nagasandra","nagawara","nallurahalli","nandini-layout","nayandahalli","old-airport-road","outer-ring-road","padmanabhanagar","panathur","parappana-agrahara","peenya","pulakeshinagar","pulikeshi-nagar","rajajinagar","rajanukunte","ramamurthy-nagar","richmond-town","rr-nagar","rt-nagar","sadashivanagar","sahakar-nagar","sanjaynagar","sarakki","sarjapur","seegehalli","seshadripuram","silk-board","singasandra","sunkadakatte","thanisandra","thurahalli","tilak-nagar","tin-factory","ulsoor","uttarahalli","varthur","vidyapeeta","vijayanagar","whitefield","wilson-garden","wipro-gate","yelahanka","yelahanka-new-town","yeshwanthpur"]);
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
    // AUTO:CITY_SERVICE_TITLES
      var CITY_SERVICE_TITLES = {
        "/ro-installation-in-bengaluru": "RO Installation in Bengaluru",
        "/commercial-ro-plant-in-bengaluru": "Commercial RO Plant Installation in Bengaluru",
        "/water-softener-installation-in-bengaluru": "Water Softener Installation in Bengaluru",
        "/borewell-water-filter-in-bengaluru": "Borewell Water Filter in Bengaluru",
        "/apartment-water-softener-in-bengaluru": "Apartment Water Softener in Bengaluru",
        "/industrial-ro-plant-in-bengaluru": "Industrial RO Plant in Bengaluru",
        "/ro-amc-in-bengaluru": "RO AMC in Bengaluru",
        "/ro-installation-in-mysuru": "RO Installation in Mysuru",
        "/commercial-ro-plant-in-mysuru": "Commercial RO Plant Installation in Mysuru",
        "/water-softener-installation-in-mysuru": "Water Softener Installation in Mysuru",
        "/borewell-water-filter-in-mysuru": "Borewell Water Filter in Mysuru",
        "/apartment-water-softener-in-mysuru": "Apartment Water Softener in Mysuru",
        "/industrial-ro-plant-in-mysuru": "Industrial RO Plant in Mysuru",
        "/ro-amc-in-mysuru": "RO AMC in Mysuru",
        "/ro-installation-in-mangaluru": "RO Installation in Mangaluru",
        "/commercial-ro-plant-in-mangaluru": "Commercial RO Plant Installation in Mangaluru",
        "/water-softener-installation-in-mangaluru": "Water Softener Installation in Mangaluru",
        "/borewell-water-filter-in-mangaluru": "Borewell Water Filter in Mangaluru",
        "/apartment-water-softener-in-mangaluru": "Apartment Water Softener in Mangaluru",
        "/industrial-ro-plant-in-mangaluru": "Industrial RO Plant in Mangaluru",
        "/ro-amc-in-mangaluru": "RO AMC in Mangaluru",
        "/ro-installation-in-hubballi": "RO Installation in Hubballi",
        "/commercial-ro-plant-in-hubballi": "Commercial RO Plant Installation in Hubballi",
        "/water-softener-installation-in-hubballi": "Water Softener Installation in Hubballi",
        "/borewell-water-filter-in-hubballi": "Borewell Water Filter in Hubballi",
        "/apartment-water-softener-in-hubballi": "Apartment Water Softener in Hubballi",
        "/industrial-ro-plant-in-hubballi": "Industrial RO Plant in Hubballi",
        "/ro-amc-in-hubballi": "RO AMC in Hubballi",
        "/ro-installation-in-dharwad": "RO Installation in Dharwad",
        "/commercial-ro-plant-in-dharwad": "Commercial RO Plant Installation in Dharwad",
        "/water-softener-installation-in-dharwad": "Water Softener Installation in Dharwad",
        "/borewell-water-filter-in-dharwad": "Borewell Water Filter in Dharwad",
        "/apartment-water-softener-in-dharwad": "Apartment Water Softener in Dharwad",
        "/industrial-ro-plant-in-dharwad": "Industrial RO Plant in Dharwad",
        "/ro-amc-in-dharwad": "RO AMC in Dharwad",
        "/ro-installation-in-belagavi": "RO Installation in Belagavi",
        "/commercial-ro-plant-in-belagavi": "Commercial RO Plant Installation in Belagavi",
        "/water-softener-installation-in-belagavi": "Water Softener Installation in Belagavi",
        "/borewell-water-filter-in-belagavi": "Borewell Water Filter in Belagavi",
        "/apartment-water-softener-in-belagavi": "Apartment Water Softener in Belagavi",
        "/industrial-ro-plant-in-belagavi": "Industrial RO Plant in Belagavi",
        "/ro-amc-in-belagavi": "RO AMC in Belagavi",
        "/ro-installation-in-tumakuru": "RO Installation in Tumakuru",
        "/commercial-ro-plant-in-tumakuru": "Commercial RO Plant Installation in Tumakuru",
        "/water-softener-installation-in-tumakuru": "Water Softener Installation in Tumakuru",
        "/borewell-water-filter-in-tumakuru": "Borewell Water Filter in Tumakuru",
        "/apartment-water-softener-in-tumakuru": "Apartment Water Softener in Tumakuru",
        "/industrial-ro-plant-in-tumakuru": "Industrial RO Plant in Tumakuru",
        "/ro-amc-in-tumakuru": "RO AMC in Tumakuru",
        "/ro-installation-in-ramanagara": "RO Installation in Ramanagara",
        "/commercial-ro-plant-in-ramanagara": "Commercial RO Plant Installation in Ramanagara",
        "/water-softener-installation-in-ramanagara": "Water Softener Installation in Ramanagara",
        "/borewell-water-filter-in-ramanagara": "Borewell Water Filter in Ramanagara",
        "/apartment-water-softener-in-ramanagara": "Apartment Water Softener in Ramanagara",
        "/industrial-ro-plant-in-ramanagara": "Industrial RO Plant in Ramanagara",
        "/ro-amc-in-ramanagara": "RO AMC in Ramanagara",
        "/ro-installation-in-kolar": "RO Installation in Kolar",
        "/commercial-ro-plant-in-kolar": "Commercial RO Plant Installation in Kolar",
        "/water-softener-installation-in-kolar": "Water Softener Installation in Kolar",
        "/borewell-water-filter-in-kolar": "Borewell Water Filter in Kolar",
        "/apartment-water-softener-in-kolar": "Apartment Water Softener in Kolar",
        "/industrial-ro-plant-in-kolar": "Industrial RO Plant in Kolar",
        "/ro-amc-in-kolar": "RO AMC in Kolar",
        "/ro-installation-in-chikkaballapura": "RO Installation in Chikkaballapura",
        "/commercial-ro-plant-in-chikkaballapura": "Commercial RO Plant Installation in Chikkaballapura",
        "/water-softener-installation-in-chikkaballapura": "Water Softener Installation in Chikkaballapura",
        "/borewell-water-filter-in-chikkaballapura": "Borewell Water Filter in Chikkaballapura",
        "/apartment-water-softener-in-chikkaballapura": "Apartment Water Softener in Chikkaballapura",
        "/industrial-ro-plant-in-chikkaballapura": "Industrial RO Plant in Chikkaballapura",
        "/ro-amc-in-chikkaballapura": "RO AMC in Chikkaballapura",
        "/ro-installation-in-mandya": "RO Installation in Mandya",
        "/commercial-ro-plant-in-mandya": "Commercial RO Plant Installation in Mandya",
        "/water-softener-installation-in-mandya": "Water Softener Installation in Mandya",
        "/borewell-water-filter-in-mandya": "Borewell Water Filter in Mandya",
        "/apartment-water-softener-in-mandya": "Apartment Water Softener in Mandya",
        "/industrial-ro-plant-in-mandya": "Industrial RO Plant in Mandya",
        "/ro-amc-in-mandya": "RO AMC in Mandya",
        "/ro-installation-in-hassan": "RO Installation in Hassan",
        "/commercial-ro-plant-in-hassan": "Commercial RO Plant Installation in Hassan",
        "/water-softener-installation-in-hassan": "Water Softener Installation in Hassan",
        "/borewell-water-filter-in-hassan": "Borewell Water Filter in Hassan",
        "/apartment-water-softener-in-hassan": "Apartment Water Softener in Hassan",
        "/industrial-ro-plant-in-hassan": "Industrial RO Plant in Hassan",
        "/ro-amc-in-hassan": "RO AMC in Hassan",
        "/ro-installation-in-hosur": "RO Installation in Hosur",
        "/commercial-ro-plant-in-hosur": "Commercial RO Plant Installation in Hosur",
        "/water-softener-installation-in-hosur": "Water Softener Installation in Hosur",
        "/borewell-water-filter-in-hosur": "Borewell Water Filter in Hosur",
        "/apartment-water-softener-in-hosur": "Apartment Water Softener in Hosur",
        "/industrial-ro-plant-in-hosur": "Industrial RO Plant in Hosur",
        "/ro-amc-in-hosur": "RO AMC in Hosur",
        "/ro-installation-in-nelamangala": "RO Installation in Nelamangala",
        "/commercial-ro-plant-in-nelamangala": "Commercial RO Plant Installation in Nelamangala",
        "/water-softener-installation-in-nelamangala": "Water Softener Installation in Nelamangala",
        "/borewell-water-filter-in-nelamangala": "Borewell Water Filter in Nelamangala",
        "/apartment-water-softener-in-nelamangala": "Apartment Water Softener in Nelamangala",
        "/industrial-ro-plant-in-nelamangala": "Industrial RO Plant in Nelamangala",
        "/ro-amc-in-nelamangala": "RO AMC in Nelamangala",
        "/ro-installation-in-doddaballapur": "RO Installation in Doddaballapur",
        "/commercial-ro-plant-in-doddaballapur": "Commercial RO Plant Installation in Doddaballapur",
        "/water-softener-installation-in-doddaballapur": "Water Softener Installation in Doddaballapur",
        "/borewell-water-filter-in-doddaballapur": "Borewell Water Filter in Doddaballapur",
        "/apartment-water-softener-in-doddaballapur": "Apartment Water Softener in Doddaballapur",
        "/industrial-ro-plant-in-doddaballapur": "Industrial RO Plant in Doddaballapur",
        "/ro-amc-in-doddaballapur": "RO AMC in Doddaballapur",
        "/ro-installation-in-shivamogga": "RO Installation in Shivamogga",
        "/commercial-ro-plant-in-shivamogga": "Commercial RO Plant Installation in Shivamogga",
        "/water-softener-installation-in-shivamogga": "Water Softener Installation in Shivamogga",
        "/borewell-water-filter-in-shivamogga": "Borewell Water Filter in Shivamogga",
        "/apartment-water-softener-in-shivamogga": "Apartment Water Softener in Shivamogga",
        "/industrial-ro-plant-in-shivamogga": "Industrial RO Plant in Shivamogga",
        "/ro-amc-in-shivamogga": "RO AMC in Shivamogga",
        "/ro-installation-in-davanagere": "RO Installation in Davanagere",
        "/commercial-ro-plant-in-davanagere": "Commercial RO Plant Installation in Davanagere",
        "/water-softener-installation-in-davanagere": "Water Softener Installation in Davanagere",
        "/borewell-water-filter-in-davanagere": "Borewell Water Filter in Davanagere",
        "/apartment-water-softener-in-davanagere": "Apartment Water Softener in Davanagere",
        "/industrial-ro-plant-in-davanagere": "Industrial RO Plant in Davanagere",
        "/ro-amc-in-davanagere": "RO AMC in Davanagere",
        "/ro-installation-in-kalaburagi": "RO Installation in Kalaburagi",
        "/commercial-ro-plant-in-kalaburagi": "Commercial RO Plant Installation in Kalaburagi",
        "/water-softener-installation-in-kalaburagi": "Water Softener Installation in Kalaburagi",
        "/borewell-water-filter-in-kalaburagi": "Borewell Water Filter in Kalaburagi",
        "/apartment-water-softener-in-kalaburagi": "Apartment Water Softener in Kalaburagi",
        "/industrial-ro-plant-in-kalaburagi": "Industrial RO Plant in Kalaburagi",
        "/ro-amc-in-kalaburagi": "RO AMC in Kalaburagi",
        "/ro-installation-in-udupi": "RO Installation in Udupi",
        "/commercial-ro-plant-in-udupi": "Commercial RO Plant Installation in Udupi",
        "/water-softener-installation-in-udupi": "Water Softener Installation in Udupi",
        "/borewell-water-filter-in-udupi": "Borewell Water Filter in Udupi",
        "/apartment-water-softener-in-udupi": "Apartment Water Softener in Udupi",
        "/industrial-ro-plant-in-udupi": "Industrial RO Plant in Udupi",
        "/ro-amc-in-udupi": "RO AMC in Udupi",
        "/ro-installation-in-whitefield": "RO Installation in Whitefield, Bengaluru",
        "/commercial-ro-plant-in-whitefield": "Commercial RO Plant Installation in Whitefield, Bengaluru",
        "/water-softener-installation-in-whitefield": "Water Softener Installation in Whitefield, Bengaluru",
        "/borewell-water-filter-in-whitefield": "Borewell Water Filter in Whitefield, Bengaluru",
        "/apartment-water-softener-in-whitefield": "Apartment Water Softener in Whitefield, Bengaluru",
        "/industrial-ro-plant-in-whitefield": "Industrial RO Plant in Whitefield, Bengaluru",
        "/ro-amc-in-whitefield": "RO AMC in Whitefield, Bengaluru",
        "/ro-installation-in-marathahalli": "RO Installation in Marathahalli, Bengaluru",
        "/commercial-ro-plant-in-marathahalli": "Commercial RO Plant Installation in Marathahalli, Bengaluru",
        "/water-softener-installation-in-marathahalli": "Water Softener Installation in Marathahalli, Bengaluru",
        "/borewell-water-filter-in-marathahalli": "Borewell Water Filter in Marathahalli, Bengaluru",
        "/apartment-water-softener-in-marathahalli": "Apartment Water Softener in Marathahalli, Bengaluru",
        "/industrial-ro-plant-in-marathahalli": "Industrial RO Plant in Marathahalli, Bengaluru",
        "/ro-amc-in-marathahalli": "RO AMC in Marathahalli, Bengaluru",
        "/ro-installation-in-brookefield": "RO Installation in Brookefield, Bengaluru",
        "/commercial-ro-plant-in-brookefield": "Commercial RO Plant Installation in Brookefield, Bengaluru",
        "/water-softener-installation-in-brookefield": "Water Softener Installation in Brookefield, Bengaluru",
        "/borewell-water-filter-in-brookefield": "Borewell Water Filter in Brookefield, Bengaluru",
        "/apartment-water-softener-in-brookefield": "Apartment Water Softener in Brookefield, Bengaluru",
        "/industrial-ro-plant-in-brookefield": "Industrial RO Plant in Brookefield, Bengaluru",
        "/ro-amc-in-brookefield": "RO AMC in Brookefield, Bengaluru",
        "/ro-installation-in-mahadevapura": "RO Installation in Mahadevapura, Bengaluru",
        "/commercial-ro-plant-in-mahadevapura": "Commercial RO Plant Installation in Mahadevapura, Bengaluru",
        "/water-softener-installation-in-mahadevapura": "Water Softener Installation in Mahadevapura, Bengaluru",
        "/borewell-water-filter-in-mahadevapura": "Borewell Water Filter in Mahadevapura, Bengaluru",
        "/apartment-water-softener-in-mahadevapura": "Apartment Water Softener in Mahadevapura, Bengaluru",
        "/industrial-ro-plant-in-mahadevapura": "Industrial RO Plant in Mahadevapura, Bengaluru",
        "/ro-amc-in-mahadevapura": "RO AMC in Mahadevapura, Bengaluru",
        "/ro-installation-in-kr-puram": "RO Installation in KR Puram, Bengaluru",
        "/commercial-ro-plant-in-kr-puram": "Commercial RO Plant Installation in KR Puram, Bengaluru",
        "/water-softener-installation-in-kr-puram": "Water Softener Installation in KR Puram, Bengaluru",
        "/borewell-water-filter-in-kr-puram": "Borewell Water Filter in KR Puram, Bengaluru",
        "/apartment-water-softener-in-kr-puram": "Apartment Water Softener in KR Puram, Bengaluru",
        "/industrial-ro-plant-in-kr-puram": "Industrial RO Plant in KR Puram, Bengaluru",
        "/ro-amc-in-kr-puram": "RO AMC in KR Puram, Bengaluru",
        "/ro-installation-in-varthur": "RO Installation in Varthur, Bengaluru",
        "/commercial-ro-plant-in-varthur": "Commercial RO Plant Installation in Varthur, Bengaluru",
        "/water-softener-installation-in-varthur": "Water Softener Installation in Varthur, Bengaluru",
        "/borewell-water-filter-in-varthur": "Borewell Water Filter in Varthur, Bengaluru",
        "/apartment-water-softener-in-varthur": "Apartment Water Softener in Varthur, Bengaluru",
        "/industrial-ro-plant-in-varthur": "Industrial RO Plant in Varthur, Bengaluru",
        "/ro-amc-in-varthur": "RO AMC in Varthur, Bengaluru",
        "/ro-installation-in-bellandur": "RO Installation in Bellandur, Bengaluru",
        "/commercial-ro-plant-in-bellandur": "Commercial RO Plant Installation in Bellandur, Bengaluru",
        "/water-softener-installation-in-bellandur": "Water Softener Installation in Bellandur, Bengaluru",
        "/borewell-water-filter-in-bellandur": "Borewell Water Filter in Bellandur, Bengaluru",
        "/apartment-water-softener-in-bellandur": "Apartment Water Softener in Bellandur, Bengaluru",
        "/industrial-ro-plant-in-bellandur": "Industrial RO Plant in Bellandur, Bengaluru",
        "/ro-amc-in-bellandur": "RO AMC in Bellandur, Bengaluru",
        "/ro-installation-in-sarjapur": "RO Installation in Sarjapur, Bengaluru",
        "/commercial-ro-plant-in-sarjapur": "Commercial RO Plant Installation in Sarjapur, Bengaluru",
        "/water-softener-installation-in-sarjapur": "Water Softener Installation in Sarjapur, Bengaluru",
        "/borewell-water-filter-in-sarjapur": "Borewell Water Filter in Sarjapur, Bengaluru",
        "/apartment-water-softener-in-sarjapur": "Apartment Water Softener in Sarjapur, Bengaluru",
        "/industrial-ro-plant-in-sarjapur": "Industrial RO Plant in Sarjapur, Bengaluru",
        "/ro-amc-in-sarjapur": "RO AMC in Sarjapur, Bengaluru",
        "/ro-installation-in-electronic-city": "RO Installation in Electronic City, Bengaluru",
        "/commercial-ro-plant-in-electronic-city": "Commercial RO Plant Installation in Electronic City, Bengaluru",
        "/water-softener-installation-in-electronic-city": "Water Softener Installation in Electronic City, Bengaluru",
        "/borewell-water-filter-in-electronic-city": "Borewell Water Filter in Electronic City, Bengaluru",
        "/apartment-water-softener-in-electronic-city": "Apartment Water Softener in Electronic City, Bengaluru",
        "/industrial-ro-plant-in-electronic-city": "Industrial RO Plant in Electronic City, Bengaluru",
        "/ro-amc-in-electronic-city": "RO AMC in Electronic City, Bengaluru",
        "/ro-installation-in-hsr-layout": "RO Installation in HSR Layout, Bengaluru",
        "/commercial-ro-plant-in-hsr-layout": "Commercial RO Plant Installation in HSR Layout, Bengaluru",
        "/water-softener-installation-in-hsr-layout": "Water Softener Installation in HSR Layout, Bengaluru",
        "/borewell-water-filter-in-hsr-layout": "Borewell Water Filter in HSR Layout, Bengaluru",
        "/apartment-water-softener-in-hsr-layout": "Apartment Water Softener in HSR Layout, Bengaluru",
        "/industrial-ro-plant-in-hsr-layout": "Industrial RO Plant in HSR Layout, Bengaluru",
        "/ro-amc-in-hsr-layout": "RO AMC in HSR Layout, Bengaluru",
        "/ro-installation-in-jp-nagar": "RO Installation in JP Nagar, Bengaluru",
        "/commercial-ro-plant-in-jp-nagar": "Commercial RO Plant Installation in JP Nagar, Bengaluru",
        "/water-softener-installation-in-jp-nagar": "Water Softener Installation in JP Nagar, Bengaluru",
        "/borewell-water-filter-in-jp-nagar": "Borewell Water Filter in JP Nagar, Bengaluru",
        "/apartment-water-softener-in-jp-nagar": "Apartment Water Softener in JP Nagar, Bengaluru",
        "/industrial-ro-plant-in-jp-nagar": "Industrial RO Plant in JP Nagar, Bengaluru",
        "/ro-amc-in-jp-nagar": "RO AMC in JP Nagar, Bengaluru",
        "/ro-installation-in-jayanagar": "RO Installation in Jayanagar, Bengaluru",
        "/commercial-ro-plant-in-jayanagar": "Commercial RO Plant Installation in Jayanagar, Bengaluru",
        "/water-softener-installation-in-jayanagar": "Water Softener Installation in Jayanagar, Bengaluru",
        "/borewell-water-filter-in-jayanagar": "Borewell Water Filter in Jayanagar, Bengaluru",
        "/apartment-water-softener-in-jayanagar": "Apartment Water Softener in Jayanagar, Bengaluru",
        "/industrial-ro-plant-in-jayanagar": "Industrial RO Plant in Jayanagar, Bengaluru",
        "/ro-amc-in-jayanagar": "RO AMC in Jayanagar, Bengaluru",
        "/ro-installation-in-banashankari": "RO Installation in Banashankari, Bengaluru",
        "/commercial-ro-plant-in-banashankari": "Commercial RO Plant Installation in Banashankari, Bengaluru",
        "/water-softener-installation-in-banashankari": "Water Softener Installation in Banashankari, Bengaluru",
        "/borewell-water-filter-in-banashankari": "Borewell Water Filter in Banashankari, Bengaluru",
        "/apartment-water-softener-in-banashankari": "Apartment Water Softener in Banashankari, Bengaluru",
        "/industrial-ro-plant-in-banashankari": "Industrial RO Plant in Banashankari, Bengaluru",
        "/ro-amc-in-banashankari": "RO AMC in Banashankari, Bengaluru",
        "/ro-installation-in-btm-layout": "RO Installation in BTM Layout, Bengaluru",
        "/commercial-ro-plant-in-btm-layout": "Commercial RO Plant Installation in BTM Layout, Bengaluru",
        "/water-softener-installation-in-btm-layout": "Water Softener Installation in BTM Layout, Bengaluru",
        "/borewell-water-filter-in-btm-layout": "Borewell Water Filter in BTM Layout, Bengaluru",
        "/apartment-water-softener-in-btm-layout": "Apartment Water Softener in BTM Layout, Bengaluru",
        "/industrial-ro-plant-in-btm-layout": "Industrial RO Plant in BTM Layout, Bengaluru",
        "/ro-amc-in-btm-layout": "RO AMC in BTM Layout, Bengaluru",
        "/ro-installation-in-bannerghatta": "RO Installation in Bannerghatta Road, Bengaluru",
        "/commercial-ro-plant-in-bannerghatta": "Commercial RO Plant Installation in Bannerghatta Road, Bengaluru",
        "/water-softener-installation-in-bannerghatta": "Water Softener Installation in Bannerghatta Road, Bengaluru",
        "/borewell-water-filter-in-bannerghatta": "Borewell Water Filter in Bannerghatta Road, Bengaluru",
        "/apartment-water-softener-in-bannerghatta": "Apartment Water Softener in Bannerghatta Road, Bengaluru",
        "/industrial-ro-plant-in-bannerghatta": "Industrial RO Plant in Bannerghatta Road, Bengaluru",
        "/ro-amc-in-bannerghatta": "RO AMC in Bannerghatta Road, Bengaluru",
        "/ro-installation-in-kanakapura-road": "RO Installation in Kanakapura Road, Bengaluru",
        "/commercial-ro-plant-in-kanakapura-road": "Commercial RO Plant Installation in Kanakapura Road, Bengaluru",
        "/water-softener-installation-in-kanakapura-road": "Water Softener Installation in Kanakapura Road, Bengaluru",
        "/borewell-water-filter-in-kanakapura-road": "Borewell Water Filter in Kanakapura Road, Bengaluru",
        "/apartment-water-softener-in-kanakapura-road": "Apartment Water Softener in Kanakapura Road, Bengaluru",
        "/industrial-ro-plant-in-kanakapura-road": "Industrial RO Plant in Kanakapura Road, Bengaluru",
        "/ro-amc-in-kanakapura-road": "RO AMC in Kanakapura Road, Bengaluru",
        "/ro-installation-in-rr-nagar": "RO Installation in RR Nagar, Bengaluru",
        "/commercial-ro-plant-in-rr-nagar": "Commercial RO Plant Installation in RR Nagar, Bengaluru",
        "/water-softener-installation-in-rr-nagar": "Water Softener Installation in RR Nagar, Bengaluru",
        "/borewell-water-filter-in-rr-nagar": "Borewell Water Filter in RR Nagar, Bengaluru",
        "/apartment-water-softener-in-rr-nagar": "Apartment Water Softener in RR Nagar, Bengaluru",
        "/industrial-ro-plant-in-rr-nagar": "Industrial RO Plant in RR Nagar, Bengaluru",
        "/ro-amc-in-rr-nagar": "RO AMC in RR Nagar, Bengaluru",
        "/ro-installation-in-yelahanka": "RO Installation in Yelahanka, Bengaluru",
        "/commercial-ro-plant-in-yelahanka": "Commercial RO Plant Installation in Yelahanka, Bengaluru",
        "/water-softener-installation-in-yelahanka": "Water Softener Installation in Yelahanka, Bengaluru",
        "/borewell-water-filter-in-yelahanka": "Borewell Water Filter in Yelahanka, Bengaluru",
        "/apartment-water-softener-in-yelahanka": "Apartment Water Softener in Yelahanka, Bengaluru",
        "/industrial-ro-plant-in-yelahanka": "Industrial RO Plant in Yelahanka, Bengaluru",
        "/ro-amc-in-yelahanka": "RO AMC in Yelahanka, Bengaluru",
        "/ro-installation-in-hebbal": "RO Installation in Hebbal, Bengaluru",
        "/commercial-ro-plant-in-hebbal": "Commercial RO Plant Installation in Hebbal, Bengaluru",
        "/water-softener-installation-in-hebbal": "Water Softener Installation in Hebbal, Bengaluru",
        "/borewell-water-filter-in-hebbal": "Borewell Water Filter in Hebbal, Bengaluru",
        "/apartment-water-softener-in-hebbal": "Apartment Water Softener in Hebbal, Bengaluru",
        "/industrial-ro-plant-in-hebbal": "Industrial RO Plant in Hebbal, Bengaluru",
        "/ro-amc-in-hebbal": "RO AMC in Hebbal, Bengaluru",
        "/ro-installation-in-thanisandra": "RO Installation in Thanisandra, Bengaluru",
        "/commercial-ro-plant-in-thanisandra": "Commercial RO Plant Installation in Thanisandra, Bengaluru",
        "/water-softener-installation-in-thanisandra": "Water Softener Installation in Thanisandra, Bengaluru",
        "/borewell-water-filter-in-thanisandra": "Borewell Water Filter in Thanisandra, Bengaluru",
        "/apartment-water-softener-in-thanisandra": "Apartment Water Softener in Thanisandra, Bengaluru",
        "/industrial-ro-plant-in-thanisandra": "Industrial RO Plant in Thanisandra, Bengaluru",
        "/ro-amc-in-thanisandra": "RO AMC in Thanisandra, Bengaluru",
        "/ro-installation-in-hennur": "RO Installation in Hennur, Bengaluru",
        "/commercial-ro-plant-in-hennur": "Commercial RO Plant Installation in Hennur, Bengaluru",
        "/water-softener-installation-in-hennur": "Water Softener Installation in Hennur, Bengaluru",
        "/borewell-water-filter-in-hennur": "Borewell Water Filter in Hennur, Bengaluru",
        "/apartment-water-softener-in-hennur": "Apartment Water Softener in Hennur, Bengaluru",
        "/industrial-ro-plant-in-hennur": "Industrial RO Plant in Hennur, Bengaluru",
        "/ro-amc-in-hennur": "RO AMC in Hennur, Bengaluru",
        "/ro-installation-in-nagawara": "RO Installation in Nagawara, Bengaluru",
        "/commercial-ro-plant-in-nagawara": "Commercial RO Plant Installation in Nagawara, Bengaluru",
        "/water-softener-installation-in-nagawara": "Water Softener Installation in Nagawara, Bengaluru",
        "/borewell-water-filter-in-nagawara": "Borewell Water Filter in Nagawara, Bengaluru",
        "/apartment-water-softener-in-nagawara": "Apartment Water Softener in Nagawara, Bengaluru",
        "/industrial-ro-plant-in-nagawara": "Industrial RO Plant in Nagawara, Bengaluru",
        "/ro-amc-in-nagawara": "RO AMC in Nagawara, Bengaluru",
        "/ro-installation-in-jakkur": "RO Installation in Jakkur, Bengaluru",
        "/commercial-ro-plant-in-jakkur": "Commercial RO Plant Installation in Jakkur, Bengaluru",
        "/water-softener-installation-in-jakkur": "Water Softener Installation in Jakkur, Bengaluru",
        "/borewell-water-filter-in-jakkur": "Borewell Water Filter in Jakkur, Bengaluru",
        "/apartment-water-softener-in-jakkur": "Apartment Water Softener in Jakkur, Bengaluru",
        "/industrial-ro-plant-in-jakkur": "Industrial RO Plant in Jakkur, Bengaluru",
        "/ro-amc-in-jakkur": "RO AMC in Jakkur, Bengaluru",
        "/ro-installation-in-rajajinagar": "RO Installation in Rajajinagar, Bengaluru",
        "/commercial-ro-plant-in-rajajinagar": "Commercial RO Plant Installation in Rajajinagar, Bengaluru",
        "/water-softener-installation-in-rajajinagar": "Water Softener Installation in Rajajinagar, Bengaluru",
        "/borewell-water-filter-in-rajajinagar": "Borewell Water Filter in Rajajinagar, Bengaluru",
        "/apartment-water-softener-in-rajajinagar": "Apartment Water Softener in Rajajinagar, Bengaluru",
        "/industrial-ro-plant-in-rajajinagar": "Industrial RO Plant in Rajajinagar, Bengaluru",
        "/ro-amc-in-rajajinagar": "RO AMC in Rajajinagar, Bengaluru",
        "/ro-installation-in-vijayanagar": "RO Installation in Vijayanagar, Bengaluru",
        "/commercial-ro-plant-in-vijayanagar": "Commercial RO Plant Installation in Vijayanagar, Bengaluru",
        "/water-softener-installation-in-vijayanagar": "Water Softener Installation in Vijayanagar, Bengaluru",
        "/borewell-water-filter-in-vijayanagar": "Borewell Water Filter in Vijayanagar, Bengaluru",
        "/apartment-water-softener-in-vijayanagar": "Apartment Water Softener in Vijayanagar, Bengaluru",
        "/industrial-ro-plant-in-vijayanagar": "Industrial RO Plant in Vijayanagar, Bengaluru",
        "/ro-amc-in-vijayanagar": "RO AMC in Vijayanagar, Bengaluru",
        "/ro-installation-in-nagarbhavi": "RO Installation in Nagarbhavi, Bengaluru",
        "/commercial-ro-plant-in-nagarbhavi": "Commercial RO Plant Installation in Nagarbhavi, Bengaluru",
        "/water-softener-installation-in-nagarbhavi": "Water Softener Installation in Nagarbhavi, Bengaluru",
        "/borewell-water-filter-in-nagarbhavi": "Borewell Water Filter in Nagarbhavi, Bengaluru",
        "/apartment-water-softener-in-nagarbhavi": "Apartment Water Softener in Nagarbhavi, Bengaluru",
        "/industrial-ro-plant-in-nagarbhavi": "Industrial RO Plant in Nagarbhavi, Bengaluru",
        "/ro-amc-in-nagarbhavi": "RO AMC in Nagarbhavi, Bengaluru",
        "/ro-installation-in-kengeri": "RO Installation in Kengeri, Bengaluru",
        "/commercial-ro-plant-in-kengeri": "Commercial RO Plant Installation in Kengeri, Bengaluru",
        "/water-softener-installation-in-kengeri": "Water Softener Installation in Kengeri, Bengaluru",
        "/borewell-water-filter-in-kengeri": "Borewell Water Filter in Kengeri, Bengaluru",
        "/apartment-water-softener-in-kengeri": "Apartment Water Softener in Kengeri, Bengaluru",
        "/industrial-ro-plant-in-kengeri": "Industrial RO Plant in Kengeri, Bengaluru",
        "/ro-amc-in-kengeri": "RO AMC in Kengeri, Bengaluru",
        "/ro-installation-in-koramangala": "RO Installation in Koramangala, Bengaluru",
        "/commercial-ro-plant-in-koramangala": "Commercial RO Plant Installation in Koramangala, Bengaluru",
        "/water-softener-installation-in-koramangala": "Water Softener Installation in Koramangala, Bengaluru",
        "/borewell-water-filter-in-koramangala": "Borewell Water Filter in Koramangala, Bengaluru",
        "/apartment-water-softener-in-koramangala": "Apartment Water Softener in Koramangala, Bengaluru",
        "/industrial-ro-plant-in-koramangala": "Industrial RO Plant in Koramangala, Bengaluru",
        "/ro-amc-in-koramangala": "RO AMC in Koramangala, Bengaluru",
        "/ro-installation-in-indiranagar": "RO Installation in Indiranagar, Bengaluru",
        "/commercial-ro-plant-in-indiranagar": "Commercial RO Plant Installation in Indiranagar, Bengaluru",
        "/water-softener-installation-in-indiranagar": "Water Softener Installation in Indiranagar, Bengaluru",
        "/borewell-water-filter-in-indiranagar": "Borewell Water Filter in Indiranagar, Bengaluru",
        "/apartment-water-softener-in-indiranagar": "Apartment Water Softener in Indiranagar, Bengaluru",
        "/industrial-ro-plant-in-indiranagar": "Industrial RO Plant in Indiranagar, Bengaluru",
        "/ro-amc-in-indiranagar": "RO AMC in Indiranagar, Bengaluru",
        "/ro-installation-in-malleshwaram": "RO Installation in Malleshwaram, Bengaluru",
        "/commercial-ro-plant-in-malleshwaram": "Commercial RO Plant Installation in Malleshwaram, Bengaluru",
        "/water-softener-installation-in-malleshwaram": "Water Softener Installation in Malleshwaram, Bengaluru",
        "/borewell-water-filter-in-malleshwaram": "Borewell Water Filter in Malleshwaram, Bengaluru",
        "/apartment-water-softener-in-malleshwaram": "Apartment Water Softener in Malleshwaram, Bengaluru",
        "/industrial-ro-plant-in-malleshwaram": "Industrial RO Plant in Malleshwaram, Bengaluru",
        "/ro-amc-in-malleshwaram": "RO AMC in Malleshwaram, Bengaluru",
        "/ro-installation-in-bommanahalli": "RO Installation in Bommanahalli, Bengaluru",
        "/commercial-ro-plant-in-bommanahalli": "Commercial RO Plant Installation in Bommanahalli, Bengaluru",
        "/water-softener-installation-in-bommanahalli": "Water Softener Installation in Bommanahalli, Bengaluru",
        "/borewell-water-filter-in-bommanahalli": "Borewell Water Filter in Bommanahalli, Bengaluru",
        "/apartment-water-softener-in-bommanahalli": "Apartment Water Softener in Bommanahalli, Bengaluru",
        "/industrial-ro-plant-in-bommanahalli": "Industrial RO Plant in Bommanahalli, Bengaluru",
        "/ro-amc-in-bommanahalli": "RO AMC in Bommanahalli, Bengaluru",
        "/ro-installation-in-anjanapura": "RO Installation in Anjanapura, Bengaluru",
        "/commercial-ro-plant-in-anjanapura": "Commercial RO Plant Installation in Anjanapura, Bengaluru",
        "/water-softener-installation-in-anjanapura": "Water Softener Installation in Anjanapura, Bengaluru",
        "/borewell-water-filter-in-anjanapura": "Borewell Water Filter in Anjanapura, Bengaluru",
        "/apartment-water-softener-in-anjanapura": "Apartment Water Softener in Anjanapura, Bengaluru",
        "/industrial-ro-plant-in-anjanapura": "Industrial RO Plant in Anjanapura, Bengaluru",
        "/ro-amc-in-anjanapura": "RO AMC in Anjanapura, Bengaluru",
        "/ro-installation-in-attibele": "RO Installation in Attibele, Bengaluru",
        "/commercial-ro-plant-in-attibele": "Commercial RO Plant Installation in Attibele, Bengaluru",
        "/water-softener-installation-in-attibele": "Water Softener Installation in Attibele, Bengaluru",
        "/borewell-water-filter-in-attibele": "Borewell Water Filter in Attibele, Bengaluru",
        "/apartment-water-softener-in-attibele": "Apartment Water Softener in Attibele, Bengaluru",
        "/industrial-ro-plant-in-attibele": "Industrial RO Plant in Attibele, Bengaluru",
        "/ro-amc-in-attibele": "RO AMC in Attibele, Bengaluru",
        "/ro-installation-in-chandapura": "RO Installation in Chandapura, Bengaluru",
        "/commercial-ro-plant-in-chandapura": "Commercial RO Plant Installation in Chandapura, Bengaluru",
        "/water-softener-installation-in-chandapura": "Water Softener Installation in Chandapura, Bengaluru",
        "/borewell-water-filter-in-chandapura": "Borewell Water Filter in Chandapura, Bengaluru",
        "/apartment-water-softener-in-chandapura": "Apartment Water Softener in Chandapura, Bengaluru",
        "/industrial-ro-plant-in-chandapura": "Industrial RO Plant in Chandapura, Bengaluru",
        "/ro-amc-in-chandapura": "RO AMC in Chandapura, Bengaluru",
        "/ro-installation-in-yeshwanthpur": "RO Installation in Yeshwanthpur, Bengaluru",
        "/commercial-ro-plant-in-yeshwanthpur": "Commercial RO Plant Installation in Yeshwanthpur, Bengaluru",
        "/water-softener-installation-in-yeshwanthpur": "Water Softener Installation in Yeshwanthpur, Bengaluru",
        "/borewell-water-filter-in-yeshwanthpur": "Borewell Water Filter in Yeshwanthpur, Bengaluru",
        "/apartment-water-softener-in-yeshwanthpur": "Apartment Water Softener in Yeshwanthpur, Bengaluru",
        "/industrial-ro-plant-in-yeshwanthpur": "Industrial RO Plant in Yeshwanthpur, Bengaluru",
        "/ro-amc-in-yeshwanthpur": "RO AMC in Yeshwanthpur, Bengaluru",
        "/ro-installation-in-basavanagudi": "RO Installation in Basavanagudi, Bengaluru",
        "/commercial-ro-plant-in-basavanagudi": "Commercial RO Plant Installation in Basavanagudi, Bengaluru",
        "/water-softener-installation-in-basavanagudi": "Water Softener Installation in Basavanagudi, Bengaluru",
        "/borewell-water-filter-in-basavanagudi": "Borewell Water Filter in Basavanagudi, Bengaluru",
        "/apartment-water-softener-in-basavanagudi": "Apartment Water Softener in Basavanagudi, Bengaluru",
        "/industrial-ro-plant-in-basavanagudi": "Industrial RO Plant in Basavanagudi, Bengaluru",
        "/ro-amc-in-basavanagudi": "RO AMC in Basavanagudi, Bengaluru",
        "/ro-installation-in-kalyan-nagar": "RO Installation in Kalyan Nagar, Bengaluru",
        "/commercial-ro-plant-in-kalyan-nagar": "Commercial RO Plant Installation in Kalyan Nagar, Bengaluru",
        "/water-softener-installation-in-kalyan-nagar": "Water Softener Installation in Kalyan Nagar, Bengaluru",
        "/borewell-water-filter-in-kalyan-nagar": "Borewell Water Filter in Kalyan Nagar, Bengaluru",
        "/apartment-water-softener-in-kalyan-nagar": "Apartment Water Softener in Kalyan Nagar, Bengaluru",
        "/industrial-ro-plant-in-kalyan-nagar": "Industrial RO Plant in Kalyan Nagar, Bengaluru",
        "/ro-amc-in-kalyan-nagar": "RO AMC in Kalyan Nagar, Bengaluru",
        "/ro-installation-in-banaswadi": "RO Installation in Banaswadi, Bengaluru",
        "/commercial-ro-plant-in-banaswadi": "Commercial RO Plant Installation in Banaswadi, Bengaluru",
        "/water-softener-installation-in-banaswadi": "Water Softener Installation in Banaswadi, Bengaluru",
        "/borewell-water-filter-in-banaswadi": "Borewell Water Filter in Banaswadi, Bengaluru",
        "/apartment-water-softener-in-banaswadi": "Apartment Water Softener in Banaswadi, Bengaluru",
        "/industrial-ro-plant-in-banaswadi": "Industrial RO Plant in Banaswadi, Bengaluru",
        "/ro-amc-in-banaswadi": "RO AMC in Banaswadi, Bengaluru",
        "/ro-installation-in-sahakar-nagar": "RO Installation in Sahakar Nagar, Bengaluru",
        "/commercial-ro-plant-in-sahakar-nagar": "Commercial RO Plant Installation in Sahakar Nagar, Bengaluru",
        "/water-softener-installation-in-sahakar-nagar": "Water Softener Installation in Sahakar Nagar, Bengaluru",
        "/borewell-water-filter-in-sahakar-nagar": "Borewell Water Filter in Sahakar Nagar, Bengaluru",
        "/apartment-water-softener-in-sahakar-nagar": "Apartment Water Softener in Sahakar Nagar, Bengaluru",
        "/industrial-ro-plant-in-sahakar-nagar": "Industrial RO Plant in Sahakar Nagar, Bengaluru",
        "/ro-amc-in-sahakar-nagar": "RO AMC in Sahakar Nagar, Bengaluru"
      };
      // END:CITY_SERVICE_TITLES
    if (CITY_SERVICE_TITLES[clean]) {
      var cityServiceLabel = CITY_SERVICE_TITLES[clean];
      return {
        title: cityServiceLabel + ' | ' + profile.brandName,
        description: cityServiceLabel + ' by ' + profile.brandName + '. Same-day RO water purifier service across Karnataka. Call ' + profile.primaryPhone + '.',
        keywords: profile.keywords,
      };
    }
    var serviceTitles = {
      '/ro-installation': 'RO Installation in Bengaluru',
      '/ro-repair': 'RO Repair in Bengaluru',
      '/filter-replacement': 'RO Filter Replacement in Bengaluru',
      '/ro-maintenance': 'RO Maintenance in Bengaluru',
      '/water-softener': 'Water Softener Service in Bengaluru',
      '/water-softener-installation': 'New Water Softener Installation in Bengaluru',
      '/commercial-ro-25-lph': '25 LPH Commercial RO Plant Bengaluru',
      '/commercial-ro-50-lph': '50 LPH Commercial RO Plant Bengaluru',
      '/commercial-ro-500-lph': '500 LPH Commercial RO Plant Bengaluru',
      '/commercial-ro-1000-lph': '1000 LPH Commercial RO Plant Bengaluru',
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
      '/commercial-ro-service': 'Commercial 25 to 1000 LPH RO Plant Karnataka',
      '/industrial-ro-service': 'Industrial RO Service Karnataka',
      '/ro-annual-maintenance': 'RO Annual Maintenance Karnataka',
      '/membrane-replacement': 'RO Membrane Replacement Karnataka',
      '/ro-sanitization': 'RO Sanitization Karnataka',
      '/services': 'RO Services in Bengaluru',
      '/service-areas': 'RO Service Areas in Bengaluru',
      '/book': 'Book RO Service in Bengaluru',
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
    /^\/(technician-id|technician\/|technician$|admin|dashboard|search|settings|calling|product-verify|review|accept|c)(\/|$)/.test(
      pathForTest
    );
  var canonical = profile.origin + (p ? p : '');
  var routeSeo = resolveRouteSeo(profile, p ? p : '/');

  if (noIndex) {
    setMetaName('robots', 'noindex, nofollow');
    document.querySelectorAll('link[rel="canonical"]').forEach(function (node) {
      node.parentNode.removeChild(node);
    });
    return;
  }

  document.querySelectorAll('link[rel="canonical"]').forEach(function (node) {
    node.parentNode.removeChild(node);
  });
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
  setMetaName('geo.region', 'IN-KA');
  setMetaName('geo.placename', profile.city);
  setMetaName('geo.position', profile.geo.latitude + ';' + profile.geo.longitude);
  setMetaName('ICBM', profile.geo.latitude + ', ' + profile.geo.longitude);
  setMetaName('business:contact_data:street_address', profile.streetAddress);
  setMetaName('business:contact_data:locality', profile.city);
  setMetaName('business:contact_data:region', profile.state);
  setMetaName('business:contact_data:postal_code', profile.pincode);
  setMetaName('business:contact_data:country_name', 'India');
  setMetaName('business:contact_data:phone_number', profile.primaryPhone);
  setMetaName('business:contact_data:email', profile.email);
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
    if (hydrogenCrawler) {
      hydrogenCrawler.setAttribute('hidden', '');
      hydrogenCrawler.setAttribute('aria-hidden', 'true');
    }
  }

  function removeFoucGuards() {
    var el = document.getElementById('async-css-fouc-guards');
    if (el) el.remove();
  }

  function activateAsyncStyles() {
    var links = document.querySelectorAll('link[data-async-css="true"]');
    if (!links.length) {
      removeFoucGuards();
      return;
    }

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
