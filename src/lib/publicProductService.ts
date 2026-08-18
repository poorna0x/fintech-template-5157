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

export function productServicePageCopy(
  kind: ProductServiceKind,
  place: string,
  brandName: string
): { title: string; description: string; schemaName: string } {
  if (kind === 'commercial-25') {
    return {
      title: `25 LPH Commercial RO Plant in ${place}`,
      description: `${brandName} supplies, installs and services 25 LPH commercial RO plants in ${place} for small offices, clinics and pantries. Site visit, commissioning and AMC — based in Bengaluru, covering ${SERVICE_RADIUS}.`,
      schemaName: `25 LPH Commercial RO Plant Installation in ${place}`,
    };
  }
  if (kind === 'commercial-50') {
    return {
      title: `50 LPH Commercial RO Plant in ${place}`,
      description: `${brandName} supplies, installs and services 50 LPH commercial RO plants in ${place} for restaurants, larger offices and schools. Site visit, commissioning and AMC ${SERVICE_RADIUS}.`,
      schemaName: `50 LPH Commercial RO Plant Installation in ${place}`,
    };
  }
  if (kind === 'commercial-500') {
    return {
      title: `500 LPH Commercial RO Plant in ${place}`,
      description: `${brandName} supplies, installs and services 500 LPH commercial RO plants in ${place} for hotels, hostels and mid-size factories. Site visit, install and AMC ${SERVICE_RADIUS}.`,
      schemaName: `500 LPH Commercial RO Plant Installation in ${place}`,
    };
  }
  if (kind === 'commercial-1000') {
    return {
      title: `1000 LPH Commercial RO Plant in ${place}`,
      description: `${brandName} supplies, installs and services 1000 LPH commercial RO plants in ${place} for large commercial sites, hospitals and factories. Site visit, install and AMC ${SERVICE_RADIUS}.`,
      schemaName: `1000 LPH Commercial RO Plant Installation in ${place}`,
    };
  }
  if (kind === 'commercial') {
    return {
      title: `Commercial RO Plants in ${place} — 25 to 1000 LPH`,
      description: `${brandName} supplies 25, 50, 500 and 1000 LPH commercial RO plants in ${place}. New installation, service and AMC from Bengaluru, covering ${SERVICE_RADIUS}.`,
      schemaName: `Commercial RO Plant Installation & Service in ${place}`,
    };
  }
  if (kind === 'softener-install') {
    return {
      title: `New Water Softener Installation in ${place}`,
      description: `New water softener installation in ${place} for hard borewell and tanker water. ${brandName} sizes, plumbs and services softeners ${SERVICE_RADIUS}.`,
      schemaName: `New Water Softener Installation in ${place}`,
    };
  }
  if (kind === 'apartment-softener') {
    return {
      title: `Apartment Water Softener in ${place}`,
      description: `Apartment and gated-community water softener installation in ${place}. Flat-wise or centralized setups with salt and resin service ${SERVICE_RADIUS}.`,
      schemaName: `Apartment Water Softener Installation in ${place}`,
    };
  }
  return {
    title: `Water Softener Service in ${place}`,
    description: `New water softener installation, salt refill, resin service and repair in ${place} by ${brandName}. Coverage ${SERVICE_RADIUS}.`,
    schemaName: `Water Softener Installation & Service in ${place}`,
  };
}

function commercialCapacityFaqs(
  lph: 25 | 50 | 500 | 1000,
  audience: string,
  place: string,
  brandName: string,
  call: string
): Array<{ q: string; a: string }> {
  return [
    {
      q: `Do you supply ${lph} LPH commercial RO plants in ${place}?`,
      a: `Yes. ${brandName} supplies, installs and services ${lph} LPH commercial RO plants in ${place} for ${audience}. We also cover ${SERVICE_RADIUS} for site visit, commissioning and AMC.`,
    },
    {
      q: `Who should choose a ${lph} LPH commercial RO plant?`,
      a: `A ${lph} LPH plant produces about ${lph} litres of purified water per hour. It is typically right for ${audience} in ${place}. We confirm after checking occupancy, peak demand and raw-water TDS.`,
    },
    {
      q: `How far from Bengaluru do you install ${lph} LPH RO plants?`,
      a: `${brandName} is based in Bengaluru and installs ${lph} LPH commercial RO plants ${SERVICE_RADIUS}, including ${place}.`,
    },
    {
      q: `Do you only sell ${lph} LPH plants, or also service and AMC?`,
      a: `${brandName} does new ${lph} LPH installation, repair, membrane/filter service and annual maintenance — not supply-only.`,
    },
    {
      q: `Do you do a site visit in ${place} before we buy a ${lph} LPH plant?`,
      a: `Yes. Book a site visit in ${place}. We check plumbing, electricals, tanks and TDS, then confirm whether ${lph} LPH is the right capacity or whether 25, 50, 500 or 1000 LPH fits better.`,
    },
    {
      q: `What is included in ${lph} LPH commercial RO installation?`,
      a: `Plant supply as quoted, inlet/outlet plumbing, electricals, commissioning, TDS check and operator briefing for the ${lph} LPH unit. Extra civil work or tanks are quoted after the visit.`,
    },
    {
      q: `Can you AMC or repair an existing ${lph} LPH plant in ${place}?`,
      a: `Yes. ${brandName} services existing ${lph} LPH plants in ${place} — filters, membranes, pumps and AMC — even if another company installed the original plant.`,
    },
    {
      q: `How is ${lph} LPH different from your other commercial plants?`,
      a: `We supply 25 LPH and 50 LPH for smaller sites, and 500 LPH and 1000 LPH for hotels and factories. ${lph} LPH is the fit when demand matches ${audience}. The site visit decides, not a catalogue page.`,
    },
    {
      q: `Which nearby districts get ${lph} LPH commercial RO installation?`,
      a: `${brandName} installs ${lph} LPH plants ${SERVICE_RADIUS}, including Tumakuru, Ramanagara, Kolar, Chikkaballapura, Mandya, Hassan, Hosur, Nelamangala and Doddaballapur.`,
    },
    {
      q: `How do I book a ${lph} LPH commercial RO plant in ${place}?`,
      a: `Book online or call ${brandName}.${call} Choose Commercial RO and ${lph} LPH Commercial Installation, or ask for a site visit if you are unsure of capacity.`,
    },
  ];
}

export function productServiceFaqs(
  kind: ProductServiceKind,
  place: string,
  brandName: string,
  phone?: string
): Array<{ q: string; a: string }> {
  const call = phone ? ` Call ${phone}.` : '';

  if (kind.startsWith('commercial')) {
    if (kind === 'commercial-25') {
      return commercialCapacityFaqs(25, 'small offices, clinics, salons and pantries (about 10–25 people)', place, brandName, call);
    }
    if (kind === 'commercial-50') {
      return commercialCapacityFaqs(50, 'restaurants, larger offices and schools', place, brandName, call);
    }
    if (kind === 'commercial-500') {
      return commercialCapacityFaqs(500, 'hotels, hostels, large offices and mid-size factories', place, brandName, call);
    }
    if (kind === 'commercial-1000') {
      return commercialCapacityFaqs(1000, 'large commercial sites, hospitals, apartment complexes and factories', place, brandName, call);
    }
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
  }

  const softenerFaqs = [
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

  if (kind === 'apartment-softener') {
    return [
      {
        q: `Do you install apartment water softeners in ${place}?`,
        a: `Yes. ${brandName} installs flat-wise and centralized apartment water softeners in ${place} for multi-storey buildings and gated communities, with salt setup and after-sales ${SERVICE_RADIUS}.`,
      },
      ...softenerFaqs,
    ];
  }
  if (kind === 'softener-install') {
    return [
      {
        q: `What is included in new water softener installation in ${place}?`,
        a: `In ${place}, ${brandName} sizes the unit for hardness, plumbs inlet and drain, sets the valve, loads salt/resin as quoted, and shows you how to refill. Starting visit from ₹499 (resin extra).`,
      },
      ...softenerFaqs,
    ];
  }
  return softenerFaqs;
}
