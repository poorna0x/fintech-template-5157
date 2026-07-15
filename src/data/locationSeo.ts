// Per-location SEO data so each /ro-service-* route renders a UNIQUE
// title, H1, description and localized content (avoids thin/duplicate pages).

import { karnatakaSeedsToLocationSeo, KARNATAKA_LOCATION_SEEDS } from '@/data/karnatakaLocationSeeds';
import { ALL_MICRO_AREA_SEEDS } from '@/data/karnatakaMicroAreas';
import { KARNATAKA_DISTRICT_EXPANSION_SEEDS } from '@/data/karnatakaDistrictExpansion';
import { BENGALURU_ZONE_EXPANSION } from '@/data/bengaluruZoneExpansion';

export interface LocationSEO {
  /** URL path without leading slash, e.g. "ro-service-whitefield" */
  slug: string;
  /** Display name of the area / city */
  name: string;
  /** Primary pincode (areas only) */
  pincode?: string;
  /** "Bengaluru" for city areas, or "Karnataka" for nearby cities */
  region: string;
  /** Karnataka district for local SEO schema */
  district?: string;
  /** Nearby localities shown as visible, crawlable content */
  nearby: string[];
  /** Extra search phrases for meta keywords (optional) */
  extraKeywords?: string[];
}

/** South & southeast Bengaluru corridor — high-intent local search terms */
export const SOUTH_CORRIDOR_KEYWORDS =
  'RO service Electronic City, RO service Bommanahalli, RO service Sarjapur, RO service Sarjapura, RO service Attibele, RO service Chandapura, RO service Bommasandra, RO service Jigani, RO service Hosur Road, RO service Silk Board, RO service Sarjapur Road, RO service Bellandur, RO service HSR Layout, RO service Anekal, RO service Singasandra, RO service Haralur, RO service Varthur, RO service Kadubeesanahalli, RO service Panathur, RO repair Electronic City Phase 1, RO repair Electronic City Phase 2, RO installation Bommanahalli, RO service near Electronic City, RO service South Bangalore';

/** North & northeast Bengaluru corridor — Yelahanka, Devanahalli, airport belt */
export const NORTH_CORRIDOR_KEYWORDS =
  'RO service Yelahanka, RO service Thanisandra, RO service Jakkur, RO service Bagalur, RO service Budigere Cross, RO service Devanahalli, RO service Kempegowda Airport, RO service Manyata Tech Park, RO service RT Nagar, RO service Nagawara, RO service Hebbal, RO service Hoskote, RO service ITPL, RO repair North Bangalore, RO installation Yelahanka, RO service Doddaballapur Road';

const BENGALURU_LOCATION_PAGES: LocationSEO[] = [
  { slug: 'ro-service-whitefield', name: 'Whitefield', pincode: '560066', region: 'Bengaluru', nearby: ['ITPL', 'Kadugodi', 'Brookefield', 'Hoodi', 'Varthur', 'Kundalahalli', 'Mahadevapura'], extraKeywords: ['RO service ITPL Whitefield', 'RO service Varthur Whitefield', 'RO service Kadugodi', '560066 RO service'] },
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
  { slug: 'ro-service-hebbal', name: 'Hebbal', pincode: '560024', region: 'Bengaluru', nearby: ['Yelahanka', 'Sahakar Nagar', 'RT Nagar', 'Nagawara', 'Manyata Tech Park', 'Hennur', 'Thanisandra'], extraKeywords: ['RO service Manyata Tech Park', 'RO service Nagawara Hebbal', 'RO service RT Nagar Hebbal'] },
  {
    slug: 'ro-service-yelahanka',
    name: 'Yelahanka',
    pincode: '560064',
    region: 'Bengaluru',
    nearby: ['Hebbal', 'Sahakar Nagar', 'Jakkur', 'Kogilu', 'Doddaballapur Road', 'Bagalur', 'Thanisandra', 'RT Nagar'],
    extraKeywords: [
      'RO service Yelahanka New Town',
      'RO service Yelahanka Old Town',
      'RO repair Yelahanka Bangalore',
      'RO service Thanisandra Yelahanka',
      'RO service Jakkur Yelahanka',
      'RO service Bagalur Yelahanka',
      'RO service Doddaballapur Road Yelahanka',
      '560064 RO service',
    ],
  },
  {
    slug: 'ro-service-sarjapur',
    name: 'Sarjapur',
    pincode: '562125',
    region: 'Bengaluru',
    nearby: ['Sarjapur Road', 'Bellandur', 'Wipro Gate', 'Kodathi', 'Dommasandra', 'Carmelaram', 'HSR Layout', 'Outer Ring Road'],
    extraKeywords: [
      'RO service Sarjapur Road',
      'RO service Sarjapura',
      'RO repair Sarjapur Bangalore',
      'RO repair Sarjapura Bangalore',
      'RO installation Sarjapur Road',
      'RO service Kodathi',
      'RO service Dommasandra',
      'RO service Carmelaram',
      'RO service Wipro Gate Sarjapur',
      'RO service Outer Ring Road Sarjapur',
      'RO service Haralur Sarjapur',
      'RO service Attibele Road Sarjapur',
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
      'RO service Sarjapura Attibele',
      'RO service Hosur border Attibele',
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
  {
    slug: 'ro-service-kr-puram',
    name: 'KR Puram',
    pincode: '560036',
    region: 'Bengaluru',
    nearby: ['Mahadevapura', 'Banaswadi', 'Kasturi Nagar', 'Baiyappanahalli', 'Ramamurthy Nagar', 'Hennur', 'Old Madras Road'],
    extraKeywords: [
      'RO service KR Puram Bangalore',
      'RO service Krishnarajapuram',
      'RO repair K R Puram',
      'RO service KR Puram Railway Station',
      '560036 RO service',
    ],
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

  // ---- High-traffic Bengaluru localities (expanded coverage) ----
  {
    slug: 'ro-service-budigere-cross',
    name: 'Budigere Cross',
    pincode: '562110',
    region: 'Bengaluru',
    nearby: ['Devanahalli', 'Bagalur', 'Hoskote', 'Whitefield', 'Mahadevapura', 'Old Madras Road', 'Budigere'],
    extraKeywords: ['RO service Budigere', 'RO service Budigere Cross Bangalore', 'RO repair Budigere Cross', '562110 RO service', 'RO service near Devanahalli Budigere'],
  },
  {
    slug: 'ro-service-varthur',
    name: 'Varthur',
    pincode: '560087',
    region: 'Bengaluru',
    nearby: ['Whitefield', 'Marathahalli', 'Bellandur', 'Kadubeesanahalli', 'Panathur', 'Sarjapur Road', 'HAL'],
    extraKeywords: ['RO service Varthur Road', 'RO service Varthur Lake', 'RO repair Varthur Bangalore', '560087 RO service'],
  },
  {
    slug: 'ro-service-kadubeesanahalli',
    name: 'Kadubeesanahalli',
    pincode: '560103',
    region: 'Bengaluru',
    nearby: ['Bellandur', 'Panathur', 'Marathahalli', 'Sarjapur Road', 'Outer Ring Road', 'Varthur'],
    extraKeywords: ['RO service Kadubeesanahalli ORR', 'RO repair Kadubeesanahalli', 'RO service Outer Ring Road Kadubeesanahalli'],
  },
  {
    slug: 'ro-service-panathur',
    name: 'Panathur',
    pincode: '560103',
    region: 'Bengaluru',
    nearby: ['Kadubeesanahalli', 'Bellandur', 'Sarjapur Road', 'Marathahalli', 'Varthur', 'Outer Ring Road'],
    extraKeywords: ['RO service Panathur Bangalore', 'RO repair Panathur', 'RO service Panathur ORR'],
  },
  {
    slug: 'ro-service-haralur',
    name: 'Haralur',
    pincode: '560102',
    region: 'Bengaluru',
    nearby: ['HSR Layout', 'Sarjapur Road', 'Bellandur', 'Kasavanahalli', 'Kaikondrahalli', 'Agara'],
    extraKeywords: ['RO service Haralur Road', 'RO service Haralur HSR', 'RO repair Haralur Bangalore', 'RO service Kasavanahalli'],
  },
  {
    slug: 'ro-service-thanisandra',
    name: 'Thanisandra',
    pincode: '560077',
    region: 'Bengaluru',
    nearby: ['Hebbal', 'Yelahanka', 'Nagawara', 'Hennur', 'Kalyan Nagar', 'Manyata Tech Park', 'Banaswadi'],
    extraKeywords: ['RO service Thanisandra Main Road', 'RO repair Thanisandra Bangalore', '560077 RO service', 'RO service near Manyata Thanisandra'],
  },
  {
    slug: 'ro-service-jakkur',
    name: 'Jakkur',
    pincode: '560064',
    region: 'Bengaluru',
    nearby: ['Yelahanka', 'Hebbal', 'Sahakar Nagar', 'Thanisandra', 'Bagalur', 'Kogilu'],
    extraKeywords: ['RO service Jakkur Bangalore', 'RO repair Jakkur', 'RO service Jakkur Lake area'],
  },
  {
    slug: 'ro-service-bagalur',
    name: 'Bagalur',
    pincode: '560064',
    region: 'Bengaluru',
    nearby: ['Yelahanka', 'Devanahalli', 'Budigere Cross', 'Jakkur', 'Hosur border', 'Kempegowda Airport'],
    extraKeywords: ['RO service Bagalur Bangalore', 'RO repair Bagalur', 'RO service near Airport Bagalur', 'RO service Bagalur Main Road'],
  },
  {
    slug: 'ro-service-manyata-tech-park',
    name: 'Manyata Tech Park',
    pincode: '560045',
    region: 'Bengaluru',
    nearby: ['Hebbal', 'Nagawara', 'Thanisandra', 'RT Nagar', 'Hennur', 'Kalyan Nagar'],
    extraKeywords: ['RO service Manyata Embassy Business Park', 'RO service Nagawara Manyata', 'RO repair Manyata Tech Park', 'RO service Hebbal Manyata'],
  },
  {
    slug: 'ro-service-rt-nagar',
    name: 'RT Nagar',
    pincode: '560032',
    region: 'Bengaluru',
    nearby: ['Hebbal', 'Yelahanka', 'Sahakar Nagar', 'Manyata Tech Park', 'Sanjaynagar', 'Ganganagar'],
    extraKeywords: ['RO service RT Nagar Bangalore', 'RO repair RT Nagar', '560032 RO service'],
  },
  {
    slug: 'ro-service-nagawara',
    name: 'Nagawara',
    pincode: '560045',
    region: 'Bengaluru',
    nearby: ['Hebbal', 'Manyata Tech Park', 'Thanisandra', 'Hennur', 'Kalyan Nagar', 'Banaswadi'],
    extraKeywords: ['RO service Nagawara Bangalore', 'RO repair Nagawara', 'RO service Outer Ring Road Nagawara'],
  },
  {
    slug: 'ro-service-hoskote',
    name: 'Hoskote',
    pincode: '562114',
    region: 'Karnataka',
    nearby: ['Whitefield', 'Budigere Cross', 'Mahadevapura', 'Old Madras Road', 'K R Puram', 'Devanahalli'],
    extraKeywords: ['RO service Hoskote Bangalore', 'RO repair Hoskote', 'RO service near Whitefield Hoskote', '562114 RO service'],
  },
  {
    slug: 'ro-service-itpl',
    name: 'ITPL',
    pincode: '560066',
    region: 'Bengaluru',
    nearby: ['Whitefield', 'Brookefield', 'Kadugodi', 'Hoodi', 'Mahadevapura', 'Varthur'],
    extraKeywords: ['RO service ITPL Road', 'RO service International Tech Park', 'RO repair ITPL Whitefield', 'RO service near ITPL Bangalore'],
  },
  {
    slug: 'ro-service-domlur',
    name: 'Domlur',
    pincode: '560071',
    region: 'Bengaluru',
    nearby: ['Indiranagar', 'Ulsoor', 'HAL', 'Old Airport Road', 'Koramangala', 'MG Road'],
    extraKeywords: ['RO service Domlur Bangalore', 'RO repair Domlur', 'RO service Old Airport Road Domlur', '560071 RO service'],
  },
  {
    slug: 'ro-service-banaswadi',
    name: 'Banaswadi',
    pincode: '560043',
    region: 'Bengaluru',
    nearby: ['Kalyan Nagar', 'Kammanahalli', 'Hennur', 'Ramamurthy Nagar', 'Thanisandra', 'HRBR Layout'],
    extraKeywords: ['RO service Banaswadi Bangalore', 'RO repair Banaswadi', 'RO service Horamavu Banaswadi'],
  },
  {
    slug: 'ro-service-ramamurthy-nagar',
    name: 'Ramamurthy Nagar',
    pincode: '560016',
    region: 'Bengaluru',
    nearby: ['Banaswadi', 'Kalyan Nagar', 'Hennur', 'KR Puram', 'Mahadevapura', 'Benson Town'],
    extraKeywords: ['RO service Ramamurthy Nagar Bangalore', 'RO repair Ramamurthy Nagar', '560016 RO service'],
  },
  {
    slug: 'ro-service-silk-board',
    name: 'Silk Board',
    pincode: '560068',
    region: 'Bengaluru',
    nearby: ['Bommanahalli', 'HSR Layout', 'BTM Layout', 'Madiwala', 'Koramangala', 'Electronic City', 'Singasandra'],
    extraKeywords: ['RO service Silk Board Junction', 'RO repair Silk Board Bangalore', 'RO service near Silk Board', 'RO service Hosur Road Silk Board'],
  },
  {
    slug: 'ro-service-rr-nagar',
    name: 'RR Nagar',
    pincode: '560098',
    region: 'Bengaluru',
    nearby: ['Kengeri', 'Nagarbhavi', 'Uttarahalli', 'Banashankari', 'Kumbalgodu', 'Mysore Road'],
    extraKeywords: ['RO service Rajarajeshwari Nagar', 'RO repair RR Nagar Bangalore', '560098 RO service', 'RO service Mysore Road RR Nagar'],
  },
  {
    slug: 'ro-service-arekere',
    name: 'Arekere',
    pincode: '560076',
    region: 'Bengaluru',
    nearby: ['Bannerghatta Road', 'JP Nagar', 'BTM Layout', 'Hulimavu', 'Bilekahalli', 'Gottigere'],
    extraKeywords: ['RO service Arekere Bannerghatta', 'RO repair Arekere Bangalore', 'RO service Arekere Mico Layout'],
  },
  {
    slug: 'ro-service-gottigere',
    name: 'Gottigere',
    pincode: '560083',
    region: 'Bengaluru',
    nearby: ['Bannerghatta Road', 'JP Nagar', 'Anjanapura', 'Arekere', 'Hulimavu', 'Konanakunte'],
    extraKeywords: ['RO service Gottigere Bangalore', 'RO repair Gottigere', 'RO service Bannerghatta Gottigere', '560083 RO service'],
  },

  // ---- Nearby cities & towns (Greater Bengaluru / Karnataka) ----
  { slug: 'ro-service-tumakuru', name: 'Tumakuru', region: 'Karnataka', nearby: ['Tumkur', 'Sira', 'Gubbi', 'Kunigal', 'Tiptur', 'Tumkur Road'] },
  { slug: 'ro-service-hosur', name: 'Hosur', region: 'Tamil Nadu (Bengaluru border)', nearby: ['Electronic City', 'Attibele', 'Anekal', 'Bommasandra', 'Chandapura', 'Bagalur'] },
  { slug: 'ro-service-kolar', name: 'Kolar', region: 'Karnataka', nearby: ['Kolar Gold Fields (KGF)', 'Bangarapet', 'Mulbagal', 'Malur', 'Srinivaspur', 'Budikote'] },
  { slug: 'ro-service-ramanagara', name: 'Ramanagara', region: 'Karnataka', nearby: ['Channapatna', 'Bidadi', 'Kanakapura', 'Magadi', 'Harohalli', 'Mysore Road'] },
  { slug: 'ro-service-nelamangala', name: 'Nelamangala', region: 'Karnataka', nearby: ['Dabaspete', 'Tumkur Road', 'Doddaballapur', 'Sompura', 'Bashettihalli', 'Solur'] },
  { slug: 'ro-service-doddaballapur', name: 'Doddaballapur', region: 'Karnataka', nearby: ['Yelahanka', 'Devanahalli', 'Nelamangala', 'Bashettihalli', 'Rajanukunte', 'Chikkaballapur'] },
  { slug: 'ro-service-devanahalli', name: 'Devanahalli', region: 'Karnataka', nearby: ['Kempegowda Airport', 'Yelahanka', 'Doddaballapur', 'Vijayapura', 'Bagalur', 'Budigere Cross', 'Budigere'], extraKeywords: ['RO service Kempegowda International Airport', 'RO service near Airport Devanahalli', 'RO repair Devanahalli Bangalore', 'RO service Budigere Cross Devanahalli', 'RO service Vijayapura Devanahalli'] },
  {
    slug: 'ro-service-anekal',
    name: 'Anekal',
    region: 'Karnataka',
    nearby: ['Attibele', 'Chandapura', 'Bommasandra', 'Jigani', 'Hosur Road', 'Sarjapur', 'Electronic City'],
    extraKeywords: ['RO service Anekal Bangalore', 'RO repair Anekal', 'RO service near Attibele Anekal', 'RO service Hosur Road Anekal'],
  },
];

export const locationSeoList: LocationSEO[] = (() => {
  const seen = new Set<string>();
  const merged: LocationSEO[] = [];
  const add = (loc: LocationSEO) => {
    if (seen.has(loc.slug)) return;
    seen.add(loc.slug);
    merged.push(loc);
  };
  BENGALURU_LOCATION_PAGES.forEach(add);
  karnatakaSeedsToLocationSeo(KARNATAKA_LOCATION_SEEDS).forEach(add);
  karnatakaSeedsToLocationSeo(ALL_MICRO_AREA_SEEDS).forEach(add);
  karnatakaSeedsToLocationSeo(KARNATAKA_DISTRICT_EXPANSION_SEEDS).forEach(add);
  BENGALURU_ZONE_EXPANSION.forEach(add);
  return merged;
})();

/** Bengaluru locality slugs for crawler bootstrap (non-Bengaluru defaults to Karnataka). */
export const BENGALURU_LOCALITY_SLUGS: string[] = locationSeoList
  .filter((loc) => loc.region === 'Bengaluru')
  .map((loc) => loc.slug.replace(/^ro-service-/, ''));

const SERVICES_LABEL = 'RO installation, repair, filter replacement & water softener';

/** Maps nearby-area labels to a location page when names differ slightly */
const NEARBY_ALIASES: Record<string, string> = {
  'sarjapur road': 'Sarjapur',
  sarjapura: 'Sarjapur',
  budigere: 'Budigere Cross',
  'kempegowda airport': 'Devanahalli',
  'kempegowda international airport': 'Devanahalli',
  bannerghatta: 'Bannerghatta Road',
  'itpl road': 'ITPL',
  'international tech park': 'ITPL',
  'rajarajeshwari nagar': 'RR Nagar',
  'silk board junction': 'Silk Board',
  'manyata embassy business park': 'Manyata Tech Park',
  tumkur: 'Tumakuru',
  'sanjay nagar': 'Sanjaynagar',
  'bannerghatta road': 'Bannerghatta Road',
  'k r puram': 'KR Puram',
  krishnarajapuram: 'KR Puram',
  'hennur main road': 'Hennur Road',
};

function normalizeLocationKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function resolveLocationForNearby(nearby: string): LocationSEO | null {
  const aliasTarget = NEARBY_ALIASES[nearby.toLowerCase()] ?? nearby;
  const key = normalizeLocationKey(aliasTarget);
  return (
    locationSeoList.find((l) => normalizeLocationKey(l.name) === key) ??
    locationSeoList.find((l) => l.slug === `ro-service-${aliasTarget.toLowerCase().replace(/\s+/g, '-')}`) ??
    null
  );
}

export interface LocationFaqItem {
  question: string;
  answer: string;
}

export function buildLocationFaqItems(
  loc: LocationSEO,
  brandName: string,
  phone: string
): LocationFaqItem[] {
  const place =
    loc.region === 'Bengaluru'
      ? `${loc.name}, Bengaluru`
      : loc.region === 'Karnataka'
        ? `${loc.name}, Karnataka`
        : loc.name;
  const pincodeText = loc.pincode ? ` (pincode ${loc.pincode})` : '';
  const nearbyText = loc.nearby.slice(0, 5).join(', ');
  return [
    {
      question: `How do I book RO service in ${loc.name}?`,
      answer: `Book online on our website or call ${phone}. ${brandName} offers same-day RO installation, repair, filter replacement and AMC in ${place}${pincodeText}.`,
    },
    {
      question: `Which RO brands do you service in ${loc.name}?`,
      answer: `${brandName} services Kent, Aquaguard, Pureit, Livpure, Blue Star, Eureka Forbes, Havells, AO Smith, LG, Samsung and all major RO brands in ${place}.`,
    },
    {
      question: `What is the RO repair cost in ${loc.name}?`,
      answer: `RO repair in ${place} typically starts from ₹300. RO installation costs ₹1500–3000, filter replacement ₹500–2000, and AMC plans are available. Transparent pricing with no hidden charges.`,
    },
    {
      question: `Is same-day RO service available in ${loc.name}?`,
      answer: `Yes. ${brandName} provides same-day RO installation and emergency repair in ${place}${pincodeText}. We also cover nearby areas including ${nearbyText}.`,
    },
    {
      question: `Do you provide RO AMC in ${loc.name}?`,
      answer: `Yes. Annual Maintenance Contract (AMC) plans are available in ${place} with scheduled filter replacement, sanitization and priority support from ${brandName}.`,
    },
  ];
}

export function buildLocationFaqJsonLd(
  loc: LocationSEO,
  brandName: string,
  phone: string
): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: buildLocationFaqItems(loc, brandName, phone).map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

/** Grouped links for /service-areas hub — auto-built by district for internal linking. */
export const LOCATION_HUB_GROUPS: { title: string; slugs: string[] }[] = (() => {
  const byDistrict = new Map<string, string[]>();
  for (const loc of locationSeoList) {
    const key =
      loc.district ??
      (loc.region === 'Bengaluru' ? 'Bengaluru Urban' : loc.region === 'Karnataka' ? 'Karnataka' : loc.region);
    const list = byDistrict.get(key) ?? [];
    list.push(loc.slug);
    byDistrict.set(key, list);
  }
  const order = [
    'Bengaluru Urban', 'Bengaluru Rural', 'Ramanagara', 'Chikkaballapura', 'Tumakuru', 'Kolar',
    'Mysuru', 'Mandya', 'Hassan', 'Chamarajanagar', 'Chikkamagaluru', 'Kodagu',
    'Dakshina Kannada', 'Udupi', 'Uttara Kannada',
    'Belagavi', 'Dharwad', 'Gadag', 'Haveri', 'Shivamogga', 'Davanagere', 'Chitradurga',
    'Ballari', 'Vijayanagara', 'Raichur', 'Koppal', 'Kalaburagi', 'Bidar', 'Yadgir', 'Vijayapura', 'Bagalkote',
    'Karnataka', 'Tamil Nadu (Bengaluru border)',
  ];
  const groups: { title: string; slugs: string[] }[] = [];
  for (const district of order) {
    const slugs = byDistrict.get(district);
    if (slugs?.length) groups.push({ title: `RO Service — ${district}`, slugs });
    byDistrict.delete(district);
  }
  for (const [district, slugs] of byDistrict.entries()) {
    groups.push({ title: `RO Service — ${district}`, slugs });
  }
  return groups;
})();

export function getLocationBySlug(slug: string): LocationSEO | undefined {
  return locationSeoList.find((l) => l.slug === slug);
}

export function getLocationSeo(pathname: string): LocationSEO | null {
  const slug = pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  return locationSeoList.find((l) => l.slug === slug) ?? null;
}

export function buildLocationKeywords(loc: LocationSEO, brandName: string): string {
  const parts = [
    `RO service ${loc.name}`,
    `RO repair ${loc.name}`,
    `RO installation ${loc.name}`,
    ...(loc.region === 'Bengaluru'
      ? [`RO service ${loc.name} Bangalore`, `RO service ${loc.name} Bengaluru`]
      : [`RO service ${loc.name} Karnataka`, `water purifier service ${loc.name}`]),
    `${brandName} ${loc.name}`,
    ...loc.nearby.flatMap((n) => [`RO service ${n}`, `RO repair ${n}`]),
    ...(loc.extraKeywords ?? []),
  ];
  if (loc.pincode) parts.push(`RO service ${loc.pincode}`, `${loc.pincode} RO repair`);
  if (loc.district) parts.push(`RO service ${loc.district}`, `RO repair ${loc.district} Karnataka`);
  return [...new Set(parts)].join(', ');
}

export function buildLocationTitle(loc: LocationSEO, brandName = 'Hydrogen RO'): string {
  const suffix = loc.region === 'Bengaluru' ? 'Bengaluru' : 'Karnataka';
  return `RO Service in ${loc.name} ${suffix} | Installation, Repair & AMC - ${brandName}`;
}

export function buildLocationDescription(loc: LocationSEO, brandName = 'Hydrogen RO', phone = '+91-8884944288'): string {
  const place =
    loc.region === 'Bengaluru'
      ? `${loc.name}, Bengaluru`
      : loc.region === 'Karnataka'
        ? `${loc.name}, Karnataka`
        : loc.name;
  const nearbyText = loc.nearby.length ? ` Also serving ${loc.nearby.slice(0, 5).join(', ')}.` : '';
  return `Looking for RO service in ${place}? ${brandName} offers same-day ${SERVICES_LABEL} by certified technicians${loc.pincode ? ` (pincode ${loc.pincode})` : ''}.${nearbyText} Genuine spare parts, transparent pricing, 24/7 support. Call ${phone}.`;
}

export function buildLocationIntro(loc: LocationSEO, brandName = 'Hydrogen RO'): string {
  const place = loc.region === 'Bengaluru' ? `${loc.name}, Bengaluru` : `${loc.name}, ${loc.region}`;
  return `${brandName} is the trusted choice for RO water purifier service in ${place}. Our certified technicians provide same-day RO installation, repair, filter & membrane replacement, water softener service and annual maintenance (AMC) for all major brands${loc.pincode ? ` across pincode ${loc.pincode}` : ''}. We also cover nearby areas including ${loc.nearby.join(', ')}. Book online or call us for fast, doorstep service.`;
}
