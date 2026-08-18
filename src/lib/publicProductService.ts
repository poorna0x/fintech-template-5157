import type { CityServicePage } from '@/data/cityServiceSeo';
import type { SeoServicePage } from '@/lib/publicSeoPages';

export type ProductServiceKind =
  | 'commercial'
  | 'commercial-25'
  | 'commercial-50'
  | 'softener'
  | 'softener-install'
  | 'apartment-softener';

export function resolveProductServiceKind(
  pathname: string,
  cityServicePage?: CityServicePage | null,
  servicePage?: SeoServicePage | null
): ProductServiceKind | null {
  const clean = pathname.replace(/\/$/, '') || '/';
  if (clean === '/commercial-ro-25-lph') return 'commercial-25';
  if (clean === '/commercial-ro-50-lph') return 'commercial-50';
  if (clean === '/commercial-ro-service' || cityServicePage?.serviceKey === 'commercial-ro-plant') {
    return 'commercial';
  }
  if (
    clean === '/water-softener-installation' ||
    cityServicePage?.serviceKey === 'water-softener-installation'
  ) {
    return 'softener-install';
  }
  if (cityServicePage?.serviceKey === 'apartment-water-softener') return 'apartment-softener';
  if (clean === '/water-softener' || servicePage?.path === '/water-softener') return 'softener';
  return null;
}

export function productServiceFaqs(
  kind: ProductServiceKind,
  place: string,
  brandName: string
): Array<{ q: string; a: string }> {
  if (kind === 'commercial' || kind === 'commercial-25' || kind === 'commercial-50') {
    return [
      {
        q: `Do you supply 25 LPH and 50 LPH commercial RO plants in ${place}?`,
        a: `Yes. ${brandName} is a local Bengaluru company that supplies, installs and services commercial RO plants — including 25 LPH for small offices and clinics, and 50 LPH for restaurants, schools and larger offices in ${place}.`,
      },
      {
        q: 'Why buy a commercial RO plant from a local company instead of a national brand dealer?',
        a: 'Local installation means a site visit before you buy, same-city technicians for breakdowns, and an AMC you can actually call. Companies in Bengaluru often prefer a local partner so they are not waiting on an outstation dealer for service.',
      },
      {
        q: 'Do you only sell plants, or also service and AMC?',
        a: `${brandName} does new commercial installation, repair, membrane/filter service and annual maintenance for offices, restaurants, clinics and small factories.`,
      },
    ];
  }
  return [
    {
      q: `Do you do new water softener installation in ${place}?`,
      a: `Yes. ${brandName} installs new water softeners for homes, apartments and small commercial sites in ${place}, plus salt refill, resin service and repair of existing units.`,
    },
    {
      q: 'Is a water softener different from an RO purifier?',
      a: 'Yes. A softener treats hard borewell or tanker water for the whole house (taps, geyser, washing machine). An RO purifier is for drinking water. Many Karnataka homes need both.',
    },
    {
      q: 'Do you service existing softeners as well as new installs?',
      a: `Yes — new installation, re-installation, salt refill, resin check, valve repair and AMC. Book a visit or call ${brandName}.`,
    },
  ];
}
