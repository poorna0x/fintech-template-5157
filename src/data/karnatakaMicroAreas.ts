import type { KarnatakaLocationSeed } from '@/data/karnatakaLocationSeeds';

/** Batch helper: small towns around a district hub for unique nearby content. */
function districtBatch(
  district: string,
  hub: string,
  areas: string[],
  extra?: Partial<KarnatakaLocationSeed>
): KarnatakaLocationSeed[] {
  return areas.map((name) => ({
    name,
    district,
    nearby: [hub, ...areas.filter((a) => a !== name).slice(0, 5)],
    ...extra,
  }));
}

/** Small Bengaluru localities & corridors (region stays Bengaluru). */
export const BENGALURU_MICRO_AREA_SEEDS: KarnatakaLocationSeed[] = [
  ...districtBatch('Bengaluru Urban', 'HSR Layout', [
    'Agara', 'Begur', 'Hongasandra', 'Madiwala', 'Ejipura', 'Bilekahalli', 'Hulimavu', 'Konanakunte',
    'Sarakki', 'Uttarahalli', 'Kumaraswamy Layout', 'Kathriguppe', 'Padmanabhanagar',
  ]).map((s) => ({ ...s, region: 'Bengaluru' as const })),
  ...districtBatch('Bengaluru Urban', 'Indiranagar', [
    'Wilson Garden', 'Richmond Town', 'Cox Town', 'Benson Town', 'HAL', 'CV Raman Nagar', 'Murugeshpalya',
    'Old Airport Road', 'Jeevan Bima Nagar', 'Halasuru',
  ]).map((s) => ({ ...s, region: 'Bengaluru' as const })),
  ...districtBatch('Bengaluru Urban', 'Whitefield', [
    'Kundalahalli', 'Kadugodi', 'Munnekollal', 'AECS Layout', 'Seegehalli', 'Kannamangala',
    'Nallurahalli', 'Hope Farm', 'Graphite India Road',
  ]).map((s) => ({ ...s, region: 'Bengaluru' as const })),
  ...districtBatch('Bengaluru Urban', 'Yelahanka', [
    'Sahakar Nagar', 'Kogilu', 'Sanjaynagar', 'Sadashivanagar', 'Rajanukunte', 'Doddaballapur Road',
    'Allalasandra', 'Attur Layout', 'Yelahanka New Town',
  ]).map((s) => ({ ...s, region: 'Bengaluru' as const })),
  ...districtBatch('Bengaluru Urban', 'Rajajinagar', [
    'Basaveshwaranagar', 'Mahalakshmi Layout', 'Nagasandra', 'Dasarahalli', 'Sunkadakatte', 'Laggere',
    'Goraguntepalya', 'Vijayanagar', 'Magadi Road',
  ]).map((s) => ({ ...s, region: 'Bengaluru' as const })),
  ...districtBatch('Bengaluru Urban', 'Sarjapur', [
    'Kaikondrahalli', 'Doddakannelli', 'Carmelaram', 'Dommasandra', 'Kodathi', 'Wipro Gate',
    'Iblur', 'Outer Ring Road', 'Kasavanahalli', 'Ambalipura',
  ]).map((s) => ({ ...s, region: 'Bengaluru' as const })),
  ...districtBatch('Bengaluru Urban', 'Jayanagar', [
    'Tilak Nagar', 'Girinagar', 'Vidyapeeta', 'Nagarbhavi 2nd Stage', 'Mysore Road', 'Nayandahalli',
  ]).map((s) => ({ ...s, region: 'Bengaluru' as const })),
  ...districtBatch('Bengaluru Urban', 'Hebbal', [
    'Lingarajapuram', 'Pulakeshinagar', 'Kacharakanahalli', 'HBR Layout', 'HRBR Layout', 'Horamavu',
  ]).map((s) => ({ ...s, region: 'Bengaluru' as const })),
  ...districtBatch('Bengaluru Urban', 'Electronic City', [
    'Bommasandra Industrial Area', 'Hosur Road', 'Singasandra', 'Hosa Road', 'Kudlu Gate', 'Parappana Agrahara',
  ]).map((s) => ({ ...s, region: 'Bengaluru' as const })),
  ...districtBatch('Bengaluru Rural', 'Nelamangala', [
    'Dabaspete', 'Solur', 'Bashettihalli', 'Sompura', 'Tavarekere', 'Makali', 'Rajanukunte',
  ]),
  ...districtBatch('Bengaluru Rural', 'Devanahalli', [
    'Vijayapura Road', 'Kempegowda Airport Road', 'Nandi Hills', 'Chikkaballapur Road', 'Bagalur Cross',
  ]),
  ...districtBatch('Bengaluru Rural', 'Hoskote', [
    'Old Madras Road', 'K R Puram', 'Kadugodi', 'Budigere', 'Sorahunase', 'Anugondanahalli',
  ]),
  ...districtBatch('Ramanagara', 'Ramanagara', [
    'Channapatna', 'Bidadi', 'Harohalli', 'Magadi', 'Sathanur', 'Kudlu',
  ]),
  ...districtBatch('Chikkaballapura', 'Chikkaballapur', [
    'Bagepalli', 'Gauribidanur', 'Gudibanda', 'Sidlaghatta', 'Chelur', 'Bagepalli Road',
  ]),
];

/** Small towns & taluk headquarters across Karnataka districts. */
export const KARNATAKA_MICRO_AREA_SEEDS: KarnatakaLocationSeed[] = [
  // Bagalkote
  ...districtBatch('Bagalkote', 'Bagalkote', ['Badami', 'Hungund', 'Bilgi', 'Guledgudda', 'Mahalingpur', 'Rabkavi Banhatti']),
  // Ballari
  ...districtBatch('Ballari', 'Ballari', ['Siruguppa', 'Kudligi', 'Hagaribommanahalli', 'Kurugodu', 'Toranagallu', 'Kampli']),
  // Belagavi
  ...districtBatch('Belagavi', 'Belagavi', ['Nipani', 'Khanapur', 'Saundatti', 'Ramdurg', 'Raibag', 'Hukkeri', 'Kittur', 'Bailhongal', 'Gokak Falls']),
  // Bidar
  ...districtBatch('Bidar', 'Bidar', ['Basavakalyan', 'Bhalki', 'Humnabad', 'Aurad', 'Kamalnagar', 'Chitgoppa']),
  // Chamarajanagar
  ...districtBatch('Chamarajanagar', 'Chamarajanagar', ['Kollegal', 'Gundlupet', 'Yelandur', 'Hanur', 'Terakanambi']),
  // Chikkamagaluru
  ...districtBatch('Chikkamagaluru', 'Chikkamagaluru', ['Kadur', 'Mudigere', 'Koppa', 'Sringeri', 'Tarikere', 'Narasimharajapura', 'Ajjampura']),
  // Chitradurga
  ...districtBatch('Chitradurga', 'Chitradurga', ['Holalkere', 'Molakalmuru', 'Hosadurga', 'Hiriyur', 'Challakere', 'Jagalur']),
  // Dakshina Kannada
  ...districtBatch('Dakshina Kannada', 'Mangaluru', [
    'Surathkal', 'Mulki', 'Kateel', 'Vittal', 'Uppinangady', 'Venoor', 'Subramanya', 'Dharmasthala', 'Bajpe', 'Padil', 'Falnir',
  ]),
  // Davanagere
  ...districtBatch('Davanagere', 'Davanagere', ['Channagiri', 'Honnali', 'Jagalur', 'Harpanahalli', 'Nyamati']),
  // Dharwad
  ...districtBatch('Dharwad', 'Hubballi', ['Kalghatgi', 'Navalgund', 'Kundgol', 'Hubballi Dharwad', 'Amargol', 'Unkal']),
  // Gadag
  ...districtBatch('Gadag', 'Gadag', ['Ron', 'Mundargi', 'Shirhatti', 'Naregal', 'Laxmeshwar', 'Mulgund']),
  // Hassan
  ...districtBatch('Hassan', 'Hassan', ['Channarayapatna', 'Alur', 'Holenarasipura', 'Arkalgud', 'Arsikere Road']),
  // Haveri
  ...districtBatch('Haveri', 'Haveri', ['Byadgi', 'Hirekerur', 'Savanur', 'Shiggaon', 'Hangal', 'Ranebennur Road']),
  // Kalaburagi
  ...districtBatch('Kalaburagi', 'Kalaburagi', ['Sedam', 'Chitapur', 'Afzalpur', 'Aland', 'Chincholi', 'Jewargi', 'Wadi']),
  // Kodagu
  ...districtBatch('Kodagu', 'Madikeri', ['Kushalnagar', 'Somwarpet', 'Ponnampet', 'Gonikoppal', 'Virajpet Road', 'Suntikoppa']),
  // Kolar
  ...districtBatch('Kolar', 'Kolar', ['KGF', 'Bangarapet', 'Mulbagal', 'Malur', 'Srinivaspur', 'Budikote', 'Robertsonpet']),
  // Koppal
  ...districtBatch('Koppal', 'Koppal', ['Yelburga', 'Kushtagi', 'Karatagi', 'Kukanoor', 'Gangavathi Road']),
  // Mandya
  ...districtBatch('Mandya', 'Mandya', ['Srirangapatna', 'Pandavapura', 'Malavalli', 'Maddur', 'Nagamangala', 'KR Pet', 'Bannur']),
  // Mysuru
  ...districtBatch('Mysuru', 'Mysuru', [
    'Nanjangud', 'Hunsur', 'T Narsipur', 'Periyapatna', 'Heggadadevankote', 'Bannur', 'Krishnarajanagara', 'Hunsur Road',
  ]),
  // Raichur
  ...districtBatch('Raichur', 'Raichur', ['Lingsugur', 'Devadurga', 'Maski', 'Sindhanur Road', 'Manvi Road']),
  // Shivamogga
  ...districtBatch('Shivamogga', 'Shivamogga', ['Sagara', 'Thirthahalli', 'Shikaripura', 'Hosanagara', 'Sorab', 'Bhadravati Road']),
  // Tumakuru
  ...districtBatch('Tumakuru', 'Tumakuru', ['Gubbi', 'Kunigal', 'Turuvekere', 'Koratagere', 'Pavagada', 'Tiptur Road', 'Sira Road']),
  // Udupi
  ...districtBatch('Udupi', 'Udupi', ['Byndoor', 'Brahmavar', 'Kaup', 'Padubidri', 'Hebri', 'Saligrama', 'Kota']),
  // Uttara Kannada
  ...districtBatch('Uttara Kannada', 'Karwar', [
    'Yellapur', 'Siddapur', 'Dandeli', 'Joida', 'Mundgod', 'Haliyal', 'Castle Rock', 'Murudeshwar', 'Manki',
  ]),
  // Vijayapura
  ...districtBatch('Vijayapura', 'Vijayapura', ['Indi', 'Basavana Bagevadi', 'Talikoti', 'Almel', 'Devar Hippargi', 'Kolhar']),
  // Vijayanagara
  ...districtBatch('Vijayanagara', 'Hosapete', ['Hampi', 'Kamalapur', 'Hagaribommanahalli', 'Kudligi Road']),
  // Yadgir
  ...districtBatch('Yadgir', 'Yadgir', ['Shorapur', 'Gurmitkal', 'Wadagera', 'Shahapur Road', 'Saidapur']),
  // Ramanagara extras
  ...districtBatch('Ramanagara', 'Kanakapura', ['Sathanur', 'Harohalli', 'Uyyamballi', 'Maralawadi']),
];

export const ALL_MICRO_AREA_SEEDS: KarnatakaLocationSeed[] = [
  ...BENGALURU_MICRO_AREA_SEEDS,
  ...KARNATAKA_MICRO_AREA_SEEDS,
];
