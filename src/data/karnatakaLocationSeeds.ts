import type { LocationSEO } from '@/data/locationSeo';

export interface KarnatakaLocationSeed {
  name: string;
  district: string;
  region?: 'Karnataka' | 'Bengaluru';
  nearby: string[];
  extraKeywords?: string[];
}

function slugify(name: string): string {
  return `ro-service-${name
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;
}

/** Karnataka districts & cities not already in locationSeoList (Bengaluru neighborhoods + nearby towns). */
export const KARNATAKA_LOCATION_SEEDS: KarnatakaLocationSeed[] = [
  // Hub
  {
    name: 'Bengaluru',
    district: 'Bengaluru Urban',
    nearby: ['Whitefield', 'Electronic City', 'Koramangala', 'Hebbal', 'Jayanagar', 'Yelahanka', 'Marathahalli'],
    extraKeywords: ['RO service Bangalore', 'RO service Bengaluru Karnataka', 'best RO service near me Bangalore'],
  },
  // Bengaluru Rural district
  {
    name: 'Bengaluru Rural',
    district: 'Bengaluru Rural',
    nearby: ['Nelamangala', 'Devanahalli', 'Doddaballapur', 'Hoskote', 'Anekal', 'Kanakapura'],
    extraKeywords: ['RO service Bengaluru Rural district', 'RO repair Bengaluru Rural Karnataka'],
  },
  { name: 'Kanakapura', district: 'Ramanagara', nearby: ['Ramanagara', 'Harohalli', 'Sathanur', 'Bidadi', 'Channapatna'] },
  { name: 'Chikkaballapur', district: 'Chikkaballapura', nearby: ['Bagepalli', 'Gauribidanur', 'Gudibanda', 'Sidlaghatta', 'Devanahalli'] },
  { name: 'Madhugiri', district: 'Tumakuru', nearby: ['Tumakuru', 'Koratagere', 'Pavagada', 'Sira'] },

  // Mysuru region
  { name: 'Mysuru', district: 'Mysuru', nearby: ['Srirangapatna', 'Nanjangud', 'Hunsur', 'Mandya', 'Chamundi Hills', 'Bannur'], extraKeywords: ['RO service Mysore', 'Kent RO service Mysuru', 'Aquaguard service Mysuru'] },
  { name: 'Chamarajanagar', district: 'Chamarajanagar', nearby: ['Kollegal', 'Gundlupet', 'Yelandur', 'Mysuru', 'Bandipur'] },

  // Coastal Karnataka
  { name: 'Mangaluru', district: 'Dakshina Kannada', nearby: ['Ullal', 'Surathkal', 'Bantwal', 'Puttur', 'Moodbidri', 'Udupi'], extraKeywords: ['RO service Mangalore', 'water purifier service Mangaluru Karnataka'] },
  { name: 'Udupi', district: 'Udupi', nearby: ['Manipal', 'Kundapura', 'Karkala', 'Mangaluru', 'Byndoor', 'Brahmavar'] },
  { name: 'Manipal', district: 'Udupi', nearby: ['Udupi', 'Kundapura', 'Karkala', 'Mangaluru', 'Parkala'] },
  { name: 'Kundapura', district: 'Udupi', nearby: ['Udupi', 'Karkala', 'Byndoor', 'Manipal', 'Senapura'] },
  { name: 'Karkala', district: 'Udupi', nearby: ['Udupi', 'Kundapura', 'Moodbidri', 'Belthangady'] },
  { name: 'Puttur', district: 'Dakshina Kannada', nearby: ['Mangaluru', 'Sullia', 'Belthangady', 'Vittal', 'Uppinangady'] },
  { name: 'Bantwal', district: 'Dakshina Kannada', nearby: ['Mangaluru', 'Puttur', 'Moodbidri', 'Venoor'] },
  { name: 'Moodbidri', district: 'Dakshina Kannada', nearby: ['Mangaluru', 'Karkala', 'Bantwal', 'Belthangady'] },
  { name: 'Ullal', district: 'Dakshina Kannada', nearby: ['Mangaluru', 'Surathkal', 'Talapady', 'Bengre'] },
  { name: 'Belthangady', district: 'Dakshina Kannada', nearby: ['Puttur', 'Moodbidri', 'Sullia', 'Mangaluru'] },
  { name: 'Sullia', district: 'Dakshina Kannada', nearby: ['Puttur', 'Belthangady', 'Madikeri', 'Subramanya'] },
  {
    name: 'Dakshina Kannada',
    district: 'Dakshina Kannada',
    nearby: ['Mangaluru', 'Puttur', 'Bantwal', 'Moodbidri', 'Belthangady', 'Sullia'],
    extraKeywords: ['RO service Dakshina Kannada district', 'water purifier service coastal Karnataka'],
  },

  // Uttara Kannada
  { name: 'Karwar', district: 'Uttara Kannada', nearby: ['Ankola', 'Kumta', 'Honnavar', 'Sirsi', 'Gokarna'] },
  { name: 'Sirsi', district: 'Uttara Kannada', nearby: ['Karwar', 'Yellapur', 'Siddapur', 'Kumta'] },
  { name: 'Bhatkal', district: 'Uttara Kannada', nearby: ['Honnavar', 'Kumta', 'Murudeshwar', 'Byndoor'] },
  { name: 'Honnavar', district: 'Uttara Kannada', nearby: ['Kumta', 'Bhatkal', 'Sirsi', 'Gokarna'] },
  { name: 'Kumta', district: 'Uttara Kannada', nearby: ['Honnavar', 'Gokarna', 'Ankola', 'Karwar'] },
  { name: 'Ankola', district: 'Uttara Kannada', nearby: ['Karwar', 'Kumta', 'Gokarna', 'Kadra'] },
  { name: 'Gokarna', district: 'Uttara Kannada', nearby: ['Kumta', 'Ankola', 'Honnavar', 'Murudeshwar'] },
  {
    name: 'Uttara Kannada',
    district: 'Uttara Kannada',
    nearby: ['Karwar', 'Sirsi', 'Bhatkal', 'Honnavar', 'Kumta', 'Gokarna'],
    extraKeywords: ['RO service North Karnataka coast', 'water purifier service Uttara Kannada'],
  },

  // North Karnataka
  { name: 'Belagavi', district: 'Belagavi', nearby: ['Athani', 'Gokak', 'Chikkodi', 'Nipani', 'Khanapur', 'Saundatti'], extraKeywords: ['RO service Belgaum', 'RO repair Belagavi Karnataka'] },
  { name: 'Athani', district: 'Belagavi', nearby: ['Belagavi', 'Gokak', 'Jamkhandi', 'Raibag'] },
  { name: 'Gokak', district: 'Belagavi', nearby: ['Belagavi', 'Athani', 'Chikkodi', 'Hukkeri'] },
  { name: 'Chikkodi', district: 'Belagavi', nearby: ['Belagavi', 'Gokak', 'Athani', 'Nipani'] },
  { name: 'Hubballi', district: 'Dharwad', nearby: ['Dharwad', 'Gadag', 'Haveri', 'Navanagar', 'Kundgol'], extraKeywords: ['RO service Hubli', 'RO repair Hubballi Karnataka'] },
  { name: 'Dharwad', district: 'Dharwad', nearby: ['Hubballi', 'Gadag', 'Kalghatgi', 'Navalgund'] },
  { name: 'Gadag', district: 'Gadag', nearby: ['Hubballi', 'Haveri', 'Koppal', 'Ron', 'Mundargi'] },
  { name: 'Haveri', district: 'Haveri', nearby: ['Ranebennur', 'Hubballi', 'Byadgi', 'Hirekerur'] },
  { name: 'Ranebennur', district: 'Haveri', nearby: ['Haveri', 'Harihar', 'Byadgi', 'Shiggaon'] },

  // Central Karnataka
  { name: 'Shivamogga', district: 'Shivamogga', nearby: ['Bhadravati', 'Sagara', 'Thirthahalli', 'Shikaripura', 'Hosanagara'], extraKeywords: ['RO service Shimoga', 'water purifier service Shivamogga'] },
  { name: 'Bhadravati', district: 'Shivamogga', nearby: ['Shivamogga', 'Tarikere', 'Holehonnur'] },
  { name: 'Davanagere', district: 'Davanagere', nearby: ['Harihar', 'Channagiri', 'Honnali', 'Jagalur'] },
  { name: 'Harihar', district: 'Davanagere', nearby: ['Davanagere', 'Ranebennur', 'Harpanahalli'] },
  { name: 'Chitradurga', district: 'Chitradurga', nearby: ['Hiriyur', 'Challakere', 'Holalkere', 'Molakalmuru'] },
  { name: 'Hiriyur', district: 'Chitradurga', nearby: ['Chitradurga', 'Challakere', 'Hosadurga'] },
  { name: 'Challakere', district: 'Chitradurga', nearby: ['Chitradurga', 'Hiriyur', 'Molakalmuru'] },
  { name: 'Tiptur', district: 'Tumakuru', nearby: ['Tumakuru', 'Arsikere', 'Kunigal', 'Turuvekere'] },
  { name: 'Sira', district: 'Tumakuru', nearby: ['Tumakuru', 'Madhugiri', 'Pavagada', 'Koratagere'] },

  // Hassan & Mandya
  { name: 'Hassan', district: 'Hassan', nearby: ['Arsikere', 'Belur', 'Sakleshpur', 'Channarayapatna', 'Alur'] },
  { name: 'Sakleshpur', district: 'Hassan', nearby: ['Hassan', 'Belur', 'Subramanya', 'Mudigere'] },
  { name: 'Arsikere', district: 'Hassan', nearby: ['Hassan', 'Tiptur', 'Belur', 'Javagal'] },
  { name: 'Belur', district: 'Hassan', nearby: ['Hassan', 'Arsikere', 'Chikkamagaluru', 'Sakleshpur'] },
  { name: 'Mandya', district: 'Mandya', nearby: ['Mysuru', 'Srirangapatna', 'Pandavapura', 'Malavalli', 'Maddur'] },

  // Malnad
  { name: 'Chikkamagaluru', district: 'Chikkamagaluru', nearby: ['Kadur', 'Mudigere', 'Koppa', 'Sringeri', 'Belur'], extraKeywords: ['RO service Chikmagalur'] },
  { name: 'Madikeri', district: 'Kodagu', nearby: ['Virajpet', 'Kushalnagar', 'Somwarpet', 'Ponnampet'] },
  { name: 'Virajpet', district: 'Kodagu', nearby: ['Madikeri', 'Kushalnagar', 'Ponnampet', 'Gonikoppal'] },

  // Kalyana Karnataka (formerly Hyderabad-Karnataka)
  { name: 'Kalaburagi', district: 'Kalaburagi', nearby: ['Sedam', 'Chitapur', 'Afzalpur', 'Aland', 'Gulbarga'], extraKeywords: ['RO service Gulbarga Karnataka'] },
  { name: 'Bidar', district: 'Bidar', nearby: ['Basavakalyan', 'Bhalki', 'Humnabad', 'Aurad'] },
  { name: 'Yadgir', district: 'Yadgir', nearby: ['Shahapur', 'Sindagi', 'Gurmitkal', 'Shorapur'] },
  { name: 'Shahapur', district: 'Yadgir', nearby: ['Yadgir', 'Shorapur', 'Gurmitkal'] },
  { name: 'Vijayapura', district: 'Vijayapura', nearby: ['Sindagi', 'Mudhol', 'Indi', 'Basavana Bagevadi'], extraKeywords: ['RO service Bijapur Karnataka'] },
  { name: 'Sindagi', district: 'Vijayapura', nearby: ['Vijayapura', 'Mudhol', 'Talikoti', 'Almel'] },
  { name: 'Mudhol', district: 'Bagalkote', nearby: ['Bagalkote', 'Jamkhandi', 'Bilgi', 'Badami'] },
  { name: 'Bagalkote', district: 'Bagalkote', nearby: ['Jamkhandi', 'Mudhol', 'Badami', 'Hungund'], extraKeywords: ['RO service Bagalkot Karnataka'] },
  { name: 'Jamkhandi', district: 'Bagalkote', nearby: ['Bagalkote', 'Mudhol', 'Athani', 'Bilgi'] },
  { name: 'Raichur', district: 'Raichur', nearby: ['Sindhanur', 'Manvi', 'Lingsugur', 'Devadurga'] },
  { name: 'Sindhanur', district: 'Raichur', nearby: ['Raichur', 'Manvi', 'Lingsugur'] },
  { name: 'Manvi', district: 'Raichur', nearby: ['Raichur', 'Sindhanur', 'Devadurga'] },
  { name: 'Koppal', district: 'Koppal', nearby: ['Gangavati', 'Yelburga', 'Kushtagi', 'Karatagi'] },
  { name: 'Gangavati', district: 'Koppal', nearby: ['Koppal', 'Karatagi', 'Hospet', 'Raichur'] },

  // Ballari & Vijayanagara
  { name: 'Ballari', district: 'Ballari', nearby: ['Sandur', 'Hospet', 'Siruguppa', 'Kudligi'], extraKeywords: ['RO service Bellary Karnataka'] },
  { name: 'Hosapete', district: 'Vijayanagara', nearby: ['Hampi', 'Kamalapur', 'Gangavati', 'Ballari'], extraKeywords: ['RO service Hospet Karnataka'] },
  { name: 'Sandur', district: 'Ballari', nearby: ['Ballari', 'Hospet', 'Kudligi', 'Toranagallu'] },
  {
    name: 'Vijayanagara',
    district: 'Vijayanagara',
    nearby: ['Hosapete', 'Hampi', 'Kamalapur', 'Ballari', 'Gangavati'],
    extraKeywords: ['RO service Vijayanagara district Karnataka'],
  },
];

export function karnatakaSeedsToLocationSeo(seeds: KarnatakaLocationSeed[]): LocationSEO[] {
  return seeds.map((seed) => ({
    slug: slugify(seed.name),
    name: seed.name,
    region: seed.region ?? 'Karnataka',
    district: seed.district,
    nearby: seed.nearby,
    extraKeywords: [
      ...(seed.region === 'Bengaluru'
        ? [`RO service ${seed.name} Bangalore`, `RO service ${seed.name} Bengaluru`]
        : [`RO service ${seed.name} Karnataka`]),
      `RO repair ${seed.name}`,
      `RO installation ${seed.name}`,
      `Water purifier service ${seed.name}`,
      `RO AMC ${seed.name}`,
      `RO maintenance ${seed.name}`,
      `Kent RO service ${seed.name}`,
      `Aquaguard service ${seed.name}`,
      ...(seed.extraKeywords ?? []),
    ],
  }));
}

/** Slugs for Karnataka cities (non-Bengaluru locality) — used by head-seo-bootstrap.js sync script. */
export const KARNATAKA_CITY_SLUGS: string[] = KARNATAKA_LOCATION_SEEDS.map((s) =>
  slugify(s.name).replace('ro-service-', '')
);
