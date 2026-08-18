import type { CityServicePage } from '@/data/cityServiceSeo';
import type { SeoServicePage } from '@/lib/publicSeoPages';

export type ProductServiceKind =
  | 'commercial'
  | 'commercial-25'
  | 'commercial-50'
  | 'commercial-500'
  | 'commercial-1000'
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
  if (clean === '/commercial-ro-500-lph') return 'commercial-500';
  if (clean === '/commercial-ro-1000-lph') return 'commercial-1000';
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

const SERVICE_RADIUS = 'up to 250 km from Bengaluru';

export function productServiceFaqs(
  kind: ProductServiceKind,
  place: string,
  brandName: string
): Array<{ q: string; a: string }> {
  if (kind.startsWith('commercial')) {
    return [
      {
        q: `Do you supply 25, 50, 500 and 1000 LPH commercial RO plants in ${place}?`,
        a: `Yes. ${brandName} supplies, installs and services commercial RO plants from 25 LPH and 50 LPH up to 500 LPH and 1000 LPH for offices, restaurants, hotels, schools, clinics and factories in ${place}. We cover ${SERVICE_RADIUS}.`,
      },
      {
        q: 'How far from Bengaluru do you install commercial RO plants?',
        a: `${brandName} is based in Bengaluru and installs and services commercial RO plants ${SERVICE_RADIUS} — including site visit, commissioning and AMC.`,
      },
      {
        q: 'Do you only sell plants, or also service and AMC?',
        a: `${brandName} does new commercial installation, repair, membrane/filter service and annual maintenance for offices, restaurants, clinics, hotels and factories.`,
      },
    ];
  }
  return [
    {
      q: `Do you do new water softener installation in ${place}?`,
      a: `Yes. ${brandName} installs new water softeners for homes, apartments and small commercial sites in ${place}, plus salt refill, resin service and repair of existing units. Coverage is ${SERVICE_RADIUS}.`,
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
