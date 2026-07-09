import { getLocationBySlug } from '@/data/locationSeo';
import type { LocationSEO } from '@/data/locationSeo';

export interface BengaluruZoneHub {
  zone: string;
  title: string;
  /** Location slugs e.g. ro-service-whitefield */
  slugs: string[];
}

/** Bengaluru zones — top areas with sibling localities inside each zone. */
export const BENGALURU_ZONE_HUBS: BengaluruZoneHub[] = [
  {
    zone: 'East',
    title: 'East Bengaluru',
    slugs: [
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
      'ro-service-kundalahalli',
      'ro-service-kadugodi',
      'ro-service-hoodi',
      'ro-service-banaswadi',
      'ro-service-ramamurthy-nagar',
      'ro-service-kasturi-nagar',
      'ro-service-cv-raman-nagar',
      'ro-service-kaggadasapura',
      'ro-service-jeevan-bima-nagar',
      'ro-service-tin-factory',
      'ro-service-murugeshpalya',
      'ro-service-frazer-town',
      'ro-service-cox-town',
      'ro-service-cooke-town',
      'ro-service-kammanahalli',
      'ro-service-hbr-layout',
      'ro-service-itpl',
      'ro-service-doddanekundi',
    ],
  },
  {
    zone: 'South',
    title: 'South Bengaluru',
    slugs: [
      'ro-service-jp-nagar',
      'ro-service-jayanagar',
      'ro-service-banashankari',
      'ro-service-btm-layout',
      'ro-service-bannerghatta',
      'ro-service-kanakapura-road',
      'ro-service-rr-nagar',
      'ro-service-koramangala',
      'ro-service-indiranagar',
      'ro-service-basavanagudi',
      'ro-service-bommanahalli',
      'ro-service-silk-board',
      'ro-service-madiwala',
      'ro-service-adugodi',
      'ro-service-wilson-garden',
      'ro-service-ejipura',
      'ro-service-anjanapura',
      'ro-service-arekere',
      'ro-service-gottigere',
      'ro-service-thurahalli',
      'ro-service-haralur',
      'ro-service-kadubeesanahalli',
      'ro-service-panathur',
    ],
  },
  {
    zone: 'North',
    title: 'North Bengaluru',
    slugs: [
      'ro-service-yelahanka',
      'ro-service-hebbal',
      'ro-service-thanisandra',
      'ro-service-hennur',
      'ro-service-nagawara',
      'ro-service-jakkur',
      'ro-service-sahakar-nagar',
      'ro-service-rt-nagar',
      'ro-service-sanjaynagar',
      'ro-service-manyata-tech-park',
      'ro-service-bagalur',
      'ro-service-devanahalli',
      'ro-service-budigere-cross',
      'ro-service-hoskote',
      'ro-service-ganganagar',
      'ro-service-kodigehalli',
      'ro-service-kempapura',
      'ro-service-hennur-road',
      'ro-service-horamavu',
      'ro-service-kalyan-nagar',
      'ro-service-hesaraghatta',
      'ro-service-chikkajala',
    ],
  },
  {
    zone: 'West',
    title: 'West Bengaluru',
    slugs: [
      'ro-service-rajajinagar',
      'ro-service-vijayanagar',
      'ro-service-nagarbhavi',
      'ro-service-kengeri',
      'ro-service-malleshwaram',
      'ro-service-basaveshwaranagar',
      'ro-service-peenya',
      'ro-service-yeshwanthpur',
      'ro-service-uttarahalli',
      'ro-service-mahalakshmi-layout',
      'ro-service-seshadripuram',
      'ro-service-nandini-layout',
      'ro-service-kumbalgodu',
      'ro-service-chamrajpet',
      'ro-service-chickpet',
      'ro-service-majestic',
      'ro-service-dasarahalli',
      'ro-service-mysore-road',
      'ro-service-magadi-road',
    ],
  },
];

export interface Tier1CityHub {
  cityName: string;
  citySlug: string;
  locationSlug: string;
  subAreaSlugs: string[];
}

/** Tier 1 Karnataka cities with sub-area locality pages inside each city. */
export const TIER1_CITY_HUBS: Tier1CityHub[] = [
  {
    cityName: 'Bengaluru',
    citySlug: 'bengaluru',
    locationSlug: 'ro-service-bengaluru',
    subAreaSlugs: BENGALURU_ZONE_HUBS.flatMap((z) => z.slugs),
  },
  {
    cityName: 'Mysuru',
    citySlug: 'mysuru',
    locationSlug: 'ro-service-mysuru',
    subAreaSlugs: [
      'ro-service-srirangapatna',
      'ro-service-nanjangud',
      'ro-service-hunsur',
      'ro-service-bannur',
      'ro-service-mandya',
      'ro-service-krishnarajanagara',
      'ro-service-ramanagara',
    ],
  },
  {
    cityName: 'Mangaluru',
    citySlug: 'mangaluru',
    locationSlug: 'ro-service-mangaluru',
    subAreaSlugs: [
      'ro-service-ullal',
      'ro-service-surathkal',
      'ro-service-bantwal',
      'ro-service-puttur',
      'ro-service-moodbidri',
      'ro-service-udupi',
      'ro-service-manipal',
      'ro-service-kundapura',
    ],
  },
];

const slugToZone = new Map<string, string>();
for (const hub of BENGALURU_ZONE_HUBS) {
  for (const slug of hub.slugs) {
    slugToZone.set(slug, hub.zone);
  }
}

export function getBengaluruZoneForSlug(slug: string): BengaluruZoneHub | undefined {
  const zone = slugToZone.get(slug);
  if (!zone) return undefined;
  return BENGALURU_ZONE_HUBS.find((h) => h.zone === zone);
}

export function getZoneSiblingLocations(slug: string): LocationSEO[] {
  const hub = getBengaluruZoneForSlug(slug);
  if (!hub) return [];
  return hub.slugs
    .filter((s) => s !== slug)
    .map((s) => getLocationBySlug(s))
    .filter((loc): loc is LocationSEO => loc != null);
}

export function resolveZoneHubAreas(hub: BengaluruZoneHub): LocationSEO[] {
  return hub.slugs
    .map((s) => getLocationBySlug(s))
    .filter((loc): loc is LocationSEO => loc != null);
}

export function resolveTier1SubAreas(hub: Tier1CityHub): LocationSEO[] {
  return hub.subAreaSlugs
    .map((s) => getLocationBySlug(s))
    .filter((loc): loc is LocationSEO => loc != null);
}
