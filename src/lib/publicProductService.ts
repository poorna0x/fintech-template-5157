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
  brandName: string,
  phone?: string
): Array<{ q: string; a: string }> {
  const call = phone ? ` Call ${phone}.` : '';

  if (kind.startsWith('commercial')) {
    const shared = [
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
      {
        q: 'What does LPH mean, and which capacity do I need?',
        a: 'LPH is litres per hour of purified water. 25 LPH suits small offices, clinics and pantries (about 10–25 people). 50 LPH suits restaurants, larger offices and schools. 500 LPH suits hotels, hostels and mid-size factories. 1000 LPH suits large commercial sites, hospitals, apartment complexes and factories. We confirm capacity after a site visit and TDS check.',
      },
      {
        q: `Do you do a site visit in ${place} before we buy a plant?`,
        a: `Yes. Book a site visit in ${place}. We check occupancy, peak demand, raw-water TDS, plumbing and electricals, then recommend 25, 50, 500 or 1000 LPH — not a catalogue guess.`,
      },
      {
        q: 'What is included in commercial RO installation?',
        a: 'Plant supply as quoted, inlet/outlet plumbing, electricals, commissioning, TDS check and a short operator briefing. Extra civil work, tanks or high-rise pumping is quoted separately after the visit.',
      },
      {
        q: 'How long does commercial RO installation take?',
        a: 'Small 25 LPH and 50 LPH plants are often commissioned in one visit once the site is ready. 500 LPH and 1000 LPH plants need a survey first; install timing depends on plumbing, tanks and electricals. We share a schedule after the site visit.',
      },
      {
        q: `Can you service a commercial RO plant we already have in ${place}?`,
        a: `Yes. ${brandName} services existing commercial plants in ${place} — membrane and filter replacement, leak/pump repair, sanitization and AMC — even if we did not install the original unit.`,
      },
      {
        q: 'What does commercial RO AMC cover?',
        a: 'AMC typically covers scheduled filter/membrane service, sanitization, TDS checks and priority breakdown visits. Parts that wear out are quoted transparently. Offices, restaurants, hotels, clinics and factories can all take AMC.',
      },
      {
        q: 'Do you install plants for restaurants, hotels and factories?',
        a: `Yes — 25 LPH and 50 LPH for restaurants, clinics and offices; 500 LPH and 1000 LPH for hotels, hostels, hospitals and factories in ${place} and ${SERVICE_RADIUS}.`,
      },
      {
        q: 'Which nearby districts do you cover from Bengaluru?',
        a: `${brandName} covers ${place} plus nearby districts ${SERVICE_RADIUS}, including Tumakuru, Ramanagara, Kolar, Chikkaballapura, Mandya, Hassan, Hosur, Nelamangala and Doddaballapur.`,
      },
      {
        q: `How do I book a commercial RO plant or AMC in ${place}?`,
        a: `Book online or call ${brandName}.${call} Choose Commercial RO and the capacity you need (25, 50, 500 or 1000 LPH), or ask for a site visit if you are unsure.`,
      },
    ];

    if (kind === 'commercial-25') {
      shared.splice(4, 0, {
        q: `Is a 25 LPH commercial RO plant enough for a small office in ${place}?`,
        a: `25 LPH (about 25 litres per hour) is sized for small offices, clinics, salons and pantries in ${place} — roughly 10–25 people. If occupancy or kitchen demand is higher, we usually recommend 50 LPH after the site visit.`,
      });
    } else if (kind === 'commercial-50') {
      shared.splice(4, 0, {
        q: `Is 50 LPH the right commercial RO plant for a restaurant in ${place}?`,
        a: `50 LPH suits restaurants, larger offices and schools in ${place} that need drinking water through the day. Very busy kitchens or hotels usually need 500 LPH. We confirm after checking peak demand and TDS.`,
      });
    } else if (kind === 'commercial-500') {
      shared.splice(4, 0, {
        q: `Who should choose a 500 LPH commercial RO plant in ${place}?`,
        a: `500 LPH is for hotels, hostels, large offices and mid-size factories in ${place}. It produces about 500 litres per hour. We survey tanks, plumbing and occupancy before quoting supply, install and AMC.`,
      });
    } else if (kind === 'commercial-1000') {
      shared.splice(4, 0, {
        q: `Who needs a 1000 LPH commercial RO plant in ${place}?`,
        a: `1000 LPH is for large commercial sites, hospitals, apartment complexes and factories in ${place} that need about 1000 litres per hour. Site visit, installation and ongoing service are from Bengaluru, covering ${SERVICE_RADIUS}.`,
      });
    }

    return shared;
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
      a: `Yes — new installation, re-installation, salt refill, resin check, valve repair and AMC. Book a visit or call ${brandName}.${call}`,
    },
    {
      q: `Why do homes in ${place} need a water softener?`,
      a: `Borewell and tanker water around ${place} is often hard. That leaves scale on geysers, taps and washing machines. A new softener installation treats the house line; RO still handles drinking water.`,
    },
    {
      q: 'Do you install softeners in apartments and gated communities?',
      a: `Yes. ${brandName} does flat-wise and centralized apartment water softener installation in ${place}, with salt setup and after-sales ${SERVICE_RADIUS}.`,
    },
    {
      q: 'What happens during a new water softener installation?',
      a: 'We size the unit for hardness and occupancy, plumb inlet and drain, set the valve, load salt/resin as quoted, and show you how to refill salt. Starting visit from ₹499 (resin extra).',
    },
    {
      q: 'How often do you need to refill salt or service resin?',
      a: 'Salt refill depends on hardness and water use — often every few weeks to a couple of months. Resin is checked during service visits. Book salt refill or resin service when water starts feeling hard again.',
    },
    {
      q: `Can you re-install a softener when we shift house in ${place}?`,
      a: `Yes. ${brandName} disconnects, relocates and re-installs water softeners in ${place}, then checks the valve and salt setup at the new address.`,
    },
    {
      q: 'How far from Bengaluru do you install water softeners?',
      a: `${brandName} is based in Bengaluru and installs and services water softeners ${SERVICE_RADIUS}, including nearby districts such as Tumakuru, Ramanagara, Kolar, Hosur, Nelamangala and Doddaballapur.`,
    },
    {
      q: `How do I book water softener installation in ${place}?`,
      a: `Book online or call ${brandName}.${call} Choose Water Softener and New Softener Installation, or describe hard-water issues if you need a diagnosis first.`,
    },
  ];
}
