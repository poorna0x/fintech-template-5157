import type { PublicSiteKey } from '@/lib/websiteSiteKey';
import { getPublicSiteKey } from '@/lib/websiteSiteKey';
import {
  findBlogArticle,
  findLocationPage,
  findServicePage,
  resolveRouteSeo,
  type RouteSeo,
} from '@/lib/publicSeoPages';
import { buildLocationFaqJsonLd, getLocationSeo } from '@/data/locationSeo';

export type { RouteSeo };

export interface BrandSeoProfile {
  siteKey: PublicSiteKey;
  origin: string;
  brandName: string;
  legalName: string;
  defaultTitle: string;
  defaultDescription: string;
  keywords: string;
  ogImage: string;
  logoPath: string;
  phones: string[];
  primaryPhone: string;
  email: string;
  streetAddress: string;
  city: string;
  state: string;
  pincode: string;
  geo: { latitude: number; longitude: number };
}

const SHARED_SERVICE_AREAS =
  'Bengaluru, Bangalore, Whitefield, ITPL, Electronic City, Mysuru, Mangaluru, Hubballi, Belagavi, Tumakuru, Shivamogga, Hassan, Mandya, Davanagere, Ballari, Raichur, Kalaburagi, Bidar, Vijayapura, Bagalkote, Udupi, Karwar, Chikkamagaluru, Kodagu, Kolar, Ramanagara, Chikkaballapura, Chamarajanagar, Dakshina Kannada, Uttara Kannada, Vijayanagara, Gadag, Haveri, Koppal, Yadgir, Chitradurga, Dharwad';

const KARNATAKA_DISTRICTS = [
  'Bengaluru Urban', 'Bengaluru Rural', 'Mysuru', 'Dakshina Kannada', 'Udupi', 'Uttara Kannada',
  'Belagavi', 'Dharwad', 'Shivamogga', 'Tumakuru', 'Hassan', 'Mandya', 'Kodagu', 'Chikkamagaluru',
  'Chitradurga', 'Davanagere', 'Ballari', 'Vijayanagara', 'Raichur', 'Koppal', 'Kalaburagi', 'Bidar',
  'Yadgir', 'Vijayapura', 'Bagalkote', 'Gadag', 'Haveri', 'Ramanagara', 'Kolar', 'Chikkaballapura', 'Chamarajanagar',
];

const HYDROGEN_SEO: BrandSeoProfile = {
  siteKey: 'hydrogenro',
  origin: 'https://hydrogenro.com',
  brandName: 'Hydrogen RO',
  legalName: 'Hydrogen RO',
  defaultTitle: 'Hydrogen RO - #1 Best RO Service in Bengaluru Bangalore | 5★ Rated',
  defaultDescription:
    'Hydrogen RO - #1 best RO water purifier service in Bengaluru, Bangalore. 5★ rated with 2300+ reviews. Same-day RO installation, repair, maintenance and filter replacement across all Bangalore areas. Call +91-8884944288.',
  keywords:
    'Hydrogen RO, RO service Karnataka, RO service Bangalore, RO service Bengaluru, water purifier service Karnataka, RO repair Karnataka, RO installation Karnataka, RO AMC Karnataka, RO maintenance Karnataka, RO technician Karnataka, Kent RO service, Aquaguard service, Livpure service, Pureit service, AO Smith service, best RO service near me, RO service Mysuru, RO service Mangaluru, RO service Hubballi, RO service Belagavi, same day RO service Karnataka',
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
};

const ELEVEN_SEO: BrandSeoProfile = {
  siteKey: 'elevenro',
  origin: 'https://elevenro.com',
  brandName: 'Eleven RO',
  legalName: 'ELEVEN RO',
  defaultTitle: 'Eleven RO - Best RO Water Purifier Service in Bengaluru | Same-Day Service',
  defaultDescription:
    'Eleven RO - trusted RO water purifier service in Bengaluru, Karnataka. Professional RO installation, repair, maintenance and filter replacement. Same-day service across Bangalore including Anjanapura, JP Nagar, Bannerghatta and South Bangalore. Call +91-9880693311.',
  keywords:
    'Eleven RO, RO service Karnataka, RO service Bangalore, RO service Bengaluru, water purifier service Karnataka, RO repair Karnataka, RO installation Karnataka, RO AMC Karnataka, RO maintenance Karnataka, RO technician Karnataka, Kent RO service, Aquaguard service, Livpure service, Pureit service, AO Smith service, best RO service near me, RO service Anjanapura, RO service Mysuru, RO service Mangaluru, RO service Hubballi, same day RO service Eleven RO',
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
};

export function getPublicSiteOrigin(siteKey?: PublicSiteKey): string {
  const key = siteKey ?? getPublicSiteKey();
  return key === 'elevenro' ? 'https://elevenro.com' : 'https://hydrogenro.com';
}

export function getBrandSeoProfile(siteKey?: PublicSiteKey): BrandSeoProfile {
  const key = siteKey ?? getPublicSiteKey();
  return key === 'elevenro' ? ELEVEN_SEO : HYDROGEN_SEO;
}

function logoImageObject(profile: BrandSeoProfile) {
  return {
    '@type': 'ImageObject' as const,
    url: profile.logoPath,
    width: 512,
    height: 512,
    caption: profile.brandName,
  };
}

/** Shared LocalBusiness fields for per-page JSON-LD on public marketing pages. */
export function buildPublicLocalBusinessJsonLd(siteKey?: PublicSiteKey) {
  const profile = getBrandSeoProfile(siteKey);
  return {
    '@type': ['LocalBusiness', 'HomeAndConstructionBusiness'],
    '@id': `${profile.origin}/#localbusiness`,
    name: profile.brandName,
    image: profile.ogImage,
    logo: logoImageObject(profile),
    address: {
      '@type': 'PostalAddress',
      streetAddress: profile.streetAddress,
      addressLocality: profile.city,
      addressRegion: profile.state,
      postalCode: profile.pincode,
      addressCountry: 'IN',
    },
    telephone: profile.primaryPhone,
    email: profile.email,
    url: profile.origin,
    openingHours: 'Mo-Su 08:00-20:00',
    areaServed: {
      '@type': 'City',
      name: profile.city,
    },
  };
}

export const NO_INDEX_PREFIXES = [
  '/technician-id/',
  '/technician/',
  '/admin',
  '/dashboard',
  '/search',
  '/settings',
  '/calling',
  '/product-verify/',
  '/review/',
  '/accept/',
  '/c/',
];

const NO_INDEX_EXACT_PATHS = new Set(['/technician']);

export function shouldIndexPath(pathname: string): boolean {
  if (NO_INDEX_EXACT_PATHS.has(pathname)) return false;
  return !NO_INDEX_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function buildCanonicalUrl(pathname: string, siteKey?: PublicSiteKey): string {
  const origin = getPublicSiteOrigin(siteKey);
  if (pathname === '/' || pathname === '') return origin;
  const clean = pathname.replace(/\/$/, '').split('?')[0];
  return `${origin}${clean}`;
}

export function getRouteSeo(pathname: string, siteKey?: PublicSiteKey): RouteSeo {
  const key = siteKey ?? getPublicSiteKey();
  const profile = getBrandSeoProfile(key);
  return resolveRouteSeo(
    pathname,
    key,
    profile.brandName,
    profile.primaryPhone,
    profile.defaultTitle,
    profile.defaultDescription,
    profile.keywords
  );
}

function buildAreaServed(profile: BrandSeoProfile) {
  return [
    {
      '@type': 'State',
      name: profile.state,
      alternateName: 'KA',
    },
    ...KARNATAKA_DISTRICTS.map((district) => ({
      '@type': 'AdministrativeArea' as const,
      name: district,
      containedInPlace: { '@type': 'State' as const, name: profile.state },
    })),
    {
      '@type': 'City',
      name: profile.city,
      alternateName: 'Bangalore',
      containedInPlace: { '@type': 'State', name: profile.state, alternateName: 'KA' },
    },
    { '@type': 'AdministrativeArea', name: SHARED_SERVICE_AREAS },
  ];
}

export function buildLocalBusinessJsonLd(profile: BrandSeoProfile, pageUrl: string): object {
  return {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'HomeAndConstructionBusiness'],
    name: `${profile.brandName} - RO Water Purifier Service in Bengaluru`,
    description: profile.defaultDescription,
    url: profile.origin,
    '@id': `${profile.origin}/#localbusiness`,
    parentOrganization: { '@id': `${profile.origin}/#organization` },
    telephone: profile.primaryPhone,
    email: profile.email,
    image: profile.ogImage,
    logo: logoImageObject(profile),
    priceRange: '₹₹',
    currenciesAccepted: 'INR',
    paymentAccepted: 'Cash, Credit Card, UPI, Net Banking',
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
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        opens: '08:00',
        closes: '20:00',
      },
    ],
    areaServed: buildAreaServed(profile),
    sameAs: [profile.origin],
    potentialAction: {
      '@type': 'ReserveAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${profile.origin}/book`,
        actionPlatform: ['http://schema.org/DesktopWebPlatform', 'http://schema.org/MobileWebPlatform'],
      },
      result: { '@type': 'Reservation', name: 'RO Service Booking' },
    },
    makesOffer: [
      {
        '@type': 'Offer',
        name: 'RO Installation',
        description: 'Professional RO water purifier installation in Bengaluru',
        url: `${profile.origin}/ro-installation`,
      },
      {
        '@type': 'Offer',
        name: 'RO Repair',
        description: 'Expert RO water purifier repair and troubleshooting in Bengaluru',
        url: `${profile.origin}/ro-repair`,
      },
      {
        '@type': 'Offer',
        name: 'Filter Replacement',
        description: 'Genuine RO filter replacement and maintenance',
        url: `${profile.origin}/filter-replacement`,
      },
      {
        '@type': 'Offer',
        name: 'RO AMC',
        description: 'RO Annual Maintenance Contract across Karnataka',
        url: `${profile.origin}/ro-amc`,
      },
      {
        '@type': 'Offer',
        name: 'Commercial RO Service',
        description: 'Commercial RO plant service for offices and businesses',
        url: `${profile.origin}/commercial-ro-service`,
      },
    ],
    mainEntityOfPage: pageUrl,
  };
}

export function buildOrganizationJsonLd(profile: BrandSeoProfile): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${profile.origin}/#organization`,
    name: profile.brandName,
    legalName: profile.legalName,
    url: profile.origin,
    logo: logoImageObject(profile),
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
    contactPoint: profile.phones.map((phone) => ({
      '@type': 'ContactPoint',
      telephone: phone,
      contactType: 'customer service',
      areaServed: 'IN-KA',
      availableLanguage: ['English', 'Kannada', 'Hindi'],
    })),
    areaServed: buildAreaServed(profile),
  };
}

export function buildWebSiteJsonLd(profile: BrandSeoProfile): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: profile.brandName,
    url: profile.origin,
    description: profile.defaultDescription,
    publisher: {
      '@type': 'Organization',
      '@id': `${profile.origin}/#organization`,
      name: profile.brandName,
      logo: logoImageObject(profile),
    },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${profile.origin}/services?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function buildFaqJsonLd(profile: BrandSeoProfile): object {
  const brand = profile.brandName;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `What RO services does ${brand} offer in Bengaluru?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `${brand} provides RO installation, repair, filter replacement, AMC maintenance, water softener service and emergency same-day RO support across Bengaluru and Bangalore.`,
        },
      },
      {
        '@type': 'Question',
        name: `How do I book RO service with ${brand}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Book online at ${profile.origin}/book or call ${profile.primaryPhone}. Same-day RO service is available in most Bengaluru areas.`,
        },
      },
      {
        '@type': 'Question',
        name: `Which RO brands does ${brand} service?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `${brand} services all major RO brands including Kent, Aquaguard, Pureit, Livpure, Blue Star, Eureka Forbes, Havells, AO Smith, LG and Samsung in Bengaluru.`,
        },
      },
      {
        '@type': 'Question',
        name: `What areas in Karnataka does ${brand} cover?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `${brand} covers all Karnataka districts including Bengaluru, Mysuru, Mangaluru, Hubballi, Belagavi, Tumakuru, Hassan, Mandya, Davanagere, Ballari, Raichur, Kalaburagi, Bidar, Vijayapura, Udupi, Karwar, Chikkamagaluru, Kodagu and ${SHARED_SERVICE_AREAS}.`,
        },
      },
      {
        '@type': 'Question',
        name: `What is the contact number for ${brand} RO service?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Call ${profile.phones.join(' or ')} or email ${profile.email} for RO water purifier service in Bengaluru.`,
        },
      },
    ],
  };
}

export function buildBreadcrumbJsonLd(profile: BrandSeoProfile, pathname: string): object | null {
  if (pathname === '/' || pathname === '') return null;
  const segments = pathname.replace(/^\//, '').split('/').filter(Boolean);
  const items = [
    { '@type': 'ListItem', position: 1, name: profile.brandName, item: profile.origin },
  ];
  let path = '';
  segments.forEach((segment, index) => {
    path += `/${segment}`;
    const label = segment.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    items.push({
      '@type': 'ListItem',
      position: index + 2,
      name: label,
      item: `${profile.origin}${path}`,
    });
  });
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items,
  };
}

export function buildServiceJsonLd(
  profile: BrandSeoProfile,
  serviceName: string,
  description: string,
  pageUrl: string
): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `${serviceName} in Bengaluru`,
    description,
    url: pageUrl,
    provider: {
      '@type': ['LocalBusiness', 'HomeAndConstructionBusiness'],
      '@id': `${profile.origin}/#localbusiness`,
      name: profile.brandName,
      telephone: profile.primaryPhone,
      url: profile.origin,
    },
    areaServed: {
      '@type': 'City',
      name: 'Bengaluru',
      alternateName: 'Bangalore',
    },
    serviceType: 'RO Water Purifier Service',
  };
}

export function buildLocationServiceJsonLd(
  profile: BrandSeoProfile,
  areaName: string,
  pageUrl: string,
  locData?: ReturnType<typeof getLocationSeo>
): object {
  const pincode = locData?.pincode;
  const nearbySnippet = locData?.nearby.slice(0, 6).join(', ');
  const isBengaluru = locData?.region === 'Bengaluru';
  const placeName = isBengaluru ? `${areaName}, Bengaluru` : `${areaName}, Karnataka`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `RO Water Purifier Service in ${placeName}`,
    description: `Professional RO installation, repair, filter replacement and AMC in ${placeName} by ${profile.brandName}.${nearbySnippet ? ` Also serving ${nearbySnippet}.` : ''}`,
    url: pageUrl,
    provider: {
      '@type': ['LocalBusiness', 'HomeAndConstructionBusiness'],
      '@id': `${profile.origin}/#localbusiness`,
      name: profile.brandName,
      telephone: profile.primaryPhone,
      url: profile.origin,
      address: {
        '@type': 'PostalAddress',
        addressLocality: profile.city,
        addressRegion: profile.state,
        postalCode: profile.pincode,
        addressCountry: 'IN',
      },
    },
    areaServed: {
      '@type': 'Place',
      name: placeName,
      ...(locData?.district
        ? { containedInPlace: { '@type': 'AdministrativeArea', name: locData.district } }
        : {}),
      address: {
        '@type': 'PostalAddress',
        addressLocality: areaName,
        addressRegion: 'Karnataka',
        ...(pincode ? { postalCode: pincode } : {}),
        addressCountry: 'IN',
      },
    },
    serviceType: 'RO Water Purifier Service',
    offers: {
      '@type': 'Offer',
      price: '300',
      priceCurrency: 'INR',
      availability: 'https://schema.org/InStock',
      areaServed: { '@type': 'City', name: 'Bengaluru', alternateName: 'Bangalore' },
    },
  };
}

export function buildArticleJsonLd(
  profile: BrandSeoProfile,
  article: { title: string; slug: string; datePublished: string; category: string },
  pageUrl: string
): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: `${article.title}. Expert RO water purifier guide for Bengaluru from ${profile.brandName}.`,
    image: profile.ogImage,
    author: { '@type': 'Organization', name: profile.brandName },
    publisher: {
      '@type': 'Organization',
      name: profile.brandName,
      logo: logoImageObject(profile),
    },
    datePublished: article.datePublished,
    dateModified: article.datePublished,
    mainEntityOfPage: pageUrl,
    articleSection: article.category,
    keywords: `RO water purifier Bengaluru, ${article.category}, ${profile.brandName}`,
  };
}

export function buildPublicSiteJsonLd(siteKey: PublicSiteKey, pathname: string): object[] {
  const profile = getBrandSeoProfile(siteKey);
  const pageUrl = buildCanonicalUrl(pathname, siteKey);
  const schemas: object[] = [
    buildLocalBusinessJsonLd(profile, pageUrl),
    buildOrganizationJsonLd(profile),
    buildWebSiteJsonLd(profile),
  ];
  schemas.push(...buildRouteOnlyJsonLd(siteKey, pathname));
  return schemas;
}

export function buildRouteOnlyJsonLd(siteKey: PublicSiteKey, pathname: string): object[] {
  const profile = getBrandSeoProfile(siteKey);
  const pageUrl = buildCanonicalUrl(pathname, siteKey);
  const clean = pathname.replace(/\/$/, '') || '/';
  const schemas: object[] = [];

  const breadcrumb = buildBreadcrumbJsonLd(profile, pathname);
  if (breadcrumb) schemas.push(breadcrumb);

  const servicePage = findServicePage(clean);
  if (servicePage) {
    schemas.push(
      buildServiceJsonLd(profile, servicePage.serviceName, servicePage.shortDescription, pageUrl)
    );
    return schemas;
  }

  const locationPage = findLocationPage(clean);
  if (locationPage) {
    const slug = clean.replace(/^\//, '');
    const locData = getLocationSeo(slug);
    schemas.push(buildLocationServiceJsonLd(profile, locationPage.areaName, pageUrl, locData));
    if (locData) {
      schemas.push(buildLocationFaqJsonLd(locData, profile.brandName, profile.primaryPhone));
    }
    return schemas;
  }

  if (clean.startsWith('/blog/')) {
    const slug = clean.replace('/blog/', '');
    const article = findBlogArticle(slug);
    if (article) {
      schemas.push(buildArticleJsonLd(profile, article, pageUrl));
    }
  }

  return schemas;
}

export function upsertMetaByName(name: string, content: string): void {
  if (typeof document === 'undefined') return;
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function upsertMetaByProperty(property: string, content: string): void {
  if (typeof document === 'undefined') return;
  let el = document.querySelector(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', property);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function upsertLinkRel(rel: string, href: string): void {
  if (typeof document === 'undefined') return;
  const existing = document.querySelectorAll(`link[rel="${rel}"]`);
  existing.forEach((node) => node.remove());
  const link = document.createElement('link');
  link.setAttribute('rel', rel);
  link.setAttribute('href', href);
  document.head.appendChild(link);
}

const DYNAMIC_JSONLD_ID = 'dynamic-public-site-jsonld';

export function syncDynamicJsonLd(schemas: object[]): void {
  if (typeof document === 'undefined') return;
  document.querySelectorAll(`script[id^="${DYNAMIC_JSONLD_ID}"]`).forEach((node) => node.remove());
  schemas.forEach((schema, index) => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = `${DYNAMIC_JSONLD_ID}-${index}`;
    script.setAttribute('data-dynamic-seo', 'true');
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);
  });
}

function resolveDynamicJsonLd(siteKey: PublicSiteKey, pathname: string): object[] {
  const clean = pathname.replace(/\/$/, '') || '/';
  if (siteKey === 'elevenro') {
    return buildPublicSiteJsonLd(siteKey, pathname);
  }
  if (clean === '/') return [];
  return buildRouteOnlyJsonLd(siteKey, pathname);
}

export function applyPublicSiteSeo(pathname: string, siteKey?: PublicSiteKey): void {
  if (typeof document === 'undefined') return;
  const key = siteKey ?? getPublicSiteKey();
  const profile = getBrandSeoProfile(key);
  const route = getRouteSeo(pathname, key);
  const canonical = buildCanonicalUrl(pathname, key);
  const indexable = shouldIndexPath(pathname);

  document.title = route.title;
  upsertMetaByName('title', route.title);
  upsertMetaByName('description', route.description);
  upsertMetaByName('keywords', route.keywords ?? profile.keywords);
  upsertMetaByName('author', `${profile.brandName} - Water Purifier Services`);
  upsertMetaByName('robots', indexable ? 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1' : 'noindex, nofollow');
  upsertMetaByName('business:contact_data:phone_number', profile.primaryPhone);
  upsertMetaByName('business:contact_data:website', profile.origin);

  upsertMetaByProperty('og:type', 'website');
  upsertMetaByProperty('og:url', canonical);
  upsertMetaByProperty('og:title', route.title);
  upsertMetaByProperty('og:description', route.description);
  upsertMetaByProperty('og:image', profile.ogImage);
  upsertMetaByProperty('og:site_name', profile.brandName);
  upsertMetaByProperty('og:locale', 'en_IN');

  upsertMetaByName('twitter:card', 'summary_large_image');
  upsertMetaByName('twitter:url', canonical);
  upsertMetaByName('twitter:title', route.title);
  upsertMetaByName('twitter:description', route.description);
  upsertMetaByName('twitter:image', profile.ogImage);

  upsertMetaByName('apple-mobile-web-app-title', profile.brandName);
  upsertMetaByName('application-name', profile.brandName);

  if (indexable) {
    upsertLinkRel('canonical', canonical);
  } else {
    document.querySelectorAll('link[rel="canonical"]').forEach((node) => node.remove());
  }

  const dynamicSchemas = indexable ? resolveDynamicJsonLd(key, pathname) : [];
  syncDynamicJsonLd(dynamicSchemas);
}
