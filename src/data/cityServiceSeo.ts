/** City × service landing pages for high-intent Karnataka SEO (e.g. RO Installation in Mysuru). */

export type SeoCityTier = 1 | 2 | 3;

export interface PriorityCity {
  slug: string;
  name: string;
  tier: SeoCityTier;
  district: string;
  alternateNames?: string[];
}

/** Tier 1–3 cities — matches business priority for statewide SEO. */
export const PRIORITY_CITIES: PriorityCity[] = [
  { slug: 'bengaluru', name: 'Bengaluru', tier: 1, district: 'Bengaluru Urban', alternateNames: ['Bangalore'] },
  { slug: 'mysuru', name: 'Mysuru', tier: 1, district: 'Mysuru', alternateNames: ['Mysore'] },
  { slug: 'mangaluru', name: 'Mangaluru', tier: 1, district: 'Dakshina Kannada', alternateNames: ['Mangalore'] },
  { slug: 'hubballi', name: 'Hubballi', tier: 2, district: 'Dharwad', alternateNames: ['Hubli'] },
  { slug: 'dharwad', name: 'Dharwad', tier: 2, district: 'Dharwad' },
  { slug: 'belagavi', name: 'Belagavi', tier: 2, district: 'Belagavi', alternateNames: ['Belgaum'] },
  { slug: 'tumakuru', name: 'Tumakuru', tier: 2, district: 'Tumakuru', alternateNames: ['Tumkur'] },
  { slug: 'ramanagara', name: 'Ramanagara', tier: 2, district: 'Ramanagara' },
  { slug: 'kolar', name: 'Kolar', tier: 2, district: 'Kolar' },
  { slug: 'chikkaballapura', name: 'Chikkaballapura', tier: 2, district: 'Chikkaballapura', alternateNames: ['Chikkaballapur'] },
  { slug: 'mandya', name: 'Mandya', tier: 2, district: 'Mandya' },
  { slug: 'hassan', name: 'Hassan', tier: 2, district: 'Hassan' },
  { slug: 'hosur', name: 'Hosur', tier: 2, district: 'Krishnagiri', alternateNames: ['Hosur Tamil Nadu'] },
  { slug: 'devanahalli', name: 'Devanahalli', tier: 2, district: 'Bengaluru Rural' },
  { slug: 'nelamangala', name: 'Nelamangala', tier: 2, district: 'Bengaluru Rural' },
  { slug: 'doddaballapur', name: 'Doddaballapur', tier: 2, district: 'Bengaluru Rural', alternateNames: ['Doddaballapura'] },
  { slug: 'shivamogga', name: 'Shivamogga', tier: 2, district: 'Shivamogga', alternateNames: ['Shimoga'] },
  { slug: 'davanagere', name: 'Davanagere', tier: 2, district: 'Davanagere' },
  { slug: 'kalaburagi', name: 'Kalaburagi', tier: 2, district: 'Kalaburagi', alternateNames: ['Gulbarga'] },
  { slug: 'udupi', name: 'Udupi', tier: 3, district: 'Udupi' },
];

export const PRIORITY_CITY_SLUGS = new Set(PRIORITY_CITIES.map((c) => c.slug));

/** Major Bengaluru localities — boosted sitemap priority & internal linking. */
export const PRIORITY_BENGALURU_LOCALITY_SLUGS = [
  'ro-service-whitefield',
  'ro-service-marathahalli',
  'ro-service-brookefield',
  'ro-service-mahadevapura',
  'ro-service-kr-puram',
  'ro-service-varthur',
  'ro-service-bellandur',
  'ro-service-sarjapur',
  'ro-service-electronic-city',
  'ro-service-hsr-layout',
  'ro-service-jp-nagar',
  'ro-service-jayanagar',
  'ro-service-banashankari',
  'ro-service-btm-layout',
  'ro-service-bannerghatta',
  'ro-service-kanakapura-road',
  'ro-service-rr-nagar',
  'ro-service-yelahanka',
  'ro-service-hebbal',
  'ro-service-thanisandra',
  'ro-service-hennur',
  'ro-service-nagawara',
  'ro-service-jakkur',
  'ro-service-bagalur',
  'ro-service-kogilu',
  'ro-service-chikkajala',
  'ro-service-budigere-cross',
  'ro-service-allalasandra',
  'ro-service-rajanukunte',
  'ro-service-ms-palya',
  'ro-service-avalahalli-yelahanka',
  'ro-service-rajajinagar',
  'ro-service-vijayanagar',
  'ro-service-nagarbhavi',
  'ro-service-kengeri',
  'ro-service-koramangala',
  'ro-service-indiranagar',
  'ro-service-malleshwaram',
  'ro-service-bommanahalli',
  'ro-service-anjanapura',
  'ro-service-attibele',
  'ro-service-chandapura',
  'ro-service-yeshwanthpur',
  'ro-service-basavanagudi',
  'ro-service-kalyan-nagar',
  'ro-service-banaswadi',
  'ro-service-sahakar-nagar',
] as const;

interface PriorityLocality {
  slug: string;
  name: string;
  zone: string;
}

/** Priority Bengaluru localities for locality × service landing pages. */
const PRIORITY_BENGALURU_LOCALITIES: PriorityLocality[] = [
  { slug: 'whitefield', name: 'Whitefield', zone: 'East' },
  { slug: 'marathahalli', name: 'Marathahalli', zone: 'East' },
  { slug: 'brookefield', name: 'Brookefield', zone: 'East' },
  { slug: 'mahadevapura', name: 'Mahadevapura', zone: 'East' },
  { slug: 'kr-puram', name: 'KR Puram', zone: 'East' },
  { slug: 'varthur', name: 'Varthur', zone: 'East' },
  { slug: 'bellandur', name: 'Bellandur', zone: 'East' },
  { slug: 'sarjapur', name: 'Sarjapur', zone: 'East' },
  { slug: 'electronic-city', name: 'Electronic City', zone: 'East' },
  { slug: 'hsr-layout', name: 'HSR Layout', zone: 'East' },
  { slug: 'jp-nagar', name: 'JP Nagar', zone: 'South' },
  { slug: 'jayanagar', name: 'Jayanagar', zone: 'South' },
  { slug: 'banashankari', name: 'Banashankari', zone: 'South' },
  { slug: 'btm-layout', name: 'BTM Layout', zone: 'South' },
  { slug: 'bannerghatta', name: 'Bannerghatta Road', zone: 'South' },
  { slug: 'kanakapura-road', name: 'Kanakapura Road', zone: 'South' },
  { slug: 'rr-nagar', name: 'RR Nagar', zone: 'South' },
  { slug: 'yelahanka', name: 'Yelahanka', zone: 'North' },
  { slug: 'hebbal', name: 'Hebbal', zone: 'North' },
  { slug: 'thanisandra', name: 'Thanisandra', zone: 'North' },
  { slug: 'hennur', name: 'Hennur', zone: 'North' },
  { slug: 'nagawara', name: 'Nagawara', zone: 'North' },
  { slug: 'jakkur', name: 'Jakkur', zone: 'North' },
  { slug: 'bagalur', name: 'Bagalur', zone: 'North' },
  { slug: 'kogilu', name: 'Kogilu', zone: 'North' },
  { slug: 'chikkajala', name: 'Chikkajala', zone: 'North' },
  { slug: 'budigere-cross', name: 'Budigere Cross', zone: 'North' },
  { slug: 'allalasandra', name: 'Allalasandra', zone: 'North' },
  { slug: 'rajanukunte', name: 'Rajanukunte', zone: 'North' },
  { slug: 'ms-palya', name: 'MS Palya', zone: 'North' },
  { slug: 'avalahalli-yelahanka', name: 'Avalahalli', zone: 'North' },
  { slug: 'rajajinagar', name: 'Rajajinagar', zone: 'West' },
  { slug: 'vijayanagar', name: 'Vijayanagar', zone: 'West' },
  { slug: 'nagarbhavi', name: 'Nagarbhavi', zone: 'West' },
  { slug: 'kengeri', name: 'Kengeri', zone: 'West' },
  { slug: 'koramangala', name: 'Koramangala', zone: 'East' },
  { slug: 'indiranagar', name: 'Indiranagar', zone: 'East' },
  { slug: 'malleshwaram', name: 'Malleshwaram', zone: 'West' },
  { slug: 'bommanahalli', name: 'Bommanahalli', zone: 'South' },
  { slug: 'anjanapura', name: 'Anjanapura', zone: 'South' },
  { slug: 'attibele', name: 'Attibele', zone: 'East' },
  { slug: 'chandapura', name: 'Chandapura', zone: 'East' },
  { slug: 'yeshwanthpur', name: 'Yeshwanthpur', zone: 'West' },
  { slug: 'basavanagudi', name: 'Basavanagudi', zone: 'South' },
  { slug: 'kalyan-nagar', name: 'Kalyan Nagar', zone: 'North' },
  { slug: 'banaswadi', name: 'Banaswadi', zone: 'East' },
  { slug: 'sahakar-nagar', name: 'Sahakar Nagar', zone: 'North' },
];

interface CityServiceTemplate {
  pathPrefix: string;
  serviceName: string;
  description: (placeName: string, district?: string) => string;
}

const CITY_SERVICE_TEMPLATES: CityServiceTemplate[] = [
  {
    pathPrefix: 'ro-installation-in',
    serviceName: 'RO Installation',
    description: (place) =>
      `Professional RO water purifier installation in ${place} by certified technicians. Same-day setup for Kent, Aquaguard, Pureit and all major brands.`,
  },
  {
    pathPrefix: 'commercial-ro-plant-in',
    serviceName: 'Commercial RO Plant Installation',
    description: (place, district) =>
      `Commercial RO plant installation in ${place} — 25 LPH, 50 LPH, 500 LPH and 1000 LPH for offices, restaurants, hotels, clinics and factories${district ? ` across ${district}` : ''}. Site visit, installation, service and AMC from Bengaluru (up to 250 km).`,
  },
  {
    pathPrefix: 'water-softener-installation-in',
    serviceName: 'Water Softener Installation',
    description: (place) =>
      `New water softener installation in ${place} for hard borewell and tanker water. Homes, apartments and commercial sites — salt setup, resin service and after-sales within 250 km of Bengaluru.`,
  },
  {
    pathPrefix: 'borewell-water-filter-in',
    serviceName: 'Borewell Water Filter',
    description: (place) =>
      `Borewell water filter and RO solutions in ${place}. Treat high TDS, iron and hardness from borewell water for safe drinking water at home.`,
  },
  {
    pathPrefix: 'apartment-water-softener-in',
    serviceName: 'Apartment Water Softener',
    description: (place) =>
      `Apartment water softener installation in ${place} for multi-storey buildings and gated communities. New install, centralized or flat-wise softener, plus salt and resin service.`,
  },
  {
    pathPrefix: 'industrial-ro-plant-in',
    serviceName: 'Industrial RO Plant',
    description: (place) =>
      `Industrial RO plant installation and service in ${place} for factories, hospitals and large facilities. High-capacity RO systems with AMC.`,
  },
  {
    pathPrefix: 'ro-amc-in',
    serviceName: 'RO AMC',
    description: (place) =>
      `RO Annual Maintenance Contract (AMC) in ${place}. Scheduled filter replacement, sanitization and priority technician visits for all RO brands.`,
  },
];

export interface CityServicePage {
  path: string;
  citySlug: string;
  cityName: string;
  cityTier: SeoCityTier;
  district: string;
  serviceKey: string;
  serviceName: string;
  shortDescription: string;
  alternateCityNames: string[];
  areaType: 'city' | 'locality';
  zone?: string;
}

function buildServicePage(
  template: CityServiceTemplate,
  slug: string,
  displayName: string,
  tier: SeoCityTier,
  district: string,
  areaType: 'city' | 'locality',
  alternateNames: string[],
  zone?: string
): CityServicePage {
  const serviceKey = template.pathPrefix.replace(/-in$/, '');
  return {
    path: `/${template.pathPrefix}-${slug}`,
    citySlug: slug,
    cityName: displayName,
    cityTier: tier,
    district,
    serviceKey,
    serviceName: template.serviceName,
    shortDescription: template.description(displayName, district),
    alternateCityNames: alternateNames,
    areaType,
    zone,
  };
}

export const cityServicePageList: CityServicePage[] = PRIORITY_CITIES.flatMap((city) =>
  CITY_SERVICE_TEMPLATES.map((template) =>
    buildServicePage(
      template,
      city.slug,
      city.name,
      city.tier,
      city.district,
      'city',
      city.alternateNames ?? []
    )
  )
);

/** Locality × service pages for priority Bengaluru areas (e.g. /ro-installation-in-whitefield). */
export const localityServicePageList: CityServicePage[] = PRIORITY_BENGALURU_LOCALITIES.flatMap((loc) =>
  CITY_SERVICE_TEMPLATES.map((template) =>
    buildServicePage(
      template,
      loc.slug,
      `${loc.name}, Bengaluru`,
      1,
      'Bengaluru Urban',
      'locality',
      [`${loc.name} Bangalore`, `${loc.name} Bengaluru`],
      loc.zone
    )
  )
);

export const areaServicePageList: CityServicePage[] = [...cityServicePageList, ...localityServicePageList];

export function getCityServicePage(pathname: string): CityServicePage | undefined {
  const clean = pathname.replace(/\/$/, '') || '/';
  return areaServicePageList.find((page) => page.path === clean);
}

export function buildCityServiceKeywords(page: CityServicePage, brandName: string): string {
  const altNames = page.alternateCityNames.flatMap((name) => [
    `${page.serviceName} ${name}`,
    `RO service ${name}`,
  ]);
  const extra =
    page.serviceKey === 'commercial-ro-plant'
      ? [`25 LPH RO plant ${page.cityName}`, `50 LPH RO plant ${page.cityName}`, `500 LPH RO plant ${page.cityName}`, `1000 LPH RO plant ${page.cityName}`, `commercial RO plant ${page.cityName}`]
      : page.serviceKey.includes('softener')
        ? [`new water softener installation ${page.cityName}`, `water softener service ${page.cityName}`]
        : [];
  return [
    `${page.serviceName} ${page.cityName}`,
    `${page.serviceName} ${page.cityName} Karnataka`,
    `RO service ${page.cityName}`,
    `water purifier ${page.cityName}`,
    `${page.district} RO service`,
    brandName,
    ...extra,
    ...altNames,
  ].join(', ');
}

export function buildCityServicePageSeo(
  page: CityServicePage,
  brandName: string,
  primaryPhone: string
): { title: string; description: string; keywords: string } {
  const altNote =
    page.alternateCityNames.length > 0 ? ` Also serving ${page.alternateCityNames.join(', ')}.` : '';
  const commercialNote =
    page.serviceKey === 'commercial-ro-plant'
      ? ` 25, 50, 500 and 1000 LPH. Site visit, install and AMC up to 250 km from Bengaluru.`
      : page.serviceKey.includes('softener')
        ? ` New install, salt and resin service up to 250 km from Bengaluru.`
        : '';
  return {
    title:
      page.serviceKey === 'commercial-ro-plant'
        ? `Commercial RO 25–1000 LPH in ${page.cityName} | ${brandName}`
        : page.serviceKey.includes('softener')
          ? `${page.serviceName} in ${page.cityName} | ${brandName}`
          : `${page.serviceName} in ${page.cityName} | ${brandName}`,
    description: `${page.shortDescription}${commercialNote} Book with ${brandName}.${altNote} Call ${primaryPhone}.`,
    keywords: buildCityServiceKeywords(page, brandName),
  };
}

/** Hub links grouped by tier for /service-areas and /services internal linking. */
export const CITY_SERVICE_HUB_GROUPS: { title: string; pages: CityServicePage[] }[] = [
  {
    title: 'Tier 1 — Bengaluru, Mysuru & Mangaluru',
    pages: cityServicePageList.filter((p) => p.cityTier === 1),
  },
  {
    title: 'Tier 2 — Hubballi, Belagavi, Tumakuru & more',
    pages: cityServicePageList.filter((p) => p.cityTier === 2),
  },
  {
    title: 'Tier 3 — Udupi & expanding markets',
    pages: cityServicePageList.filter((p) => p.cityTier === 3),
  },
];
