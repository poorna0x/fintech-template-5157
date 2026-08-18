import type { PublicSiteKey } from '@/lib/websiteSiteKey';
import { buildCityServicePageSeo, areaServicePageList, getCityServicePage } from '@/data/cityServiceSeo';
import { buildLocationKeywords, getLocationSeo, locationSeoList } from '@/data/locationSeo';

export interface RouteSeo {
  title: string;
  description: string;
  keywords?: string;
}

export interface SeoServicePage {
  path: string;
  serviceName: string;
  shortDescription: string;
}

export interface SeoLocationPage {
  path: string;
  areaName: string;
  localityType?: 'bangalore' | 'nearby';
}

export interface SeoCityServicePage {
  path: string;
  cityName: string;
  serviceName: string;
  shortDescription: string;
}

/** City × service landing pages (e.g. /ro-installation-in-mysuru). */
export const SEO_CITY_SERVICE_PAGES: SeoCityServicePage[] = areaServicePageList.map((page) => ({
  path: page.path,
  cityName: page.cityName,
  serviceName: page.serviceName,
  shortDescription: page.shortDescription,
}));

export interface SeoBlogArticle {
  slug: string;
  title: string;
  datePublished: string;
  category: string;
}

export const SEO_SERVICE_PAGES: SeoServicePage[] = [
  {
    path: '/ro-installation',
    serviceName: 'RO Installation',
    shortDescription: 'Professional RO water purifier installation in Bengaluru by certified technicians. Same-day setup for all major brands.',
  },
  {
    path: '/ro-repair',
    serviceName: 'RO Repair',
    shortDescription: 'Expert RO repair service in Bengaluru for all brands — fix leakage, motor, pump, membrane and electrical issues.',
  },
  {
    path: '/filter-replacement',
    serviceName: 'RO Filter Replacement',
    shortDescription: 'Genuine RO filter and membrane replacement in Bengaluru with original spare parts and warranty.',
  },
  {
    path: '/ro-maintenance',
    serviceName: 'RO Maintenance',
    shortDescription: 'Scheduled RO maintenance and sanitization in Bengaluru to keep your water purifier performing at its best.',
  },
  {
    path: '/water-softener',
    serviceName: 'Water Softener Service',
    shortDescription: 'New water softener installation, salt/resin service and repair in Bengaluru for hard borewell and tanker water in Karnataka homes and apartments.',
  },
  {
    path: '/ro-troubleshooting',
    serviceName: 'RO Troubleshooting',
    shortDescription: 'RO troubleshooting and diagnostic service in Bengaluru — identify and fix purifier problems quickly.',
  },
  {
    path: '/ro-spare-parts',
    serviceName: 'RO Spare Parts',
    shortDescription: 'Genuine RO spare parts supply in Bengaluru — filters, membranes, pumps and accessories for all brands.',
  },
  {
    path: '/ro-brands',
    serviceName: 'All RO Brands Service',
    shortDescription: 'Kent, Aquaguard, Pureit, Livpure, Blue Star and all RO brand service in Bengaluru.',
  },
  {
    path: '/ro-price-list',
    serviceName: 'RO Service Price List',
    shortDescription: 'Transparent RO service pricing in Bengaluru — installation, repair, AMC and filter replacement rates.',
  },
  {
    path: '/ro-warranty',
    serviceName: 'RO Warranty Service',
    shortDescription: 'RO warranty support and post-installation service in Bengaluru with genuine parts guarantee.',
  },
  {
    path: '/emergency-ro-repair',
    serviceName: 'Emergency RO Repair',
    shortDescription: '24/7 emergency RO repair in Bengaluru — urgent water purifier breakdown support across Bangalore.',
  },
  {
    path: '/same-day-ro-service',
    serviceName: 'Same Day RO Service',
    shortDescription: 'Same-day RO water purifier service in Bengaluru — book today for installation or repair.',
  },
  {
    path: '/ro-amc',
    serviceName: 'RO AMC',
    shortDescription: 'RO Annual Maintenance Contract (AMC) in Karnataka — scheduled filter replacement, sanitization and priority technician visits.',
  },
  {
    path: '/ro-service',
    serviceName: 'RO Service',
    shortDescription: 'Complete RO water purifier service in Karnataka — installation, repair, maintenance and filter replacement by certified technicians.',
  },
  {
    path: '/water-purifier-repair',
    serviceName: 'Water Purifier Repair',
    shortDescription: 'Expert water purifier and RO repair across Karnataka — fix leakage, motor, pump, membrane and electrical faults.',
  },
  {
    path: '/commercial-ro-service',
    serviceName: 'Commercial RO Service',
    shortDescription: 'Commercial RO plants from 25 LPH and 50 LPH up to 500 LPH and 1000 LPH — supply, installation, service and AMC for offices, restaurants, hotels, clinics and factories. Based in Bengaluru, we cover up to 250 km.',
  },
  {
    path: '/commercial-ro-25-lph',
    serviceName: '25 LPH Commercial RO Plant',
    shortDescription: '25 LPH commercial RO plant for small offices, clinics and pantries. Supply, installation, service and AMC from Bengaluru, up to 250 km.',
  },
  {
    path: '/commercial-ro-50-lph',
    serviceName: '50 LPH Commercial RO Plant',
    shortDescription: '50 LPH commercial RO plant for restaurants, larger offices and schools. Supply, installation, service and AMC from Bengaluru, up to 250 km.',
  },
  {
    path: '/commercial-ro-500-lph',
    serviceName: '500 LPH Commercial RO Plant',
    shortDescription: '500 LPH commercial RO plant for hotels, hostels, large offices and factories. Supply, installation, service and AMC from Bengaluru, up to 250 km.',
  },
  {
    path: '/commercial-ro-1000-lph',
    serviceName: '1000 LPH Commercial RO Plant',
    shortDescription: '1000 LPH commercial RO plant for large commercial sites, hospitals, apartment complexes and factories. Supply, installation, service and AMC from Bengaluru, up to 250 km.',
  },
  {
    path: '/water-softener-installation',
    serviceName: 'New Water Softener Installation',
    shortDescription: 'New water softener installation in Bengaluru for homes and apartments. Hard-water treatment, salt setup and after-sales service up to 250 km from the city.',
  },
  {
    path: '/industrial-ro-service',
    serviceName: 'Industrial RO Service',
    shortDescription: 'Industrial RO system service and maintenance for factories, hospitals and large facilities across Karnataka.',
  },
  {
    path: '/ro-annual-maintenance',
    serviceName: 'RO Annual Maintenance',
    shortDescription: 'RO annual maintenance plans in Karnataka with scheduled servicing, filter checks and performance optimization.',
  },
  {
    path: '/membrane-replacement',
    serviceName: 'Membrane Replacement',
    shortDescription: 'Genuine RO membrane replacement in Karnataka for Kent, Aquaguard, Pureit, Livpure and all major brands.',
  },
  {
    path: '/ro-sanitization',
    serviceName: 'RO Sanitization',
    shortDescription: 'Professional RO tank and pipeline sanitization in Karnataka to ensure safe, bacteria-free drinking water.',
  },
];

/** Derived from locationSeoList — single source of truth for location routes. */
export const SEO_LOCATION_PAGES: SeoLocationPage[] = locationSeoList.map((loc) => ({
  path: `/${loc.slug}`,
  areaName: loc.name,
  localityType: loc.region === 'Bengaluru' ? 'bangalore' : 'nearby',
}));

export const SEO_BLOG_ARTICLES: SeoBlogArticle[] = [
  {
    slug: 'maintain-ro-purifier-home-guide',
    title: 'How to Maintain Your RO Purifier at Home - Complete Guide',
    datePublished: '2025-01-20',
    category: 'Maintenance',
  },
  {
    slug: 'ro-vs-uv-vs-uf-bengaluru-water',
    title: 'RO vs UV vs UF Water Purifiers - Which is Best for Bengaluru Water?',
    datePublished: '2025-01-15',
    category: 'Comparison',
  },
  {
    slug: 'water-softeners-important-karnataka-homes',
    title: 'Why Water Softeners are Important in Karnataka Homes',
    datePublished: '2025-01-10',
    category: 'Water Treatment',
  },
  {
    slug: 'ro-filter-replacement-schedule-bengaluru',
    title: 'RO Filter Replacement Schedule for Bengaluru Water Quality',
    datePublished: '2025-01-05',
    category: 'Maintenance',
  },
  {
    slug: '10-signs-ro-purifier-needs-repair',
    title: '10 Signs Your RO Purifier Needs Repair - Bengaluru Guide',
    datePublished: '2024-12-28',
    category: 'Repair',
  },
  {
    slug: 'best-ro-water-purifier-brands-bengaluru-2025',
    title: 'Best RO Water Purifier Brands in Bengaluru 2025',
    datePublished: '2024-12-20',
    category: 'Buying Guide',
  },
];

const STATIC_PAGE_SEO: Record<string, Partial<Record<PublicSiteKey, RouteSeo>>> = {
  '/services': {
    hydrogenro: {
      title: 'RO Services in Bengaluru | Installation, Repair & Maintenance | Hydrogen RO',
      description:
        'RO, commercial 25/50/500/1000 LPH plants and new water softener installation by Hydrogen RO — Bengaluru and up to 250 km. Same-day service.',
      keywords: 'RO services Bengaluru, commercial RO 25 LPH, 50 LPH RO plant Bangalore, 500 LPH RO plant, 1000 LPH RO plant Karnataka, new water softener installation Bangalore, water softener service Bangalore',
    },
    elevenro: {
      title: 'RO Services in Bengaluru | Installation, Repair & Maintenance | Eleven RO',
      description:
        'Complete RO water purifier services in Bengaluru by Eleven RO — installation, repair, filter replacement, AMC and emergency support. Same-day service.',
      keywords: 'Eleven RO services, RO installation Bengaluru, RO repair Bangalore, RO AMC Anjanapura',
    },
  },
  '/service-areas': {
    hydrogenro: {
      title: 'RO Service Areas in Bengaluru | All Localities Covered | Hydrogen RO',
      description:
        'Hydrogen RO serves all areas of Bengaluru and Bangalore — Whitefield, Electronic City, BTM, HSR, Koramangala, Hebbal, Sarjapur, Tumakuru and more.',
    },
    elevenro: {
      title: 'RO Service Areas in Bengaluru | South & Central Bangalore | Eleven RO',
      description:
        'Eleven RO provides RO service across Bengaluru including Anjanapura, JP Nagar, Bannerghatta, Electronic City, BTM, HSR, Koramangala and all major localities.',
    },
  },
  '/book': {
    hydrogenro: {
      title: 'Book RO, Commercial Plant or Softener Service | Hydrogen RO',
      description: 'Book home RO, commercial 25/50/500/1000 LPH plant or new water softener installation. Bengaluru and up to 250 km. Call +91-8884944288.',
    },
    elevenro: {
      title: 'Book RO Service in Bengaluru | Same-Day Booking | Eleven RO',
      description: 'Book RO water purifier service online in Bengaluru with Eleven RO. Same-day installation, repair and maintenance. Call 9880693311.',
    },
  },
  '/contact': {
    hydrogenro: {
      title: 'Contact Hydrogen RO | RO Service Bengaluru | +91-8884944288',
      description: 'Contact Hydrogen RO for RO water purifier service in Bengaluru. Phone, WhatsApp and email support. Same-day RO installation and repair.',
    },
    elevenro: {
      title: 'Contact Eleven RO | RO Service Bengaluru | 9880693311',
      description: 'Contact Eleven RO for RO water purifier service in Bengaluru. Phone, WhatsApp and email support. Same-day RO installation and repair.',
    },
  },
  '/about': {
    hydrogenro: {
      title: 'About Hydrogen RO | Trusted RO Service Provider in Bengaluru',
      description: 'Learn about Hydrogen RO — Bengaluru\'s trusted RO water purifier service provider with certified technicians and 2300+ happy customers.',
    },
    elevenro: {
      title: 'About Eleven RO | Trusted RO Service Provider in Bengaluru',
      description: 'Learn about Eleven RO — professional RO water purifier service in Bengaluru with certified technicians and same-day support.',
    },
  },
  '/blog': {
    hydrogenro: {
      title: 'RO Water Purifier Blog | Tips & Guides | Hydrogen RO Bengaluru',
      description: 'Expert RO water purifier tips, maintenance guides and buying advice for Bengaluru homes from Hydrogen RO.',
    },
    elevenro: {
      title: 'RO Water Purifier Blog | Tips & Guides | Eleven RO Bengaluru',
      description: 'Expert RO water purifier tips, maintenance guides and buying advice for Bengaluru homes from Eleven RO.',
    },
  },
  '/spare-parts': {
    hydrogenro: {
      title: 'RO Spare Parts in Bengaluru | Genuine Filters & Membranes | Hydrogen RO',
      description: 'Buy genuine RO spare parts in Bengaluru — pre-filter, carbon filter, RO membrane, pump and UV lamp for all brands. Hydrogen RO.',
    },
    elevenro: {
      title: 'RO Spare Parts in Bengaluru | Genuine Filters & Membranes | Eleven RO',
      description: 'Buy genuine RO spare parts in Bengaluru — pre-filter, carbon filter, RO membrane, pump and UV lamp for all brands. Eleven RO.',
    },
  },
  '/warranty': {
    hydrogenro: {
      title: 'RO Warranty & AMC Plans Bengaluru | Hydrogen RO',
      description: 'RO warranty support and Annual Maintenance Contract (AMC) plans in Bengaluru by Hydrogen RO. Filter replacement and servicing included.',
    },
    elevenro: {
      title: 'RO Warranty & AMC Plans Bengaluru | Eleven RO',
      description: 'RO warranty support and Annual Maintenance Contract (AMC) plans in Bengaluru by Eleven RO. Filter replacement and servicing included.',
    },
  },
  '/privacy-policy': {
    hydrogenro: { title: 'Privacy Policy | Hydrogen RO', description: 'Privacy policy for Hydrogen RO water purifier services in Bengaluru.' },
    elevenro: { title: 'Privacy Policy | Eleven RO', description: 'Privacy policy for Eleven RO water purifier services in Bengaluru.' },
  },
  '/terms-of-service': {
    hydrogenro: { title: 'Terms of Service | Hydrogen RO', description: 'Terms of service for Hydrogen RO water purifier services in Bengaluru.' },
    elevenro: { title: 'Terms of Service | Eleven RO', description: 'Terms of service for Eleven RO water purifier services in Bengaluru.' },
  },
  '/refund-policy': {
    hydrogenro: { title: 'Refund Policy | Hydrogen RO', description: 'Refund policy for Hydrogen RO water purifier services in Bengaluru.' },
    elevenro: { title: 'Refund Policy | Eleven RO', description: 'Refund policy for Eleven RO water purifier services in Bengaluru.' },
  },
  '/cookie-policy': {
    hydrogenro: { title: 'Cookie Policy | Hydrogen RO', description: 'Cookie policy for Hydrogen RO website visitors.' },
    elevenro: { title: 'Cookie Policy | Eleven RO', description: 'Cookie policy for Eleven RO website visitors.' },
  },
  '/disclaimer': {
    hydrogenro: { title: 'Disclaimer | Hydrogen RO', description: 'Disclaimer for Hydrogen RO water purifier services website.' },
    elevenro: { title: 'Disclaimer | Eleven RO', description: 'Disclaimer for Eleven RO water purifier services website.' },
  },
};

export function findCityServicePage(pathname: string): SeoCityServicePage | undefined {
  const clean = pathname.replace(/\/$/, '') || '/';
  return SEO_CITY_SERVICE_PAGES.find((page) => page.path === clean);
}

export function findServicePage(pathname: string): SeoServicePage | undefined {
  const clean = pathname.replace(/\/$/, '') || '/';
  return SEO_SERVICE_PAGES.find((page) => page.path === clean);
}

export function findLocationPage(pathname: string): SeoLocationPage | undefined {
  const clean = pathname.replace(/\/$/, '') || '/';
  return SEO_LOCATION_PAGES.find((page) => page.path === clean);
}

export function findBlogArticle(slug: string): SeoBlogArticle | undefined {
  return SEO_BLOG_ARTICLES.find((article) => article.slug === slug);
}

export function buildServicePageSeo(
  page: SeoServicePage,
  brandName: string,
  primaryPhone: string
): RouteSeo {
  const isCommercial = page.path.includes('commercial');
  const isSoftener = page.path.includes('softener');
  const extraKeywords = isCommercial
    ? `25 LPH RO plant Bangalore, 50 LPH RO plant Bangalore, 500 LPH RO plant, 1000 LPH RO plant Karnataka, commercial RO plant Bengaluru, RO plant 250 km Bengaluru, ${page.serviceName} Bangalore`
    : isSoftener
      ? `new water softener installation Bangalore, water softener service Bengaluru, apartment water softener Karnataka, ${page.serviceName} Bangalore`
      : `RO water purifier ${page.serviceName.toLowerCase()}`;
  return {
    title: `${page.serviceName} in Karnataka | Bengaluru & All Districts | ${brandName}`,
    description: `${page.shortDescription} Serving Bengaluru, Bangalore and all Karnataka districts. Book with ${brandName}. Call ${primaryPhone}.`,
    keywords: `${page.serviceName} Karnataka, ${page.serviceName} Bangalore, ${page.serviceName} Bengaluru, ${extraKeywords}, Kent RO service Karnataka, Aquaguard service Karnataka, ${brandName}`,
  };
}

function locationPlaceLabel(locData: NonNullable<ReturnType<typeof getLocationSeo>>): string {
  if (locData.region === 'Bengaluru') return `${locData.name}, Bengaluru`;
  if (locData.region === 'Karnataka') return `${locData.name}, Karnataka`;
  return locData.name;
}

function locationTitleSuffix(locData: NonNullable<ReturnType<typeof getLocationSeo>>): string {
  if (locData.region === 'Bengaluru') return 'Bengaluru';
  return 'Karnataka';
}

export function buildLocationPageSeo(
  page: SeoLocationPage,
  brandName: string,
  primaryPhone: string
): RouteSeo {
  const area = page.areaName;
  const slug = page.path.replace(/^\//, '');
  const locData = getLocationSeo(slug);
  if (locData) {
    const nearbySnippet = locData.nearby.slice(0, 6).join(', ');
    const suffix = locationTitleSuffix(locData);
    const place = locationPlaceLabel(locData);
    const districtNote = locData.district ? ` ${locData.district} district.` : '';
    return {
      title: `RO Service in ${area} ${suffix} | Installation & Repair | ${brandName}`,
      description: `Best RO water purifier service in ${place} by ${brandName}. Same-day RO installation, repair, filter replacement and AMC.${districtNote}${nearbySnippet ? ` Serving ${nearbySnippet}.` : ''} Call ${primaryPhone}.`,
      keywords: buildLocationKeywords(locData, brandName),
    };
  }
  return {
    title: `RO Service in ${area} Bengaluru | Installation & Repair | ${brandName}`,
    description: `Best RO water purifier service in ${area}, Bengaluru by ${brandName}. Same-day RO installation, repair, filter replacement and AMC. Call ${primaryPhone}.`,
    keywords: `RO service ${area}, RO repair ${area} Bangalore, RO installation ${area} Bengaluru, ${brandName} ${area}`,
  };
}

export function resolveRouteSeo(
  pathname: string,
  siteKey: PublicSiteKey,
  brandName: string,
  primaryPhone: string,
  defaultTitle: string,
  defaultDescription: string,
  defaultKeywords: string
): RouteSeo {
  const clean = pathname.replace(/\/$/, '') || '/';

  if (clean === '/') {
    return { title: defaultTitle, description: defaultDescription, keywords: defaultKeywords };
  }

  const staticPage = STATIC_PAGE_SEO[clean]?.[siteKey];
  if (staticPage?.title) {
    return {
      title: staticPage.title,
      description: staticPage.description ?? defaultDescription,
      keywords: staticPage.keywords ?? defaultKeywords,
    };
  }

  const servicePage = findServicePage(clean);
  if (servicePage) return buildServicePageSeo(servicePage, brandName, primaryPhone);

  const cityServicePage = getCityServicePage(clean);
  if (cityServicePage) return buildCityServicePageSeo(cityServicePage, brandName, primaryPhone);

  const locationPage = findLocationPage(clean);
  if (locationPage) return buildLocationPageSeo(locationPage, brandName, primaryPhone);

  if (clean.startsWith('/blog/')) {
    const slug = clean.replace('/blog/', '');
    const article = findBlogArticle(slug);
    if (article) {
      return {
        title: `${article.title} | ${brandName} Blog`,
        description: `${article.title}. Expert RO water purifier tips for Bengaluru homes. Read on ${brandName} blog.`,
        keywords: `${article.category}, RO water purifier Bengaluru, ${brandName} blog`,
      };
    }
    return {
      title: `RO Water Purifier Guide | ${brandName} Blog`,
      description: `Expert RO water purifier tips and guides for Bengaluru from ${brandName}.`,
    };
  }

  return { title: defaultTitle, description: defaultDescription, keywords: defaultKeywords };
}

export function getAllIndexablePaths(): string[] {
  const paths = new Set<string>([
    '/',
    '/services',
    '/service-areas',
    '/book',
    '/about',
    '/contact',
    '/blog',
    '/spare-parts',
    '/warranty',
    '/privacy-policy',
    '/terms-of-service',
    '/refund-policy',
    '/cookie-policy',
    '/disclaimer',
  ]);
  SEO_SERVICE_PAGES.forEach((p) => paths.add(p.path));
  SEO_CITY_SERVICE_PAGES.forEach((p) => paths.add(p.path));
  SEO_LOCATION_PAGES.forEach((p) => paths.add(p.path));
  SEO_BLOG_ARTICLES.forEach((a) => paths.add(`/blog/${a.slug}`));
  return [...paths];
}
