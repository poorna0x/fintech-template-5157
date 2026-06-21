import type { PublicSiteKey } from '@/lib/websiteSiteKey';
import { getPublicSiteKey } from '@/lib/websiteSiteKey';
import {
  findBlogArticle,
  findLocationPage,
  findServicePage,
  resolveRouteSeo,
  type RouteSeo,
} from '@/lib/publicSeoPages';

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
  'Whitefield, Electronic City, Electronic City Phase 1, Electronic City Phase 2, Bommanahalli, Bommasandra, Sarjapur, Sarjapur Road, Attibele, Chandapura, Jigani, Anekal, Singasandra, Hosur Road, Silk Board, BTM Layout, HSR Layout, Koramangala, Indiranagar, Marathahalli, Jayanagar, Malleshwaram, Hebbal, Yelahanka, Bellandur, JP Nagar, Banashankari, Anjanapura, Tumakuru, Nelamangala, Devanahalli';

const HYDROGEN_SEO: BrandSeoProfile = {
  siteKey: 'hydrogenro',
  origin: 'https://hydrogenro.com',
  brandName: 'Hydrogen RO',
  legalName: 'Hydrogen RO',
  defaultTitle: 'Hydrogen RO - #1 Best RO Service in Bengaluru Bangalore | 5★ Rated',
  defaultDescription:
    'Hydrogen RO - #1 best RO water purifier service in Bengaluru, Bangalore. 5★ rated with 2300+ reviews. Same-day RO installation, repair, maintenance and filter replacement across all Bangalore areas. Call +91-8884944288.',
  keywords:
    'Hydrogen RO, best RO service Bengaluru, RO water purifier service Bangalore, RO installation Bengaluru, RO repair Bangalore, RO service Electronic City, RO service Bommanahalli, RO service Sarjapur, RO service Attibele, RO service Chandapura, RO service Bommasandra, RO service Jigani, RO service Hosur Road, RO service Silk Board, RO service Sarjapur Road, RO service Bellandur, RO service HSR Layout, RO service Anekal, RO service Singasandra, RO service Electronic City Phase 1, RO service Electronic City Phase 2, water softener Bangalore, RO maintenance Bengaluru, same day RO service South Bangalore',
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
    'Eleven RO - trusted RO water purifier service in Bengaluru, Karnataka. Professional RO installation, repair, maintenance and filter replacement. Same-day service across Bangalore including Anjanapura, JP Nagar, Bannerghatta and South Bangalore. Call 9880693311.',
  keywords:
    'Eleven RO, Eleven RO service Bengaluru, RO water purifier Bangalore, RO service Electronic City, RO service Bommanahalli, RO service Sarjapur, RO service Attibele, RO service Chandapura, RO service Bommasandra, RO service Jigani, RO service Hosur Road, RO service Silk Board, RO installation Anjanapura, RO repair South Bangalore, RO maintenance Karnataka, same day RO service Eleven RO, Kent Aquaguard RO service Bangalore',
  ogImage: 'https://elevenro.com/og-image.jpg',
  logoPath: 'https://elevenro.com/fulllogo.png',
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

export const NO_INDEX_PREFIXES = [
  '/technician-id/',
  '/technician/',
  '/technician/login',
  '/admin',
  '/dashboard',
  '/search',
  '/settings',
  '/calling',
  '/product-verify/',
];

export function shouldIndexPath(pathname: string): boolean {
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
    '@type': 'LocalBusiness',
    name: `${profile.brandName} - RO Water Purifier Service in Bengaluru`,
    description: profile.defaultDescription,
    url: profile.origin,
    '@id': `${profile.origin}/#localbusiness`,
    telephone: profile.primaryPhone,
    email: profile.email,
    image: profile.ogImage,
    logo: profile.logoPath,
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
    ],
    mainEntityOfPage: pageUrl,
  };
}

export function buildOrganizationJsonLd(profile: BrandSeoProfile): object {
  return {
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
    publisher: { '@type': 'Organization', name: profile.brandName, logo: profile.logoPath },
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
        name: `What areas in Bangalore does ${brand} cover?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `${brand} covers ${SHARED_SERVICE_AREAS} and all major pincodes across Bengaluru, Karnataka.`,
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
      '@type': 'LocalBusiness',
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
  pageUrl: string
): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `RO Water Purifier Service in ${areaName}, Bengaluru`,
    description: `Professional RO installation, repair and maintenance in ${areaName}, Bengaluru by ${profile.brandName}.`,
    url: pageUrl,
    provider: {
      '@type': 'LocalBusiness',
      name: profile.brandName,
      telephone: profile.primaryPhone,
      url: profile.origin,
    },
    areaServed: {
      '@type': 'Place',
      name: `${areaName}, Bengaluru`,
      address: {
        '@type': 'PostalAddress',
        addressLocality: areaName,
        addressRegion: 'Karnataka',
        addressCountry: 'IN',
      },
    },
    serviceType: 'RO Water Purifier Service',
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
      logo: { '@type': 'ImageObject', url: profile.logoPath },
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
    buildFaqJsonLd(profile),
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
    schemas.push(buildLocationServiceJsonLd(profile, locationPage.areaName, pageUrl));
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
