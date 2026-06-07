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
}

export const locationSeoList: LocationSEO[] = [
  // ---- Bengaluru areas ----
  { slug: 'ro-service-whitefield', name: 'Whitefield', pincode: '560066', region: 'Bengaluru', nearby: ['ITPL', 'Kadugodi', 'Brookefield', 'Hoodi', 'Varthur', 'Kundalahalli'] },
  { slug: 'ro-service-electronic-city', name: 'Electronic City', pincode: '560100', region: 'Bengaluru', nearby: ['Phase 1', 'Phase 2', 'Bommasandra', 'Hosur Road', 'Chandapura', 'Jigani'] },
  { slug: 'ro-service-koramangala', name: 'Koramangala', pincode: '560034', region: 'Bengaluru', nearby: ['HSR Layout', 'BTM Layout', 'Ejipura', 'Madiwala', 'Adugodi', 'Indiranagar'] },
  { slug: 'ro-service-hsr-layout', name: 'HSR Layout', pincode: '560102', region: 'Bengaluru', nearby: ['Koramangala', 'BTM Layout', 'Bellandur', 'Sarjapur Road', 'Agara', 'Silk Board'] },
  { slug: 'ro-service-indiranagar', name: 'Indiranagar', pincode: '560038', region: 'Bengaluru', nearby: ['Domlur', 'CV Raman Nagar', 'Ulsoor', 'Jeevan Bima Nagar', 'Halasuru', 'HAL'] },
  { slug: 'ro-service-marathahalli', name: 'Marathahalli', pincode: '560037', region: 'Bengaluru', nearby: ['Kundalahalli', 'Brookefield', 'AECS Layout', 'Munnekollal', 'Bellandur', 'HAL'] },
  { slug: 'ro-service-btm-layout', name: 'BTM Layout', pincode: '560076', region: 'Bengaluru', nearby: ['Koramangala', 'HSR Layout', 'Madiwala', 'JP Nagar', 'Bannerghatta Road', 'Silk Board'] },
  { slug: 'ro-service-jayanagar', name: 'Jayanagar', pincode: '560011', region: 'Bengaluru', nearby: ['JP Nagar', 'Banashankari', 'Basavanagudi', 'BTM Layout', 'Wilson Garden', 'Tilak Nagar'] },
  { slug: 'ro-service-malleshwaram', name: 'Malleshwaram', pincode: '560003', region: 'Bengaluru', nearby: ['Rajajinagar', 'Seshadripuram', 'Yeshwanthpur', 'Sadashivanagar', 'Sandal Soap Factory', 'Mahalakshmi Layout'] },
  { slug: 'ro-service-rajajinagar', name: 'Rajajinagar', pincode: '560010', region: 'Bengaluru', nearby: ['Malleshwaram', 'Vijayanagar', 'Basaveshwaranagar', 'Mahalakshmi Layout', 'Yeshwanthpur', 'Magadi Road'] },
  { slug: 'ro-service-hebbal', name: 'Hebbal', pincode: '560024', region: 'Bengaluru', nearby: ['Yelahanka', 'Sahakar Nagar', 'RT Nagar', 'Nagawara', 'Manyata Tech Park', 'Hennur'] },
  { slug: 'ro-service-yelahanka', name: 'Yelahanka', pincode: '560064', region: 'Bengaluru', nearby: ['Hebbal', 'Sahakar Nagar', 'Jakkur', 'Kogilu', 'Doddaballapur Road', 'Bagalur'] },
  { slug: 'ro-service-sarjapur', name: 'Sarjapur', pincode: '562125', region: 'Bengaluru', nearby: ['Sarjapur Road', 'Bellandur', 'Wipro Gate', 'Kodathi', 'Dommasandra', 'Carmelaram'] },
  { slug: 'ro-service-bellandur', name: 'Bellandur', pincode: '560103', region: 'Bengaluru', nearby: ['Sarjapur Road', 'HSR Layout', 'Marathahalli', 'Kadubeesanahalli', 'Panathur', 'Devarabeesanahalli'] },
  { slug: 'ro-service-jp-nagar', name: 'JP Nagar', pincode: '560078', region: 'Bengaluru', nearby: ['Jayanagar', 'Banashankari', 'BTM Layout', 'Bannerghatta Road', 'Sarakki', 'Puttenahalli'] },
  { slug: 'ro-service-banashankari', name: 'Banashankari', pincode: '560070', region: 'Bengaluru', nearby: ['JP Nagar', 'Basavanagudi', 'Kathriguppe', 'Padmanabhanagar', 'Kumaraswamy Layout', 'Uttarahalli'] },
  { slug: 'ro-service-bommanahalli', name: 'Bommanahalli', pincode: '560068', region: 'Bengaluru', nearby: ['Silk Board', 'HSR Layout', 'Hongasandra', 'Begur', 'Hosur Road', 'Madiwala'] },
  { slug: 'ro-service-bannerghatta', name: 'Bannerghatta Road', pincode: '560076', region: 'Bengaluru', nearby: ['BTM Layout', 'JP Nagar', 'Arekere', 'Gottigere', 'Hulimavu', 'Bilekahalli'] },

  // ---- Nearby cities & towns (Greater Bengaluru / Karnataka) ----
  { slug: 'ro-service-tumakuru', name: 'Tumakuru', region: 'Karnataka', nearby: ['Tumkur', 'Sira', 'Gubbi', 'Kunigal', 'Tiptur', 'Tumkur Road'] },
  { slug: 'ro-service-hosur', name: 'Hosur', region: 'Tamil Nadu (Bengaluru border)', nearby: ['Electronic City', 'Attibele', 'Anekal', 'Bommasandra', 'Chandapura', 'Bagalur'] },
  { slug: 'ro-service-kolar', name: 'Kolar', region: 'Karnataka', nearby: ['Kolar Gold Fields (KGF)', 'Bangarapet', 'Mulbagal', 'Malur', 'Srinivaspur', 'Budikote'] },
  { slug: 'ro-service-ramanagara', name: 'Ramanagara', region: 'Karnataka', nearby: ['Channapatna', 'Bidadi', 'Kanakapura', 'Magadi', 'Harohalli', 'Mysore Road'] },
  { slug: 'ro-service-nelamangala', name: 'Nelamangala', region: 'Karnataka', nearby: ['Dabaspete', 'Tumkur Road', 'Doddaballapur', 'Sompura', 'Bashettihalli', 'Solur'] },
  { slug: 'ro-service-doddaballapur', name: 'Doddaballapur', region: 'Karnataka', nearby: ['Yelahanka', 'Devanahalli', 'Nelamangala', 'Bashettihalli', 'Rajanukunte', 'Chikkaballapur'] },
  { slug: 'ro-service-devanahalli', name: 'Devanahalli', region: 'Karnataka', nearby: ['Kempegowda Airport', 'Yelahanka', 'Doddaballapur', 'Vijayapura', 'Bagalur', 'Budigere'] },
  { slug: 'ro-service-anekal', name: 'Anekal', region: 'Karnataka', nearby: ['Attibele', 'Chandapura', 'Bommasandra', 'Jigani', 'Hosur Road', 'Sarjapur'] },
];

const SERVICES_LABEL = 'RO installation, repair, filter replacement & water softener';

export function getLocationSeo(pathname: string): LocationSEO | null {
  const slug = pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  return locationSeoList.find((l) => l.slug === slug) ?? null;
}

export function buildLocationTitle(loc: LocationSEO): string {
  return `RO Service in ${loc.name} | Installation, Repair & AMC - Hydrogen RO`;
}

export function buildLocationDescription(loc: LocationSEO): string {
  const place = loc.region === 'Bengaluru' ? `${loc.name}, Bengaluru` : loc.name;
  return `Looking for RO service in ${place}? Hydrogen RO offers same-day ${SERVICES_LABEL} by certified technicians${loc.pincode ? ` (pincode ${loc.pincode})` : ''}. Genuine spare parts, transparent pricing, 24/7 support. Call +91-8884944288.`;
}

export function buildLocationIntro(loc: LocationSEO): string {
  const place = loc.region === 'Bengaluru' ? `${loc.name}, Bengaluru` : `${loc.name}, ${loc.region}`;
  return `Hydrogen RO is the trusted choice for RO water purifier service in ${place}. Our certified technicians provide same-day RO installation, repair, filter & membrane replacement, water softener service and annual maintenance (AMC) for all major brands${loc.pincode ? ` across pincode ${loc.pincode}` : ''}. Book online or call us for fast, doorstep service.`;
}
