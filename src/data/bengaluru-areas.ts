// Comprehensive list of Bengaluru areas and pincodes for SEO optimization

export interface BengaluruArea {
  area: string;
  pincode: string;
  zone: string;
  popularName?: string;
}

export const bengaluruAreas: BengaluruArea[] = [
  // Central Bengaluru
  { area: "MG Road", pincode: "560001", zone: "Central" },
  { area: "Brigade Road", pincode: "560001", zone: "Central" },
  { area: "Commercial Street", pincode: "560008", zone: "Central" },
  { area: "Cubbon Park", pincode: "560001", zone: "Central" },
  { area: "Vidhana Soudha", pincode: "560001", zone: "Central" },
  { area: "Cantonment", pincode: "560001", zone: "Central" },
  { area: "Richmond Town", pincode: "560025", zone: "Central" },
  { area: "Shivajinagar", pincode: "560001", zone: "Central" },
  { area: "Ulsoor", pincode: "560008", zone: "Central" },
  { area: "Domlur", pincode: "560071", zone: "Central" },

  // East Bengaluru
  { area: "Whitefield", pincode: "560066", zone: "East", popularName: "IT Hub" },
  { area: "Marathahalli", pincode: "560037", zone: "East" },
  { area: "Kundalahalli", pincode: "560037", zone: "East" },
  { area: "Brookefield", pincode: "560037", zone: "East" },
  { area: "Kadugodi", pincode: "560067", zone: "East" },
  { area: "Hoodi", pincode: "560048", zone: "East" },
  { area: "KR Puram", pincode: "560036", zone: "East" },
  { area: "Banaswadi", pincode: "560043", zone: "East" },
  { area: "Ramamurthy Nagar", pincode: "560016", zone: "East" },
  { area: "Kasturi Nagar", pincode: "560043", zone: "East" },
  { area: "CV Raman Nagar", pincode: "560093", zone: "East" },
  { area: "Banaswadi", pincode: "560043", zone: "East" },
  { area: "Kaggadasapura", pincode: "560075", zone: "East" },
  { area: "Banaswadi", pincode: "560043", zone: "East" },
  { area: "Jeevan Bima Nagar", pincode: "560075", zone: "East" },

  // South Bengaluru
  { area: "Koramangala", pincode: "560034", zone: "South" },
  { area: "HSR Layout", pincode: "560102", zone: "South" },
  { area: "Electronic City", pincode: "560100", zone: "South", popularName: "IT Hub" },
  { area: "Indiranagar", pincode: "560038", zone: "South" },
  { area: "Jayanagar", pincode: "560011", zone: "South" },
  { area: "JP Nagar", pincode: "560078", zone: "South" },
  { area: "Banashankari", pincode: "560070", zone: "South" },
  { area: "Basavanagudi", pincode: "560004", zone: "South" },
  { area: "BTM Layout", pincode: "560076", zone: "South" },
  { area: "Bommanahalli", pincode: "560068", zone: "South" },
  { area: "Hosur Road", pincode: "560100", zone: "South" },
  { area: "Bannerghatta Road", pincode: "560076", zone: "South" },
  { area: "Silk Board", pincode: "560068", zone: "South" },
  { area: "Madiwala", pincode: "560068", zone: "South" },
  { area: "Adugodi", pincode: "560030", zone: "South" },
  { area: "Wilson Garden", pincode: "560030", zone: "South" },
  { area: "Richards Town", pincode: "560005", zone: "South" },
  { area: "Frazer Town", pincode: "560005", zone: "South" },
  { area: "Cox Town", pincode: "560005", zone: "South" },
  { area: "Cooke Town", pincode: "560005", zone: "South" },

  // West Bengaluru
  { area: "Malleshwaram", pincode: "560003", zone: "West" },
  { area: "Rajajinagar", pincode: "560010", zone: "West" },
  { area: "Vijayanagar", pincode: "560040", zone: "West" },
  { area: "Basaveshwaranagar", pincode: "560079", zone: "West" },
  { area: "Nagarbhavi", pincode: "560072", zone: "West" },
  { area: "Kengeri", pincode: "560060", zone: "West" },
  { area: "RR Nagar", pincode: "560098", zone: "West" },
  { area: "Uttarahalli", pincode: "560061", zone: "West" },
  { area: "Chamrajpet", pincode: "560018", zone: "West" },
  { area: "Chickpet", pincode: "560053", zone: "West" },
  { area: "Majestic", pincode: "560023", zone: "West" },
  { area: "City Railway Station", pincode: "560023", zone: "West" },
  { area: "Gandhi Nagar", pincode: "560009", zone: "West" },
  { area: "Seshadripuram", pincode: "560020", zone: "West" },
  { area: "Sampangiram Nagar", pincode: "560027", zone: "West" },

  // North Bengaluru
  { area: "Hebbal", pincode: "560024", zone: "North" },
  { area: "Yelahanka", pincode: "560064", zone: "North" },
  { area: "Sahakar Nagar", pincode: "560092", zone: "North" },
  { area: "RT Nagar", pincode: "560032", zone: "North" },
  { area: "Sanjay Nagar", pincode: "560094", zone: "North" },
  { area: "Ganganagar", pincode: "560032", zone: "North" },
  { area: "Nagawara", pincode: "560045", zone: "North" },
  { area: "Hennur", pincode: "560043", zone: "North" },
  { area: "Kodigehalli", pincode: "560092", zone: "North" },
  { area: "Thanisandra", pincode: "560077", zone: "North" },
  { area: "Kogilu", pincode: "560064", zone: "North" },
  { area: "Chikkaballapur Road", pincode: "560064", zone: "North" },
  { area: "Doddaballapur Road", pincode: "560064", zone: "North" },
  { area: "Bagalur", pincode: "560064", zone: "North" },
  { area: "Kempapura", pincode: "560024", zone: "North" },

  // Southeast Bengaluru
  { area: "Sarjapur", pincode: "562125", zone: "Southeast" },
  { area: "Bellandur", pincode: "560103", zone: "Southeast" },
  { area: "Varthur", pincode: "560087", zone: "Southeast" },
  { area: "Kadubeesanahalli", pincode: "560103", zone: "Southeast" },
  { area: "Panathur", pincode: "560103", zone: "Southeast" },
  { area: "Kadabagere", pincode: "560103", zone: "Southeast" },
  { area: "Devarabeesanahalli", pincode: "560103", zone: "Southeast" },
  { area: "Avalahalli", pincode: "560103", zone: "Southeast" },
  { area: "Kodathi", pincode: "560103", zone: "Southeast" },
  { area: "Chandapura", pincode: "560081", zone: "Southeast" },
  { area: "Anekal", pincode: "562106", zone: "Southeast" },
  { area: "Hosur", pincode: "635109", zone: "Southeast" },

  // Southwest Bengaluru
  { area: "Uttarahalli", pincode: "560061", zone: "Southwest" },
  { area: "Kengeri", pincode: "560060", zone: "Southwest" },
  { area: "Rajarajeshwari Nagar", pincode: "560098", zone: "Southwest" },
  { area: "Vijayanagar", pincode: "560040", zone: "Southwest" },
  { area: "Basaveshwaranagar", pincode: "560079", zone: "Southwest" },
  { area: "Nagarbhavi", pincode: "560072", zone: "Southwest" },
  { area: "Bidadi", pincode: "562109", zone: "Southwest" },
  { area: "Ramanagara", pincode: "562159", zone: "Southwest" },
  { area: "Magadi", pincode: "562120", zone: "Southwest" },
  { area: "Nelamangala", pincode: "562123", zone: "Southwest" },

  // Northeast Bengaluru
  { area: "Hennur", pincode: "560043", zone: "Northeast" },
  { area: "Kodigehalli", pincode: "560092", zone: "Northeast" },
  { area: "Thanisandra", pincode: "560077", zone: "Northeast" },
  { area: "Nagawara", pincode: "560045", zone: "Northeast" },
  { area: "Hennur Road", pincode: "560043", zone: "Northeast" },
  { area: "Kogilu", pincode: "560064", zone: "Northeast" },
  { area: "Bagalur", pincode: "560064", zone: "Northeast" },
  { area: "Kempapura", pincode: "560024", zone: "Northeast" },
  { area: "Chikkaballapur", pincode: "562101", zone: "Northeast" },
  { area: "Doddaballapur", pincode: "561203", zone: "Northeast" },

  // Northwest Bengaluru
  { area: "Peenya", pincode: "560058", zone: "Northwest" },
  { area: "Yeshwanthpur", pincode: "560022", zone: "Northwest" },
  { area: "Tumkur Road", pincode: "560022", zone: "Northwest" },
  { area: "Nelamangala", pincode: "562123", zone: "Northwest" },
  { area: "Doddaballapur Road", pincode: "560064", zone: "Northwest" },
  { area: "Magadi Road", pincode: "560023", zone: "Northwest" },
  { area: "Mysore Road", pincode: "560026", zone: "Northwest" },
  { area: "Hosur Road", pincode: "560100", zone: "Northwest" },
  { area: "Bannerghatta Road", pincode: "560076", zone: "Northwest" },
  { area: "Kanakapura Road", pincode: "560062", zone: "Northwest" }
];

// Get unique pincodes
export const uniquePincodes = [...new Set(bengaluruAreas.map(area => area.pincode))].sort();

// Get areas by zone
export const getAreasByZone = (zone: string) => 
  bengaluruAreas.filter(area => area.zone === zone);

// Get areas by pincode
export const getAreasByPincode = (pincode: string) => 
  bengaluruAreas.filter(area => area.pincode === pincode);

// Get all zones
export const zones = [...new Set(bengaluruAreas.map(area => area.zone))];

// Popular areas for SEO
export const popularAreas = bengaluruAreas.filter(area => 
  ['Whitefield', 'Koramangala', 'HSR Layout', 'Electronic City', 'Indiranagar', 
   'Marathahalli', 'BTM Layout', 'Jayanagar', 'Malleshwaram', 'Rajajinagar'].includes(area.area)
);
