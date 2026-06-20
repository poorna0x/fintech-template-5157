// Per-location SEO data so each /ro-service-* route renders a UNIQUE
// title, H1, description and localized content (avoids thin/duplicate pages).

export interface LocationSEO {
  /** URL path without leading slash, e.g. "ro-service-whitefield" */
  slug: string;
  /** Display name of the area / city */
  name: string;
  /** Primary pincode (areas only) */
  pincode?: string;
  /** "Bengaluru" for city areas, or "Karnataka" for nearby cities */
  region: string;
  /** Nearby localities shown as visible, crawlable content */
  nearby: string[];
  /** Extra search phrases for meta keywords (optional) */
  extraKeywords?: string[];
}

/** South & southeast Bengaluru corridor — high-intent local search terms */
export const SOUTH_CORRIDOR_KEYWORDS =
  'RO service Electronic City, RO service Bommanahalli, RO service Sarjapur, RO service Attibele, RO service Chandapura, RO service Bommasandra, RO service Jigani, RO service Hosur Road, RO service Silk Board, RO service Sarjapur Road, RO service Bellandur, RO service HSR Layout, RO service Anekal, RO service Singasandra, RO repair Electronic City Phase 1, RO repair Electronic City Phase 2, RO installation Bommanahalli, RO service near Electronic City, RO service South Bangalore';

export const locationSeoList: LocationSEO[] = [
  // ---- Bengaluru areas ----
  { slug: 'ro-service-whitefield', name: 'Whitefield', pincode: '560066', region: 'Bengaluru', nearby: ['ITPL', 'Kadugodi', 'Brookefield', 'Hoodi', 'Varthur', 'Kundalahalli'] },
  {
    slug: 'ro-service-electronic-city',
    name: 'Electronic City',
    pincode: '560100',
    region: 'Bengaluru',
    nearby: ['Phase 1', 'Phase 2', 'Bommasandra', 'Hosur Road', 'Chandapura', 'Jigani', 'Attibele', 'Anekal'],
    extraKeywords: [
      'RO service Electronic City Phase 1',
      'RO service Electronic City Phase 2',
      'RO repair Electronic City Bangalore',
      'RO installation Electronic City',
      'RO service Bommasandra',
      'RO service near Electronic City',
      'RO service Hosur Road Electronic City',
      'RO AMC Electronic City',
      'Kent RO service Electronic City',
      'Aquaguard RO service Electronic City',
      '560100 RO service',
    ],
  },
  { slug: 'ro-service-koramangala', name: 'Koramangala', pincode: '560034', region: 'Bengaluru', nearby: ['HSR Layout', 'BTM Layout', 'Ejipura', 'Madiwala', 'Adugodi', 'Indiranagar'] },
  {
    slug: 'ro-service-hsr-layout',
    name: 'HSR Layout',
    pincode: '560102',
    region: 'Bengaluru',
    nearby: ['Koramangala', 'BTM Layout', 'Bellandur', 'Sarjapur Road', 'Agara', 'Silk Board', 'Bommanahalli'],
    extraKeywords: ['RO service HSR Layout Sector 1', 'RO service HSR Layout Sector 2', 'RO service Agara', 'RO service Silk Board HSR'],
  },
  { slug: 'ro-service-indiranagar', name: 'Indiranagar', pincode: '560038', region: 'Bengaluru', nearby: ['Domlur', 'CV Raman Nagar', 'Ulsoor', 'Jeevan Bima Nagar', 'Halasuru', 'HAL'] },
  { slug: 'ro-service-marathahalli', name: 'Marathahalli', pincode: '560037', region: 'Bengaluru', nearby: ['Kundalahalli', 'Brookefield', 'AECS Layout', 'Munnekollal', 'Bellandur', 'HAL'] },
  { slug: 'ro-service-btm-layout', name: 'BTM Layout', pincode: '560076', region: 'Bengaluru', nearby: ['Koramangala', 'HSR Layout', 'Madiwala', 'JP Nagar', 'Bannerghatta Road', 'Silk Board', 'Bommanahalli'] },
  { slug: 'ro-service-jayanagar', name: 'Jayanagar', pincode: '560011', region: 'Bengaluru', nearby: ['JP Nagar', 'Banashankari', 'Basavanagudi', 'BTM Layout', 'Wilson Garden', 'Tilak Nagar'] },
  { slug: 'ro-service-malleshwaram', name: 'Malleshwaram', pincode: '560003', region: 'Bengaluru', nearby: ['Rajajinagar', 'Seshadripuram', 'Yeshwanthpur', 'Sadashivanagar', 'Sandal Soap Factory', 'Mahalakshmi Layout'] },
  { slug: 'ro-service-rajajinagar', name: 'Rajajinagar', pincode: '560010', region: 'Bengaluru', nearby: ['Malleshwaram', 'Vijayanagar', 'Basaveshwaranagar', 'Mahalakshmi Layout', 'Yeshwanthpur', 'Magadi Road'] },
  { slug: 'ro-service-hebbal', name: 'Hebbal', pincode: '560024', region: 'Bengaluru', nearby: ['Yelahanka', 'Sahakar Nagar', 'RT Nagar', 'Nagawara', 'Manyata Tech Park', 'Hennur'] },
  { slug: 'ro-service-yelahanka', name: 'Yelahanka', pincode: '560064', region: 'Bengaluru', nearby: ['Hebbal', 'Sahakar Nagar', 'Jakkur', 'Kogilu', 'Doddaballapur Road', 'Bagalur'] },
  {
    slug: 'ro-service-sarjapur',
    name: 'Sarjapur',
    pincode: '562125',
    region: 'Bengaluru',
    nearby: ['Sarjapur Road', 'Bellandur', 'Wipro Gate', 'Kodathi', 'Dommasandra', 'Carmelaram', 'HSR Layout', 'Outer Ring Road'],
    extraKeywords: [
      'RO service Sarjapur Road',
      'RO repair Sarjapur Bangalore',
      'RO installation Sarjapur Road',
      'RO service Kodathi',
      'RO service Dommasandra',
      'RO service Carmelaram',
      'RO service Wipro Gate Sarjapur',
      'RO service Outer Ring Road Sarjapur',
      '562125 RO service',
    ],
  },
  {
    slug: 'ro-service-bellandur',
    name: 'Bellandur',
    pincode: '560103',
    region: 'Bengaluru',
    nearby: ['Sarjapur Road', 'HSR Layout', 'Marathahalli', 'Kadubeesanahalli', 'Panathur', 'Devarabeesanahalli', 'Outer Ring Road'],
    extraKeywords: ['RO service Sarjapur Road Bellandur', 'RO service Kadubeesanahalli', 'RO service Panathur', 'RO service ORR Bellandur'],
  },
  { slug: 'ro-service-jp-nagar', name: 'JP Nagar', pincode: '560078', region: 'Bengaluru', nearby: ['Jayanagar', 'Banashankari', 'BTM Layout', 'Bannerghatta Road', 'Sarakki', 'Puttenahalli', 'Anjanapura'] },
  { slug: 'ro-service-banashankari', name: 'Banashankari', pincode: '560070', region: 'Bengaluru', nearby: ['JP Nagar', 'Basavanagudi', 'Kathriguppe', 'Padmanabhanagar', 'Kumaraswamy Layout', 'Uttarahalli'] },
  {
    slug: 'ro-service-bommanahalli',
    name: 'Bommanahalli',
    pincode: '560068',
    region: 'Bengaluru',
    nearby: ['Silk Board', 'HSR Layout', 'Hongasandra', 'Begur', 'Hosur Road', 'Madiwala', 'Electronic City', 'Singasandra'],
    extraKeywords: [
      'RO service Bommanahalli Bangalore',
      'RO repair Bommanahalli',
      'RO installation Bommanahalli',
      'RO service Silk Board',
      'RO service Hosur Road Bommanahalli',
      'RO service Hongasandra',
      'RO service Begur',
      'RO service Singasandra',
      'RO service near Electronic City Bommanahalli',
      '560068 RO service',
      'RO AMC Bommanahalli',
    ],
  },
  { slug: 'ro-service-bannerghatta', name: 'Bannerghatta Road', pincode: '560076', region: 'Bengaluru', nearby: ['BTM Layout', 'JP Nagar', 'Arekere', 'Gottigere', 'Hulimavu', 'Bilekahalli', 'Anjanapura'] },
  {
    slug: 'ro-service-anjanapura',
    name: 'Anjanapura',
    pincode: '560108',
    region: 'Bengaluru',
    nearby: ['Anjanapura Township', 'JP Nagar', 'Bannerghatta', 'Bommanahalli', 'Gottigere', 'Konanakunte', 'Kanakapura Road'],
    extraKeywords: ['RO service Anjanapura Township', 'RO service South Bangalore Anjanapura', '560108 RO service'],
  },
  {
    slug: 'ro-service-attibele',
    name: 'Attibele',
    pincode: '562107',
    region: 'Bengaluru',
    nearby: ['Chandapura', 'Bommasandra', 'Jigani', 'Anekal', 'Hosur Road', 'Electronic City', 'Hosur border'],
    extraKeywords: [
      'RO service Attibele Bangalore',
      'RO repair Attibele',
      'RO installation Attibele',
      'RO service near Electronic City Attibele',
      'RO service Chandapura Attibele',
      'RO service Bommasandra Attibele',
      'RO service Anekal Attibele',
      '562107 RO service',
    ],
  },
  {
    slug: 'ro-service-chandapura',
    name: 'Chandapura',
    pincode: '560099',
    region: 'Bengaluru',
    nearby: ['Attibele', 'Bommasandra', 'Jigani', 'Electronic City', 'Anekal', 'Hosur Road', 'Hebbagodi'],
    extraKeywords: [
      'RO service Chandapura Bangalore',
      'RO repair Chandapura',
      'RO service near Electronic City Chandapura',
      'RO service Bommasandra Chandapura',
      'RO service Attibele Chandapura',
    ],
  },
  {
    slug: 'ro-service-bommasandra',
    name: 'Bommasandra',
    pincode: '560099',
    region: 'Bengaluru',
    nearby: ['Electronic City', 'Chandapura', 'Attibele', 'Jigani', 'Anekal', 'Hosur Road', 'Hebbagodi'],
    extraKeywords: [
      'RO service Bommasandra Industrial Area',
      'RO repair Bommasandra',
      'RO service near Electronic City Bommasandra',
      'RO installation Bommasandra',
    ],
  },
  {
    slug: 'ro-service-jigani',
    name: 'Jigani',
    pincode: '560105',
    region: 'Bengaluru',
    nearby: ['Anekal', 'Attibele', 'Chandapura', 'Bommasandra', 'Electronic City', 'Hosur Road'],
    extraKeywords: ['RO service Jigani Industrial Area', 'RO repair Jigani', 'RO service near Anekal Jigani'],
  },
  {
    slug: 'ro-service-singasandra',
    name: 'Singasandra',
    pincode: '560068',
    region: 'Bengaluru',
    nearby: ['Bommanahalli', 'Hosur Road', 'HSR Layout', 'Madiwala', 'Electronic City', 'Hongasandra'],
    extraKeywords: ['RO service Singasandra Bangalore', 'RO repair Singasandra', 'RO service Hosur Road Singasandra'],
  },
  { slug: 'ro-service-mahadevapura', name: 'Mahadevapura', pincode: '560048', region: 'Bengaluru', nearby: ['Whitefield', 'Brookefield', 'Hoodi', 'Kundalahalli', 'Marathahalli', 'KR Puram'] },
  { slug: 'ro-service-hoodi', name: 'Hoodi', pincode: '560048', region: 'Bengaluru', nearby: ['Whitefield', 'Mahadevapura', 'Brookefield', 'ITPL', 'Kadugodi'] },
  { slug: 'ro-service-brookefield', name: 'Brookefield', pincode: '560037', region: 'Bengaluru', nearby: ['Whitefield', 'Kundalahalli', 'Marathahalli', 'Mahadevapura', 'Hoodi'] },
  { slug: 'ro-service-yeshwanthpur', name: 'Yeshwanthpur', pincode: '560022', region: 'Bengaluru', nearby: ['Peenya', 'Malleshwaram', 'Rajajinagar', 'Mahalakshmi Layout', 'Tumkur Road'] },
  { slug: 'ro-service-peenya', name: 'Peenya', pincode: '560058', region: 'Bengaluru', nearby: ['Yeshwanthpur', 'Peenya Industrial Area', 'Nagasandra', 'Tumkur Road', 'Jalahalli'] },
  { slug: 'ro-service-vijayanagar', name: 'Vijayanagar', pincode: '560040', region: 'Bengaluru', nearby: ['Rajajinagar', 'Basaveshwaranagar', 'Nagarbhavi', 'Magadi Road', 'Deepanjali Nagar'] },
  { slug: 'ro-service-basavanagudi', name: 'Basavanagudi', pincode: '560004', region: 'Bengaluru', nearby: ['Jayanagar', 'Banashankari', 'Gandhi Bazaar', 'NR Colony', 'Vidyapeeta'] },
  { slug: 'ro-service-nagarbhavi', name: 'Nagarbhavi', pincode: '560072', region: 'Bengaluru', nearby: ['Vijayanagar', 'Kengeri', 'Moodalapalya', 'Ullal', 'Nagarbhavi Circle'] },
  { slug: 'ro-service-kengeri', name: 'Kengeri', pincode: '560060', region: 'Bengaluru', nearby: ['Nagarbhavi', 'RR Nagar', 'Kumbalgodu', 'Mysore Road', 'Kommaghatta'] },
  { slug: 'ro-service-hennur', name: 'Hennur', pincode: '560043', region: 'Bengaluru', nearby: ['Kalyan Nagar', 'Kammanahalli', 'HRBR Layout', 'Hebbal', 'Banaswadi'] },
  { slug: 'ro-service-kalyan-nagar', name: 'Kalyan Nagar', pincode: '560043', region: 'Bengaluru', nearby: ['Hennur', 'Kammanahalli', 'HRBR Layout', 'Banaswadi', 'Ramamurthy Nagar'] },
  { slug: 'ro-service-kammanahalli', name: 'Kammanahalli', pincode: '560043', region: 'Bengaluru', nearby: ['Kalyan Nagar', 'Hennur', 'Banaswadi', 'HRBR Layout', 'Cox Town'] },
  { slug: 'ro-service-jalahalli', name: 'Jalahalli', pincode: '560013', region: 'Bengaluru', nearby: ['Peenya', 'Yeshwanthpur', 'Nagasandra', 'T Dasarahalli', 'MS Palya'] },
  { slug: 'ro-service-ulsoor', name: 'Ulsoor', pincode: '560008', region: 'Bengaluru', nearby: ['Indiranagar', 'Halasuru', 'Domlur', 'MG Road', 'Cox Town'] },
  { slug: 'ro-service-frazer-town', name: 'Frazer Town', pincode: '560005', region: 'Bengaluru', nearby: ['Ulsoor', 'Cox Town', 'Benson Town', 'Richmond Town', 'Shivajinagar'] },

  // ---- Nearby cities & towns (Greater Bengaluru / Karnataka) ----
  { slug: 'ro-service-tumakuru', name: 'Tumakuru', region: 'Karnataka', nearby: ['Tumkur', 'Sira', 'Gubbi', 'Kunigal', 'Tiptur', 'Tumkur Road'] },
  { slug: 'ro-service-hosur', name: 'Hosur', region: 'Tamil Nadu (Bengaluru border)', nearby: ['Electronic City', 'Attibele', 'Anekal', 'Bommasandra', 'Chandapura', 'Bagalur'] },
  { slug: 'ro-service-kolar', name: 'Kolar', region: 'Karnataka', nearby: ['Kolar Gold Fields (KGF)', 'Bangarapet', 'Mulbagal', 'Malur', 'Srinivaspur', 'Budikote'] },
  { slug: 'ro-service-ramanagara', name: 'Ramanagara', region: 'Karnataka', nearby: ['Channapatna', 'Bidadi', 'Kanakapura', 'Magadi', 'Harohalli', 'Mysore Road'] },
  { slug: 'ro-service-nelamangala', name: 'Nelamangala', region: 'Karnataka', nearby: ['Dabaspete', 'Tumkur Road', 'Doddaballapur', 'Sompura', 'Bashettihalli', 'Solur'] },
  { slug: 'ro-service-doddaballapur', name: 'Doddaballapur', region: 'Karnataka', nearby: ['Yelahanka', 'Devanahalli', 'Nelamangala', 'Bashettihalli', 'Rajanukunte', 'Chikkaballapur'] },
  { slug: 'ro-service-devanahalli', name: 'Devanahalli', region: 'Karnataka', nearby: ['Kempegowda Airport', 'Yelahanka', 'Doddaballapur', 'Vijayapura', 'Bagalur', 'Budigere'] },
  {
    slug: 'ro-service-anekal',
    name: 'Anekal',
    region: 'Karnataka',
    nearby: ['Attibele', 'Chandapura', 'Bommasandra', 'Jigani', 'Hosur Road', 'Sarjapur', 'Electronic City'],
    extraKeywords: ['RO service Anekal Bangalore', 'RO repair Anekal', 'RO service near Attibele Anekal', 'RO service Hosur Road Anekal'],
  },
];

const SERVICES_LABEL = 'RO installation, repair, filter replacement & water softener';

export function getLocationSeo(pathname: string): LocationSEO | null {
  const slug = pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  return locationSeoList.find((l) => l.slug === slug) ?? null;
}

export function buildLocationKeywords(loc: LocationSEO, brandName: string): string {
  const parts = [
    `RO service ${loc.name}`,
    `RO repair ${loc.name}`,
    `RO installation ${loc.name}`,
    `RO service ${loc.name} Bangalore`,
    `RO service ${loc.name} Bengaluru`,
    `${brandName} ${loc.name}`,
    ...loc.nearby.flatMap((n) => [`RO service ${n}`, `RO repair ${n}`]),
    ...(loc.extraKeywords ?? []),
  ];
  if (loc.pincode) parts.push(`RO service ${loc.pincode}`, `${loc.pincode} RO repair`);
  return [...new Set(parts)].join(', ');
}

export function buildLocationTitle(loc: LocationSEO, brandName = 'Hydrogen RO'): string {
  return `RO Service in ${loc.name} | Installation, Repair & AMC - ${brandName}`;
}

export function buildLocationDescription(loc: LocationSEO, brandName = 'Hydrogen RO', phone = '+91-8884944288'): string {
  const place = loc.region === 'Bengaluru' ? `${loc.name}, Bengaluru` : loc.name;
  const nearbyText = loc.nearby.length ? ` Also serving ${loc.nearby.slice(0, 5).join(', ')}.` : '';
  return `Looking for RO service in ${place}? ${brandName} offers same-day ${SERVICES_LABEL} by certified technicians${loc.pincode ? ` (pincode ${loc.pincode})` : ''}.${nearbyText} Genuine spare parts, transparent pricing, 24/7 support. Call ${phone}.`;
}

export function buildLocationIntro(loc: LocationSEO, brandName = 'Hydrogen RO'): string {
  const place = loc.region === 'Bengaluru' ? `${loc.name}, Bengaluru` : `${loc.name}, ${loc.region}`;
  return `${brandName} is the trusted choice for RO water purifier service in ${place}. Our certified technicians provide same-day RO installation, repair, filter & membrane replacement, water softener service and annual maintenance (AMC) for all major brands${loc.pincode ? ` across pincode ${loc.pincode}` : ''}. We also cover nearby areas including ${loc.nearby.join(', ')}. Book online or call us for fast, doorstep service.`;
}
