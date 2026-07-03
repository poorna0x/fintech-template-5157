import type { KarnatakaLocationSeed } from '@/data/karnatakaLocationSeeds';

function batch(district: string, hub: string, areas: string[], extra?: Partial<KarnatakaLocationSeed>): KarnatakaLocationSeed[] {
  return areas.map((name) => ({
    name,
    district,
    nearby: [hub, ...areas.filter((a) => a !== name).slice(0, 5)],
    extraKeywords: [`RO service ${name} ${district}`, `RO repair ${name} Karnataka`, `water purifier service ${name}`],
    ...extra,
  }));
}

/**
 * Second-wave Karnataka local SEO — taluk towns & small areas in districts with thin coverage.
 * URLs: /ro-service-{place} (e.g. /ro-service-badami, /ro-service-sedam)
 */
export const KARNATAKA_DISTRICT_EXPANSION_SEEDS: KarnatakaLocationSeed[] = [
  // Bagalkote — expand
  ...batch('Bagalkote', 'Bagalkote', ['Ilkal', 'Lokapur', 'Kerur', 'Badami Caves Road', 'Navanagar Bagalkote', 'Jamkhandi Road']),
  ...batch('Bagalkote', 'Badami', ['Pattadakal', 'Aihole', 'Mahakuta', 'Bagalkot Road Badami']),

  // Ballari — expand
  ...batch('Ballari', 'Ballari', ['Allipur', 'Kurugodu', 'Tekkalakote', 'Sandur Road', 'Toranagallu', 'Kudligi Road', 'Siruguppa Road']),
  ...batch('Ballari', 'Sandur', ['Swamimalai', 'Venkatapura', 'Kumaraswamy Layout Sandur']),

  // Belagavi — expand
  ...batch('Belagavi', 'Belagavi', ['Uchagaon', 'Kinaye', 'Shahapur Belagavi', 'Tilakwadi', 'Camp Belagavi', 'Angol', 'Hindalga', 'Auto Nagar Belagavi']),
  ...batch('Belagavi', 'Nipani', ['Sadalga', 'Kagwad', 'Chikodi Road Nipani', 'Jath Road']),
  ...batch('Belagavi', 'Bailhongal', ['Kittur Road', 'Saundatti Road', 'Murgod']),

  // Bengaluru Rural — expand
  ...batch('Bengaluru Rural', 'Nelamangala', ['Tippasandra', 'Jakkenahalli', 'Thammenahalli', 'Dobbaspet']),
  ...batch('Bengaluru Rural', 'Doddaballapur', ['Melekote', 'Gowribidanur Road', 'Nandi Hills Road', 'Alur Doddaballapur']),
  ...batch('Bengaluru Rural', 'Anekal', ['Marsur', 'Jigani Anekal Road', 'Chandapura Anekal', 'Sarjapur Anekal Road']),

  // Bidar — expand
  ...batch('Bidar', 'Bidar', ['Hallikhed', 'Changlerea', 'Homnabad Road', 'Naubad', 'Mailur', 'Janawad']),
  ...batch('Bidar', 'Basavakalyan', ['Humnabad Road', 'Aland Road', 'Omerga border']),

  // Chamarajanagar — expand
  ...batch('Chamarajanagar', 'Chamarajanagar', ['MM Hills', 'Ramapura', 'Santhemarahalli', 'Mamballi', 'Kellamballi']),
  ...batch('Chamarajanagar', 'Kollegal', ['Hanur Road', 'Mysuru Kollegal Road', 'Bannari']),

  // Chikkaballapura — expand
  ...batch('Chikkaballapura', 'Chikkaballapur', ['Nandi Hills', 'Peresandra', 'Shidlaghatta', 'Gauribidanur Road', 'Bagepalli Road', 'Doddaballapur Road']),
  ...batch('Chikkaballapura', 'Bagepalli', ['Gudibanda Bagepalli', 'Pavagada border', 'Chintamani Road']),

  // Chikkamagaluru — expand
  ...batch('Chikkamagaluru', 'Chikkamagaluru', ['Balehonnur', 'Horanadu', 'Kalasa', 'Kemmannugundi', 'Baba Budangiri', 'Mullayanagiri', 'Jayapura Chikkamagaluru']),
  ...batch('Chikkamagaluru', 'Kadur', ['Birur', 'Chikkamagaluru Road Kadur', 'Shimoga Road Kadur']),
  ...batch('Chikkamagaluru', 'Sringeri', ['Koppa Sringeri', 'Agumbe Road', 'Hornadu Road']),

  // Chitradurga — expand
  ...batch('Chitradurga', 'Chitradurga', ['Nayakanahatti', 'Rampura', 'Jogimatti', 'Challakere Road', 'Hiriyur Road', 'Davanagere Road']),
  ...batch('Chitradurga', 'Molakalmuru', ['Chitradurga border', 'Hiriyur Molakalmuru', 'Rayadurga border']),

  // Dakshina Kannada — expand
  ...batch('Dakshina Kannada', 'Mangaluru', ['Nellyadi', 'Panemangalore', 'Adyar', 'Gurupura', 'Thokkottu', 'Kulai', 'Surathkal Road', 'Pumpwell']),
  ...batch('Dakshina Kannada', 'Puttur', ['Vittal Puttur', 'Sullia Road Puttur', 'Darbe', 'Kabaka']),
  ...batch('Dakshina Kannada', 'Bantwal', ['Farla', 'Addoor', 'Nethravathi']),

  // Davanagere — expand
  ...batch('Davanagere', 'Davanagere', ['Mayakonda', 'Anaji', 'Bada', 'PDA Layout Davanagere', 'Shamanur', 'Azad Nagar Davanagere']),
  ...batch('Davanagere', 'Channagiri', ['Harihar Channagiri', 'Jagalur Road', 'Honnali Road']),

  // Dharwad — expand
  ...batch('Dharwad', 'Hubballi', ['Gopankoppa', 'Vidyagiri', 'Toll Naka Hubballi', 'Old Hubballi', 'Airport Road Hubballi', 'Gabbur Cross']),
  ...batch('Dharwad', 'Dharwad', ['Annigeri', 'Karnatak University Area', 'SDM Dharwad', 'Navalur Dharwad']),

  // Gadag — expand
  ...batch('Gadag', 'Gadag', ['Betageri', 'Gajendragad', 'Lakshmeshwar', 'Ron Road', 'Mundaragi Road', 'Naragund Road']),
  ...batch('Gadag', 'Gajendragad', ['Bagalkot border', 'Badami Road', 'Hungund Road']),

  // Hassan — expand
  ...batch('Hassan', 'Hassan', ['Doddamettikurike', 'Arsikere Hassan Road', 'Belur Road Hassan', 'Sakleshpur Road', 'Bengaluru Hassan Road']),
  ...batch('Hassan', 'Channarayapatna', ['Shravanabelagola', 'Arkalgud Road', 'Hassan Channarayapatna']),
  ...batch('Hassan', 'Sakleshpur', ['Hanbal', 'Alur Sakleshpur', 'Subramanya Road']),

  // Haveri — expand
  ...batch('Haveri', 'Haveri', ['Tadas', 'Akki Alur', 'Bankapura', 'Hangal Road', 'Ranebennur Road Haveri', 'Byadgi Road']),
  ...batch('Haveri', 'Ranebennur', ['Harihar Ranebennur', 'Shiggaon Road', 'Haveri Ranebennur']),

  // Kalaburagi — expand
  ...batch('Kalaburagi', 'Kalaburagi', ['Malkhed', 'Sedam Road', 'Afzalpur Road', 'Wadi Junction', 'Gulbarga University Area', 'Super Market Gulbarga']),
  ...batch('Kalaburagi', 'Sedam', ['Chincholi Road', 'Yadgir border Sedam', 'Kalaburagi Sedam']),
  ...batch('Kalaburagi', 'Chincholi', ['Sedam Chincholi', 'Bidar border', 'Afzalpur Chincholi']),

  // Kodagu — expand
  ...batch('Kodagu', 'Madikeri', ['Ammathi', 'Napoklu', 'Bhagamandala', 'Abbey Falls Road', 'Raja Seat Madikeri', 'Stuart Hill']),
  ...batch('Kodagu', 'Virajpet', ['Ammathi Virajpet', 'Ponnampet Road', 'Iritty border']),
  ...batch('Kodagu', 'Kushalnagar', ['Bettigeri', 'Suntikoppa', 'Polo Club Kushalnagar', 'Harangi Dam']),

  // Kolar — expand
  ...batch('Kolar', 'Kolar', ['Andersonpet', 'Champion Reefs', 'Bethamangala', 'Bangarapet Road', 'Mulbagal Road', 'Budikote Road']),
  ...batch('Kolar', 'KGF', ['Robertsonpet', 'Oorgaum', 'Champion Reef KGF', 'Coromandel KGF', 'Marikuppam']),
  ...batch('Kolar', 'Mulbagal', ['Srinivaspur Road', 'Budikote Mulbagal', 'Chintamani border']),

  // Koppal — expand
  ...batch('Koppal', 'Koppal', ['Kuknoor', 'Yelburga Road', 'Gangavati Road Koppal', 'Karatagi Road', 'Kushtagi Road']),
  ...batch('Koppal', 'Gangavati', ['Hospet Gangavati', 'Koppal Gangavati', 'Raichur Road Gangavati']),

  // Mandya — expand
  ...batch('Mandya', 'Mandya', ['Kirugavalu', 'Keragodu', 'Shivapura', 'Maddur Road', 'Mysuru Mandya Road', 'KR Pete Road']),
  ...batch('Mandya', 'Srirangapatna', ['Gumbaz', 'Balmuri Falls', 'Mandya Srirangapatna', 'Mysuru Srirangapatna']),
  ...batch('Mandya', 'Malavalli', ['Kollegal Malavalli', 'Maddur Malavalli', 'Bheemeshwari']),

  // Mysuru — expand
  ...batch('Mysuru', 'Mysuru', ['HD Kote', 'Varuna', 'Bogadi', 'Jayapura Mysuru', 'Koorgalli', 'Bannimantap', 'Vijayanagar Mysuru', 'Hebbal Mysuru']),
  ...batch('Mysuru', 'Nanjangud', ['Bannur Road', 'Chamarajanagar Road', 'Mysuru Nanjangud', 'Suttur']),
  ...batch('Mysuru', 'Hunsur', ['Periyapatna Hunsur', 'Piriyapatna', 'K R Nagar Road']),

  // Raichur — expand
  ...batch('Raichur', 'Raichur', ['Sirwar', 'Deodurga', 'Kowthal', 'Sindhanur Road Raichur', 'Manvi Road Raichur', 'Lingsugur Road']),
  ...batch('Raichur', 'Lingsugur', ['Devadurga Lingsugur', 'Raichur Lingsugur', 'Maski Road']),
  ...batch('Raichur', 'Sindhanur', ['Siruguppa Sindhanur', 'Manvi Sindhanur', 'Gangavati Road']),

  // Ramanagara — expand
  ...batch('Ramanagara', 'Ramanagara', ['Iggalur', 'Mugguru', 'Channapatna Ramanagara', 'Bidadi Ramanagara', 'Kanakapura Ramanagara']),
  ...batch('Ramanagara', 'Channapatna', ['Ramanagara Channapatna', 'Maddur Road Channapatna', 'Kanakapura Road']),

  // Shivamogga — expand
  ...batch('Shivamogga', 'Shivamogga', ['Kenchangudda', 'Anandapura', 'Gopala', 'Vinobanagar', 'Gandhinagar Shimoga', 'Bhadravati Road Shimoga']),
  ...batch('Shivamogga', 'Sagara', ['Ikkeri', 'Keladi', 'Honnali Sagara', 'Thirthahalli Road']),
  ...batch('Shivamogga', 'Thirthahalli', ['Agumbe Road', 'Kundapura Road Thirthahalli', 'Hosanagara Road']),

  // Tumakuru — expand
  ...batch('Tumakuru', 'Tumakuru', ['Handanakere', 'Nonavinakere', 'C N Halli', 'Kunigal Road Tumakuru', 'Tiptur Road Tumakuru', 'Sira Road Tumakuru']),
  ...batch('Tumakuru', 'Gubbi', ['Tumakuru Gubbi', 'Koratagere Gubbi', 'Pavagada Road']),
  ...batch('Tumakuru', 'Pavagada', ['Sira Pavagada', 'Madhugiri Pavagada', 'Andhra border Pavagada']),

  // Udupi — expand
  ...batch('Udupi', 'Udupi', ['Perdoor', 'Barkur', 'Shiroor', 'Pangala', 'Katapadi', 'Udyavara', 'Malpe', 'Kapu Beach Road']),
  ...batch('Udupi', 'Kundapura', ['Maravanthe', 'Kodi', 'Gangolli', 'Byndoor Road Kundapura']),
  ...batch('Udupi', 'Manipal', ['End Point Manipal', 'MIT Manipal', 'Tiger Circle Manipal', 'Udupi Manipal Road']),

  // Uttara Kannada — expand
  ...batch('Uttara Kannada', 'Karwar', ['Amadalli', 'Ulga', 'Majali', 'Belekeri', 'Sadashivgad', 'Kadra Karwar', 'Kodibag']),
  ...batch('Uttara Kannada', 'Sirsi', ['Banavasi', 'Siddapur Sirsi', 'Yellapur Sirsi', 'Kumta Sirsi']),
  ...batch('Uttara Kannada', 'Dandeli', ['Ambikanagar', 'Kulgi', 'Syntheri Rocks', 'Haliyal Dandeli']),

  // Vijayanagara — expand (thinnest district)
  ...batch('Vijayanagara', 'Hosapete', ['Hampi Bazaar', 'Kamalapura Hampi', 'Kaddirampur', 'Gangavati Road Hosapete', 'Ballari Road Hosapete']),
  ...batch('Vijayanagara', 'Hampi', ['Virupaksha Temple Area', 'Hosapete Hampi', 'Kamalapur Hampi']),
  ...batch('Vijayanagara', 'Harapanahalli', ['Kudligi Harapanahalli', 'Ballari border', 'Davanagere border']),

  // Vijayapura — expand
  ...batch('Vijayapura', 'Vijayapura', ['Tikota', 'Mangoli', 'Talikote', 'Indi Road', 'Sindagi Road', 'Muddebihal Road', 'Solapur Road Vijayapura']),
  ...batch('Vijayapura', 'Indi', ['Sindagi Indi', 'Vijayapura Indi', 'Athani border']),

  // Yadgir — expand
  ...batch('Yadgir', 'Yadgir', ['Hunasagi', 'Vadra', 'Gurmitkal Yadgir', 'Shahapur Yadgir', 'Shorapur Road', 'Raichur Road Yadgir']),
  ...batch('Yadgir', 'Shahapur', ['Wadagera Shahapur', 'Yadgir Shahapur', 'Gulbarga border']),

  // District hub pages (thin districts — extra district-level landing)
  { name: 'Gulbarga', district: 'Kalaburagi', nearby: ['Kalaburagi', 'Sedam', 'Afzalpur', 'Aland', 'Wadi'], extraKeywords: ['RO service Gulbarga', 'RO service Kalaburagi'] },
  { name: 'Shimoga', district: 'Shivamogga', nearby: ['Shivamogga', 'Bhadravati', 'Sagara', 'Thirthahalli'], extraKeywords: ['RO service Shimoga', 'RO service Shivamogga'] },
  { name: 'Belgaum', district: 'Belagavi', nearby: ['Belagavi', 'Nipani', 'Gokak', 'Chikkodi'], extraKeywords: ['RO service Belgaum', 'RO repair Belgaum Karnataka'] },
  { name: 'Hubli', district: 'Dharwad', nearby: ['Hubballi', 'Dharwad', 'Navanagar', 'Gopankoppa'], extraKeywords: ['RO service Hubli', 'RO repair Hubli Karnataka'] },
  { name: 'Mangalore', district: 'Dakshina Kannada', nearby: ['Mangaluru', 'Udupi', 'Puttur', 'Surathkal'], extraKeywords: ['RO service Mangalore', 'RO repair Mangalore Karnataka'] },
  { name: 'Mysore', district: 'Mysuru', nearby: ['Mysuru', 'Srirangapatna', 'Nanjangud', 'Hunsur'], extraKeywords: ['RO service Mysore', 'RO repair Mysore Karnataka'] },
  { name: 'Bellary', district: 'Ballari', nearby: ['Ballari', 'Hospet', 'Sandur', 'Siruguppa'], extraKeywords: ['RO service Bellary', 'RO repair Bellary Karnataka'] },
  { name: 'Bijapur', district: 'Vijayapura', nearby: ['Vijayapura', 'Sindagi', 'Indi', 'Muddebihal'], extraKeywords: ['RO service Bijapur', 'RO repair Bijapur Karnataka'] },
  { name: 'Hospet', district: 'Vijayanagara', nearby: ['Hosapete', 'Hampi', 'Ballari', 'Gangavati'], extraKeywords: ['RO service Hospet', 'RO repair Hospet Karnataka'] },
  { name: 'Tumkur', district: 'Tumakuru', nearby: ['Tumakuru', 'Tiptur', 'Sira', 'Gubbi'], extraKeywords: ['RO service Tumkur', 'RO repair Tumkur Karnataka'] },
];
