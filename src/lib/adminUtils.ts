// Admin Dashboard Utility Functions

import type { Job } from '@/types';

/** Technician employee id used for zero-commission (office) completions. */
export const ZERO_COMMISSION_EMPLOYEE_ID = 'TECH851703400';

const ONGOING_JOB_STATUSES = new Set(['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS']);

/** True when the job list belongs on the Ongoing tab (or is empty). */
export function jobsMatchOngoingTab(jobs: Job[]): boolean {
  if (jobs.length === 0) return true;
  return jobs.some((job) => ONGOING_JOB_STATUSES.has(job.status));
}

// Generate job number utility
export const generateJobNumber = (serviceType: 'RO' | 'SOFTENER'): string => {
  const prefix = serviceType === 'RO' ? 'RO' : 'WS';
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
  return `${prefix}${timestamp}${random}`;
};

// Helper function to format preferred time slot with custom time
export const formatPreferredTimeSlot = (timeSlot: string | undefined, customTime: string | null | undefined): string => {
  if (!timeSlot) return 'Not specified';
  
  if (timeSlot === 'CUSTOM' && customTime) {
    // Format custom time (HH:MM) to readable format (e.g., "2:30 PM")
    const [hours, minutes] = customTime.split(':');
    const hour24 = parseInt(hours);
    const hour12 = hour24 > 12 ? hour24 - 12 : (hour24 === 0 ? 12 : hour24);
    const ampm = hour24 >= 12 ? 'PM' : 'AM';
    return `Custom: ${hour12}:${minutes} ${ampm}`;
  }
  
  const timeSlotMap: { [key: string]: string } = {
    'MORNING': 'Morning (9 AM - 1 PM)',
    'AFTERNOON': 'Afternoon (1 PM - 6 PM)',
    'EVENING': 'Evening (6 PM - 9 PM)',
    'CUSTOM': 'Custom Time'
  };
  
  return timeSlotMap[timeSlot] || timeSlot;
};

// Map service types array to database service_type value
export const mapServiceTypesToDbValue = (serviceTypes: string[]): string => {
  if (serviceTypes.length === 0) return 'RO'; // Default
  
  const sortedTypes = [...serviceTypes].sort();
  const hasRO = sortedTypes.includes('RO');
  const hasSOFTENER = sortedTypes.includes('SOFTENER');
  const hasAC = sortedTypes.includes('AC');
  const hasAPPLIANCE = sortedTypes.includes('APPLIANCE');
  
  // Check for ALL_SERVICES (RO, SOFTENER, AC)
  if (hasRO && hasSOFTENER && hasAC && sortedTypes.length === 3) {
    return 'ALL_SERVICES';
  }
  
  // Check for RO_SOFTENER
  if (hasRO && hasSOFTENER && sortedTypes.length === 2) {
    return 'RO_SOFTENER';
  }
  
  // Check for RO_AC
  if (hasRO && hasAC && sortedTypes.length === 2) {
    return 'RO_AC';
  }
  
  // Check for SOFTENER_AC
  if (hasSOFTENER && hasAC && sortedTypes.length === 2) {
    return 'SOFTENER_AC';
  }
  
  // Single service types
  if (sortedTypes.length === 1) {
    return sortedTypes[0];
  }
  
  // Fallback: if multiple types not matching above, use first one
  return sortedTypes[0] || 'RO';
};

// Calculate Levenshtein distance for fuzzy matching (handles typos)
export const levenshteinDistance = (str1: string, str2: string): number => {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  const matrix: number[][] = [];

  for (let i = 0; i <= s2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= s1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[s2.length][s1.length];
};

// Calculate similarity score (0-1, where 1 is perfect match)
export const calculateSimilarity = (str1: string, str2: string): number => {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(str1, str2);
  return 1 - (distance / maxLen);
};

// Bangalore areas list for address autocomplete
// Include spelling variations (K.R Puram / KR Puram / Krishnarajapuram, J.P Nagar / JP Nagar) so suggestions match
export const bangaloreAreas = [
  // Name variations (same place, different spellings – so autocomplete finds them)
  'Krishnarajapuram', 'K.R Puram', 'K R Puram', 'K.R. Puram', 'KR Puram',
  'J.P Nagar', 'J P Nagar', 'J.P. Nagar', 'JP Nagar',
  'R.T Nagar', 'R T Nagar', 'RT Nagar',
  'H.S.R Layout', 'H S R Layout', 'HSR Layout', 'HSR',
  'B.T.M Layout', 'B T M Layout', 'BTM Layout', 'BTM',
  'C.V Raman Nagar', 'CV Raman Nagar',
  'G.B Palya', 'G.B. Palya', 'GB Palya', 'GB palya',
  'R.R Nagar', 'R R Nagar', 'RR Nagar',
  // Popular Areas
  'Bansawadi', 'Koramangala', 'Whitefield', 'Indiranagar', 'HSR', 'BTM', 'JP Nagar',
  'Malleshwaram', 'Rajajinagar', 'Vijayanagar', 'Basavanagudi', 'Banashankari', 'Jayanagar',
  'Yelahanka', 'Hebbal', 'RT Nagar', 'Vasanthnagar', 'Cunningham', 'Frazer Town', 'Marathahalli',
  'Bellandur', 'Electronic City', 'Bommanahalli', 'Bommasandra', 'Kadubeesanahalli', 'Mahadevapura',
  'KR Puram', 'HAL', 'Domlur', 'Ulsoor', 'Richmond', 'Shivajinagar', 'Cox Town', 'Cooke Town',
  'Austin Town', 'Richards Town', 'Murphy Town', 'Benson Town', 'HBR Layout', 'Kalyan Nagar',
  'Sahakara Nagar', 'Mathikere', 'Yeshwanthpur', 'Peenya', 'Chamrajpet', 'Chickpet', 'Gandhinagar',
  'Majestic', 'City Market', 'KR Market', 'Lalbagh', 'BTM Layout', 'Hosur Road', 'Bannerghatta',
  'Jigani', 'Anekal', 'Varthur', 'Sarjapur', 'Hoodi', 'Kundalahalli', 'Brookefield', 'Kaggadasapura',
  'Nagavara', 'Thanisandra', 'Hennur', 'Horamavu', 'Kothanur', 'Ramamurthy Nagar', 'Banaswadi',
  'CV Raman Nagar', 'Murugeshpalya', 'Adugodi', 'Wilson Garden', 'Richmond Town', 'Shanti Nagar',
  'Ashok Nagar', 'MG Road', 'Brigade Road', 'Commercial Street', 'Residency Road', 'Cubbon Park',
  'Vidhana Soudha', 'Cantonment', 'Bowring', 'Richmond Circle', 'Lavelle Road', 'St Marks Road',
  'Kasturba Road', 'Nrupathunga Road', 'Hudson Circle', 'Kempegowda', 'Majestic Bus Stand',
  // Additional North Bangalore
  'Sanjay Nagar', 'Gokula', 'Attiguppe', 'Vijaya Nagar', 'Nagarbhavi', 'Kengeri', 'Rajajinagar Extension',
  'Basaveshwara Nagar', 'Vijayanagar Extension', 'Yeshwanthpur Industrial', 'Nelamangala', 'Doddaballapur',
  'Devanahalli', 'Yelahanka New Town', 'Jakkur', 'Bagalur', 'Vidyaranyapura', 'MS Palya', 'Byatarayanapura',
  // Additional South Bangalore
  'BTM 2nd Stage', 'BTM 1st Stage', 'Uttarahalli', 'Girinagar',
  'JP Nagar 1st Phase', 'JP Nagar 2nd Phase', 'JP Nagar 3rd Phase', 'JP Nagar 4th Phase', 'JP Nagar 5th Phase',
  'JP Nagar 6th Phase', 'JP Nagar 7th Phase', 'JP Nagar 8th Phase', 'JP Nagar 9th Phase', 'Bannerghatta Road',
  'Arekere', 'Hulimavu', 'Begur', 'HSR Sector 1', 'HSR Sector 2', 'HSR Sector 3', 'HSR Sector 4',
  'HSR Sector 5', 'HSR Sector 6', 'HSR Sector 7', 'Arakere Mico Layout', 'Bommanahalli', 'Singasandra',
  'Hosa Road', 'Konanakunte', 'Doddakallasandra', 'Vijaya Bank Layout', 'Padmanabhanagar', 'Hosur',
  // Additional East Bangalore
  'Whitefield Main Road', 'ITPL', 'Kadugodi', 'Varthur Kodi', 'Panathur', 'Kundalahalli Gate',
  'AECS Layout', 'Doddanekundi', 'Marathahalli Bridge', 'Varthur Road', 'Whitefield Road', 'Hope Farm',
  'Budigere', 'Avalahalli', 'Bidrahalli', 'Kannamangala', 'Vaddarahalli', 'Chikkajala', 'Bagalur',
  'KR Puram Railway Station', 'Baiyappanahalli', 'Hennur Main Road', 'Kalyan Nagar Main Road',
  // Additional West Bangalore
  'Rajajinagar Industrial', 'Peenya Industrial', 'Jalahalli', 'Dasarahalli', 'Nagasandra', 'Tumkur Road',
  'Nelamangala Road', 'Magadi Road', 'Mysore Road', 'Kengeri Satellite Town', 'Rajarajeshwari Nagar',
  'Kumbalgodu', 'Anjanapura', 'Nayandahalli', 'Kengeri', 'Uttarahalli Hobli', 'Bidadi', 'Ramanagara',
  // Additional Central Bangalore
  'MG Road', 'Brigade Road', 'Commercial Street', 'Residency Road', 'Cubbon Park', 'Vidhana Soudha',
  'Cantonment', 'Bowring', 'Richmond Circle', 'Lavelle Road', 'St Marks Road', 'Kasturba Road',
  'Nrupathunga Road', 'Hudson Circle', 'Kempegowda Bus Stand', 'Shivajinagar Bus Stand', 'Russell Market',
  'Church Street', 'Rest House Road', 'Cunningham Road', 'Miller Road', 'Palace Road',
  'Kempegowda', 'Majestic Bus Stand', 'City Railway Station',
  // Outer Areas
  'Nelamangala', 'Doddaballapur', 'Devanahalli', 'Hoskote', 'Anekal', 'Jigani', 'Bidadi', 'Ramanagara', 'Ramanagaram',
  'Magadi', 'Tumkur', 'Tumkuru', 'Kolar', 'Kolar City', 'Chikkaballapur',
  // Additional Areas - Kaknpura side and nearby
  'Adda', 'Kaknpura', 'Kakanpura', 'Kaknepura', 'Kaknepura Side', 'Kaknpura Side',
  'Ttible', 'Ttibble', 'Tibble', 'Tibble Side',
  // Layouts and Extensions
  'HBR Layout', 'HRBR Layout', 'KHB Layout', 'ARE Layout', 'BEML Layout', 'BEL Layout', 'ISRO Layout',
  'BDA Layout', 'BDA Complex', 'NRI Layout', 'Prestige Layout', 'Prestige Shantiniketan',
  // Generic Types (removed - these are not location names)
  // 'Home', 'Office', 'Shop', 'Factory', 'Warehouse', 'Residence', 'Apartment', 'Villa', 'House',
  // 'Showroom', 'Workshop', 'Store', 'Building', 'Complex', 'Tower', 'Plaza', 'Mall',
  // More Areas - Extended Coverage
  'Agara', 'Akshayanagar', 'Amruthahalli', 'Anandnagar', 'Ananthapura', 'Anjanapura', 'Arakere',
  'Arekere', 'Avalahalli', 'Bagalur', 'Baiyappanahalli', 'Banaswadi', 'Bannerghatta', 'Basapura',
  'G.B palya', 'GB palya', 'GB Palya', 'Hongasandra', 'Mico Layout', 'Arakere Mico Layout',
  'HSR Layout', 'Somasandrapalya', 'ITI Layout',
  'Basavanagudi', 'Basaveshwara Nagar', 'Begur', 'Bellandur', 'BEML Layout', 'Benson Town',
  'Bhairava Nagar', 'Bidadi', 'Bidrahalli', 'Bommanahalli', 'Bommasandra', 'Brigade Road',
  'Brookefield', 'BTM', 'BTM Layout', 'Budigere', 'Byatarayanapura', 'Chamrajpet', 'Chickpet',
  'Chikkaballapur', 'Chikkajala', 'Church Street', 'City Market', 'Commercial Street', 'Cooke Town',
  'Cox Town', 'Cubbon Park', 'Cunningham', 'CV Raman Nagar', 'Dasarahalli', 'Devanahalli',
  'Doddaballapur', 'Doddakallasandra', 'Doddanekundi', 'Domlur', 'Electronic City', 'Frazer Town',
  'Gandhinagar', 'Girinagar', 'Gokula', 'HAL', 'Hebbal', 'Hennur', 'Hennur Main Road', 'Hoodi',
  'Hope Farm', 'Horamavu', 'Hosa Road', 'Hoskote', 'Hosur', 'Hosur Road', 'HSR', 'HSR Sector 1',
  'HSR Sector 2', 'HSR Sector 3', 'HSR Sector 4', 'HSR Sector 5', 'HSR Sector 6', 'HSR Sector 7',
  'Hudson Circle', 'Hulimavu', 'Indiranagar', 'ITPL', 'Jakkur', 'Jalahalli', 'Jayanagar', 'Jigani',
  'JP Nagar', 'JP Nagar 1st Phase', 'JP Nagar 2nd Phase', 'JP Nagar 3rd Phase', 'JP Nagar 4th Phase',
  'JP Nagar 5th Phase', 'JP Nagar 6th Phase', 'JP Nagar 7th Phase', 'JP Nagar 8th Phase', 'JP Nagar 9th Phase',
  'Kadubeesanahalli', 'Kadugodi', 'Kaggadasapura', 'Kallahalli', 'Kalyan Nagar', 'Kalyan Nagar Main Road',
  'Kannamangala', 'Kasturba Road', 'Kempegowda', 'Kempegowda Bus Stand', 'Kengeri', 'Kengeri Satellite Town',
  'Konanakunte', 'Koramangala', 'Kothanur', 'KR Market', 'KR Puram', 'KR Puram Railway Station',
  'Kumbalgodu', 'Kundalahalli', 'Kundalahalli Gate', 'Lalbagh', 'Lavelle Road', 'Magadi', 'Magadi Road',
  'Mahadevapura', 'Majestic', 'Majestic Bus Stand', 'Marathahalli', 'Marathahalli Bridge', 'Mathikere',
  'MG Road', 'Miller Road', 'MS Palya', 'Murphy Town', 'Murugeshpalya', 'Mysore Road', 'Nagarbhavi',
  'Nagasandra', 'Nagavara', 'Nayandahalli', 'Nelamangala', 'Nelamangala Road', 'NRI Layout',
  'Nrupathunga Road', 'Padmanabhanagar', 'Palace Road', 'Panathur', 'Peenya', 'Peenya Industrial',
  'Prestige Layout', 'Prestige Shantiniketan', 'Rajarajeshwari Nagar', 'Rajajinagar', 'Rajajinagar Extension',
  'Rajajinagar Industrial', 'Ramamurthy Nagar', 'Ramanagara', 'Ramanagaram', 'Residency Road', 'Rest House Road',
  'Richmond', 'Richmond Circle', 'Richmond Town', 'RT Nagar', 'Russell Market', 'Sahakara Nagar',
  'Sanjay Nagar', 'Sarjapur', 'Shanti Nagar', 'Shivajinagar', 'Shivajinagar Bus Stand', 'Singasandra', 'Seshadripuram',
  'St Marks Road', 'Thanisandra', 'Tumkur', 'Tumkuru', 'Tumkur Road', 'Ulsoor', 'Uttarahalli', 'Uttarahalli Hobli',
  'Vaddarahalli', 'Varthur', 'Varthur Kodi', 'Varthur Road', 'Vasanthnagar', 'Vidhana Soudha',
  'Vidyaranyapura', 'Vijaya Bank Layout', 'Vijaya Nagar', 'Vijayanagar', 'Vijayanagar Extension',
  'Whitefield', 'Whitefield Main Road', 'Whitefield Road', 'Wilson Garden', 'Yelahanka', 'Yelahanka New Town',
  'Yeshwanthpur', 'Yeshwanthpur Industrial',
  // Additional Areas - Kaknpura side, Ramanagara, Kolar, Tumkur
  'Adda', 'Kaknpura', 'Kakanpura', 'Kaknepura', 'Kaknepura Side', 'Kaknpura Side',
  'Ttible', 'Ttibble', 'Tibble', 'Tibble Side',
  'Ramanagaram', 'Kolar City', 'Tumkuru',
  // Additional Popular Areas
  'Adugodi', 'AECS Layout', 'Anekal', 'Anjanapura', 'Arakere Mico Layout', 'Arekere', 'Ashok Nagar',
  'Attiguppe', 'Austin Town', 'Avalahalli', 'Baiyappanahalli', 'Banaswadi', 'Bannerghatta Road',
  'Basapura', 'Basaveshwara Nagar', 'BEML Layout', 'Bhairava Nagar', 'Bidrahalli', 'Bommanahalli',
  'Bommasandra', 'Brigade Road', 'Brookefield', 'BTM 1st Stage', 'BTM 2nd Stage', 'Budigere',
  'Byatarayanapura', 'Chikkajala', 'City Railway Station', 'Commercial Street', 'Cooke Town',
  'Cox Town', 'Cunningham Road', 'CV Raman Nagar', 'Dasarahalli', 'Devanahalli', 'Doddaballapur',
  'Doddakallasandra', 'Doddanekundi', 'Domlur', 'Electronic City', 'Frazer Town', 'Gandhinagar',
  'Girinagar', 'Gokula', 'HAL', 'Hebbal', 'Hennur', 'Hennur Main Road', 'Hoodi', 'Hope Farm',
  'Horamavu', 'Hosa Road', 'Hoskote', 'Hosur', 'Hosur Road', 'HSR Sector 1', 'HSR Sector 2',
  'HSR Sector 3', 'HSR Sector 4', 'HSR Sector 5', 'HSR Sector 6', 'HSR Sector 7', 'Hudson Circle',
  'Hulimavu', 'Indiranagar', 'ITPL', 'Jakkur', 'Jalahalli', 'Jayanagar', 'Jigani', 'JP Nagar 1st Phase',
  'JP Nagar 2nd Phase', 'JP Nagar 3rd Phase', 'JP Nagar 4th Phase', 'JP Nagar 5th Phase',
  'JP Nagar 6th Phase', 'JP Nagar 7th Phase', 'JP Nagar 8th Phase', 'JP Nagar 9th Phase',
  'Kadubeesanahalli', 'Kadugodi', 'Kaggadasapura', 'Kalyan Nagar', 'Kalyan Nagar Main Road',
  'Kannamangala', 'Kasturba Road', 'Kempegowda', 'Kempegowda Bus Stand', 'Kengeri',
  'Kengeri Satellite Town', 'Konanakunte', 'Koramangala', 'Kothanur', 'KR Market', 'KR Puram',
  'KR Puram Railway Station', 'Kumbalgodu', 'Kundalahalli', 'Kundalahalli Gate', 'Lalbagh',
  'Lavelle Road', 'Magadi', 'Magadi Road', 'Mahadevapura', 'Majestic', 'Majestic Bus Stand',
  'Marathahalli', 'Marathahalli Bridge', 'Mathikere', 'MG Road', 'Miller Road', 'MS Palya',
  'Murphy Town', 'Murugeshpalya', 'Mysore Road', 'Nagarbhavi', 'Nagasandra', 'Nagavara',
  'Nayandahalli', 'Nelamangala', 'Nelamangala Road', 'NRI Layout', 'Nrupathunga Road',
  'Padmanabhanagar', 'Palace Road', 'Panathur', 'Peenya', 'Peenya Industrial', 'Prestige Layout',
  'Prestige Shantiniketan', 'Rajarajeshwari Nagar', 'Rajajinagar', 'Rajajinagar Extension',
  'Rajajinagar Industrial', 'Ramamurthy Nagar', 'Ramanagara', 'Residency Road', 'Rest House Road',
  'Richmond', 'Richmond Circle', 'Richmond Town', 'RT Nagar', 'Russell Market', 'Sahakara Nagar',
  'Sanjay Nagar', 'Sarjapur', 'Shanti Nagar', 'Shivajinagar', 'Shivajinagar Bus Stand', 'Singasandra', 'Seshadripuram',
  'St Marks Road', 'Thanisandra', 'Tumkur', 'Tumkur Road', 'Ulsoor', 'Uttarahalli',
  'Uttarahalli Hobli', 'Vaddarahalli', 'Varthur', 'Varthur Kodi', 'Varthur Road', 'Vasanthnagar',
  'Vidhana Soudha', 'Vidyaranyapura', 'Vijaya Bank Layout', 'Vijaya Nagar', 'Vijayanagar',
  'Vijayanagar Extension', 'Whitefield', 'Whitefield Main Road', 'Whitefield Road', 'Wilson Garden',
  'Yelahanka', 'Yelahanka New Town', 'Yeshwanthpur', 'Yeshwanthpur Industrial',
  // Additional popular single-word areas
  'Adugodi', 'Akshayanagar', 'Amruthahalli', 'Anandnagar', 'Ananthapura', 'Arakere',
  'Arekere', 'Avalahalli', 'Bagalur', 'Baiyappanahalli', 'Banaswadi', 'Bannerghatta',
  'Basapura', 'Basaveshwara Nagar', 'Begur', 'Bellandur', 'Benson Town',
  'Bhairava Nagar', 'Bidadi', 'Bidrahalli', 'Bommanahalli', 'Bommasandra',
  'Budigere', 'Byatarayanapura', 'Chikkaballapur', 'Chikkajala', 'Dasarahalli',
  'Doddaballapur', 'Doddakallasandra', 'Doddanekundi', 'Domlur', 'Electronic City',
  'Gandhinagar', 'Girinagar', 'Gokula', 'HAL', 'Hebbal', 'Hennur', 'Hoodi',
  'Hope Farm', 'Horamavu', 'Hosa Road', 'Hoskote', 'Hosur', 'Hulimavu',
  'ITPL', 'Jakkur', 'Jalahalli', 'Jigani', 'Kadubeesanahalli', 'Kadugodi',
  'Kaggadasapura', 'Kannamangala', 'Kengeri', 'Konanakunte', 'Kothanur',
  'Kumbalgodu', 'Kundalahalli', 'Mathikere', 'Nagarbhavi', 'Nagasandra',
  'Nagavara', 'Nayandahalli', 'Nelamangala', 'Padmanabhanagar', 'Panathur',
  'Peenya', 'Ramamurthy Nagar', 'Ramanagara', 'Ramanagaram', 'Seshadripuram',
  'Singasandra', 'Thanisandra', 'Tumkur', 'Tumkuru', 'Uttarahalli', 'Vaddarahalli',
  'Varthur', 'Vidyaranyapura', 'Vijaya Nagar', 'Vijayanagar',
  // More areas - Additional coverage
  'Acharya Layout', 'AECS Layout', 'Agara', 'Akshaya Nagar', 'Ambedkar Nagar', 'Anjanapura',
  'Anugraha Layout', 'Arakere', 'Ashwath Nagar', 'Attiguppe', 'Austin Town',
  'Baiyappanahalli', 'Banaswadi', 'Banashankari', 'Bannerghatta', 'Basavanagudi',
  'Basaveshwara Nagar', 'BEML Layout', 'Benson Town', 'Bhairava Nagar', 'Bidadi',
  'Bidrahalli', 'Bommanahalli', 'Bommasandra', 'Brigade Road', 'Brookefield',
  'BTM', 'BTM Layout', 'Budigere', 'Byatarayanapura', 'Chamrajpet', 'Chickpet',
  'Chikkaballapur', 'Chikkajala', 'Church Street', 'City Market', 'Commercial Street',
  'Cooke Town', 'Cox Town', 'Cubbon Park', 'Cunningham', 'CV Raman Nagar',
  'Dasarahalli', 'Devanahalli', 'Doddaballapur', 'Doddakallasandra', 'Doddanekundi',
  'Domlur', 'Electronic City', 'Frazer Town', 'Gandhinagar', 'Girinagar',
  'Gokula', 'HAL', 'Hebbal', 'Hennur', 'Hennur Main Road', 'Hoodi', 'Hope Farm',
  'Horamavu', 'Hosa Road', 'Hoskote', 'Hosur', 'Hosur Road', 'HSR', 'HSR Sector 1',
  'HSR Sector 2', 'HSR Sector 3', 'HSR Sector 4', 'HSR Sector 5', 'HSR Sector 6',
  'HSR Sector 7', 'Hudson Circle', 'Hulimavu', 'Indiranagar', 'ITPL', 'Jakkur',
  'Jalahalli', 'Jayanagar', 'Jigani', 'Kadubeesanahalli', 'Kadugodi', 'Kaggadasapura',
  'Kalyan Nagar', 'Kalyan Nagar Main Road', 'Kannamangala', 'Kasturba Road',
  'Kempegowda', 'Kempegowda Bus Stand', 'Kengeri', 'Kengeri Satellite Town',
  'Konanakunte', 'Koramangala', 'Kothanur', 'KR Market', 'KR Puram',
  'KR Puram Railway Station', 'Kumbalgodu', 'Kundalahalli', 'Kundalahalli Gate',
  'Lalbagh', 'Lavelle Road', 'Magadi', 'Magadi Road', 'Mahadevapura', 'Majestic',
  'Majestic Bus Stand', 'Marathahalli', 'Marathahalli Bridge', 'Mathikere',
  'MG Road', 'Miller Road', 'MS Palya', 'Murphy Town', 'Murugeshpalya', 'Mysore Road',
  'Nagarbhavi', 'Nagasandra', 'Nagavara', 'Nayandahalli', 'Nelamangala',
  'Nelamangala Road', 'NRI Layout', 'Nrupathunga Road', 'Padmanabhanagar',
  'Palace Road', 'Panathur', 'Peenya', 'Peenya Industrial', 'Prestige Layout',
  'Prestige Shantiniketan', 'Rajarajeshwari Nagar', 'Rajajinagar', 'Rajajinagar Extension',
  'Rajajinagar Industrial', 'Ramamurthy Nagar', 'Ramanagara', 'Ramanagaram',
  'Residency Road', 'Rest House Road', 'Richmond', 'Richmond Circle', 'Richmond Town',
  'RT Nagar', 'Russell Market', 'Sahakara Nagar', 'Sanjay Nagar', 'Sarjapur',
  'Shanti Nagar', 'Shivajinagar', 'Shivajinagar Bus Stand', 'Singasandra',
  'Seshadripuram', 'St Marks Road', 'Thanisandra', 'Tumkur', 'Tumkur Road',
  'Tumkuru', 'Ulsoor', 'Uttarahalli', 'Uttarahalli Hobli', 'Vaddarahalli', 'Varthur',
  'Varthur Kodi', 'Varthur Road', 'Vasanthnagar', 'Vidhana Soudha', 'Vidyaranyapura',
  'Vijaya Bank Layout', 'Vijaya Nagar', 'Vijayanagar', 'Vijayanagar Extension',
  'Whitefield', 'Whitefield Main Road', 'Whitefield Road', 'Wilson Garden',
  'Yelahanka', 'Yelahanka New Town', 'Yeshwanthpur', 'Yeshwanthpur Industrial',
  // More common Bengaluru names (variations and frequently used)
  'Jayanagar 4th Block', 'Jayanagar 3rd Block', 'Jayanagar 1st Block', 'Jayanagar 9th Block',
  'Koramangala 1st Block', 'Koramangala 4th Block', 'Koramangala 5th Block', 'Koramangala 6th Block',
  'Indiranagar 1st Stage', 'Indiranagar 2nd Stage', 'Indiranagar 12th Main',
  'HSR Layout Sector 1', 'HSR Layout Sector 2', 'HSR Layout Sector 3', 'HSR Layout Sector 4',
  'HSR Layout Sector 5', 'HSR Layout Sector 6', 'HSR Layout Sector 7',
  'Bannerghatta', 'Bannerghatta Road', 'Jigani', 'Anekal', 'Hulimavu', 'Arekere', 'Begur',
  'Kaikondrahalli', 'Kasavanahalli', 'Somasundarapalya', 'Madivala', 'Madiwala',
  'Srinagar', 'Padmanabhanagar', 'Uttarahalli', 'Girinagar', 'Kumaraswamy Layout',
  'Tavarekere', 'Hosa Road', 'Singasandra', 'Bommasandra Industrial', 'Electronic City Phase 1',
  'Electronic City Phase 2', 'Konanakunte', 'Doddakallasandra', 'Lakkasandra', 'Ejipura',
  'Koramangala Inner Ring Road', 'Silk Board', 'Central Silk Board', 'BTM Ring Road',
  'Sarjapur Road', 'Outer Ring Road', 'ORR', 'Bellandur Outer Ring Road',
  'Kadugodi', 'Whitefield Road', 'ITPL Road', 'Varthur Road', 'Sarjapur',
  'Hoodi Circle', 'Hope Farm Junction', 'Kundalahalli Gate', 'Marathahalli Bridge',
  'Tin Factory', 'Baiyappanahalli', 'Benniganahalli', 'K R Puram Railway Station',
  'Kasturi Nagar', 'Ramamurthy Nagar', 'Banaswadi', 'HBR Layout', 'Kalyan Nagar',
  'Sahakara Nagar', 'Mathikere', 'Yeshwanthpur', 'Peenya', 'Rajajinagar', 'Malleshwaram',
  'Seshadripuram', 'Chamrajpet', 'Chickpet', 'Gandhinagar', 'Majestic', 'City Market',
  'Shivajinagar', 'Frazer Town', 'Cox Town', 'Cooke Town', 'Austin Town', 'Richards Town',
  'Murphy Town', 'Benson Town', 'Cunningham Road', 'Lavelle Road', 'Residency Road',
  'MG Road', 'Brigade Road', 'Commercial Street', 'Church Street', 'St Marks Road',
  'Jeevan Bheema Nagar', 'Jeevan Bima Nagar', 'Pulikeshi Nagar', 'Kammanahalli',
  'Bharathi Nagar', 'Bharath Nagar', 'Thippasandra', 'Murugeshpalya', 'Adugodi',
  'Ashok Nagar', 'Shanti Nagar', 'Wilson Garden', 'Richmond Town', 'Cubbon Park',
  'Vidhana Soudha', 'Cantonment', 'Ulsoor', 'Domlur', 'HAL 2nd Stage', 'HAL 3rd Stage',
  'Nagavara', 'Thanisandra', 'Hennur', 'Horamavu', 'Kothanur', 'Bagalur', 'Jakkur',
  'Vidyaranyapura', 'MS Palya', 'Byatarayanapura', 'Doddaballapur', 'Chikkaballapur',
  'Devanahalli', 'Hoskote', 'Hosur', 'Nelamangala', 'Tumkur', 'Tumkuru', 'Ramanagara',
  'Ramanagaram', 'Magadi', 'Bidadi', 'Kolar', 'Channasandra', 'Raghavendra Nagar',
  'Shakambari Nagar', 'Nandini Layout', 'Mahalakshmi Layout', 'Kengeri', 'Rajarajeshwari Nagar',
  'Nayandahalli', 'Kumbalgodu', 'Uttarahalli Hobli', 'Jalahalli', 'Dasarahalli',
  'Nagasandra', 'Peenya Industrial', 'Rajajinagar Industrial', 'Basaveshwara Nagar',
  'Vijayanagar Extension', 'Attiguppe', 'Gokula', 'Sanjay Nagar', 'Nagarbhavi',
  'Vidyaranyapura', 'Yelahanka New Town', 'Jakkur', 'Sahakar Nagar',
  // Sarjapur Road corridor — common localities (fetch location / visible address)
  'Vibuthipura', 'Vibhuthipura', 'Kalahalli', 'Kallahalli',
  'Carmelaram', 'Dommasandra', 'Doddakannelli', 'Kodathi', 'Haralur',
  'Chikkakannalli', 'Handenahalli', 'Halanayakanahalli', 'Attibele', 'Muthanallur',
  'Iblur', 'Ambalipura', 'Kudlu', 'Kudlu Gate', 'Sarjapur', 'Sarjapur Road',
  'Kaikondrahalli', 'Kasavanahalli', 'Harlur', 'Hosa Road Junction',
  // Yelahanka / North Bangalore — common localities (fetch location / visible address)
  'Allalasandra', 'Attur Layout', 'Singanayakanahalli', 'Rajanukunte', 'Rachenahalli',
  'Chikkabettahalli', 'Dodda Bettahalli', 'Kogilu', 'Kogilu Cross', 'Nagenahalli',
  'Giddenahalli', 'Maruthinagar', 'Puttanahalli', 'Judicial Layout', 'Doddabommasandra',
  'Agrahara Badavane', 'Sir M Visvesvaraya Layout', 'Yelahanka Satellite Town',
  'Yelahanka Old Town', 'Attur', 'Alahalli', 'Doddaballapura Road',
  // More one-word Bengaluru localities (visible address autocomplete)
  'Gottigere', 'Chandapura', 'Hebbagodi', 'Bannerughatta', 'Halasuru', 'Manyata',
  'Nagawara', 'Kalyananagar', 'Kasturinagar', 'Gunjur', 'Seegehalli', 'Chikkabanavara',
  'Hesarghatta', 'Hessarghatta', 'Abbigere', 'Sunkadakatte', 'Herohalli', 'Soladevanahalli',
  'Vyalikaval', 'Thyagarajanagar', 'Hanumanthanagar', 'Viveknagar', 'Puttenahalli',
  'Chikkakallasandra', 'Thalaghattapura', 'Kanakapura', 'Turahalli', 'Veerasandra',
  'Huskur', 'Yamare', 'Sulikunte', 'Siddapura', 'Garudacharpalya', 'Kodihalli',
  'Guttahalli', 'Mallapura', 'Mahalakshmipuram', 'Gayathrinagar', 'Srirampura',
  'Basavanapura', 'Devasandra', 'Silkboard', 'Doddanekkundi', 'Brookfield', 'Hopefarm',
  'Baiyyappanahalli', 'Byappanahalli', 'Krishnarajapura', 'BIAL', 'HBR', 'HRBR',
  'Chamarajpet', 'Okalipuram', 'Cottonpet', 'Balepet', 'Kathriguppe', 'Hosakerehalli',
  'Bilekahalli', 'Roopena', 'Hongasandra', 'Garvebhavipalya', 'Subramanyapura',
  'Chikkallasandra', 'Ganakal', 'Vasanthapura', 'Kadirenahalli', 'Yelachenahalli',
  'Ittamadu', 'Katriguppe', 'Deepanjalinagar', 'Lingarajapuram', 'Harohalli',
  'Parappana', 'Choodasandra', 'Gattahalli', 'Muthsandra', 'Hadosiddapura',
  'Sulikere', 'Thubarahalli', 'Cubbon',
  'Guddahatti', 'Guddahatti Gate', 'Chandapura Gate',
  'Amanidoddakere', 'Amani Doddakere', 'Hosakote', 'Hoskote Town',
  // Even more one-word Bengaluru localities
  'Anjanapura', 'Arehalli', 'Avalahalli', 'Bagalagunte', 'Banashankari', 'Basapura',
  'Belathur', 'Benniganahalli', 'Bettahalli', 'Bhattarahalli', 'Bhoganahalli', 'Bikasipura',
  'Byatarayanapura', 'Byrathi', 'Channasandra', 'Chikkabanavara', 'Chikkabidarakallu',
  'Chikkabommasandra', 'Chikkagubbi', 'Chikkanahalli', 'Chikkasandra', 'Chinnapanahalli',
  'Chokkanahalli', 'Dasarahalli', 'Doddagubbi', 'Doddabidarakallu', 'Doddabommasandra',
  'Doddanekundi', 'Dodda Nekkundi', 'Doddakallasandra', 'Ejipura', 'Gandhipuram',
  'Ganganagar', 'Geddalahalli', 'Gokula', 'Gopalan', 'Goraguntepalya', 'Gottigere',
  'Govindarajanagar', 'Guddadahalli', 'Gunjurpalya', 'Hadosiddapura', 'Halanayakanahalli',
  'Haralur', 'Harlur', 'Hebbal', 'Hemmigepura', 'Hongasandra', 'Horamavu', 'Hosa Road',
  'Hosahalli', 'Hulimavu', 'Hunasamaranahalli', 'Iblur', 'Indiranagar', 'ISRO',
  'Jakkur', 'Jalahalli', 'Jeevanbima', 'Jigani', 'JPNagar', 'Judicial', 'Kadubeesanahalli',
  'Kadugodi', 'Kaggadasapura', 'Kaikondrahalli', 'Kalkere', 'Kammanahalli', 'Kannamangala',
  'Kasavanahalli', 'Kattigenahalli', 'Kempegowda', 'Kengeri', 'Kodathi', 'Kodigehalli',
  'Kodihalli', 'Kogilu', 'Konanakunte', 'Koralur', 'Kothanur', 'Kudlu', 'Kumbalgodu',
  'Kundalahalli', 'Lakkasandra', 'Lalbagh', 'Lingapura', 'Madivala', 'Mahadevapura',
  'Mahalakshmi', 'Majestic', 'Mallathahalli', 'Malleshpalya', 'Malleshwaram', 'Marathahalli',
  'Mathikere', 'Medahalli', 'Meenakunte', 'Mico', 'Munnekolala', 'Murugeshpalya',
  'Mysore', 'Nagarbhavi', 'Nagasandra', 'Nagavara', 'Naganathapura', 'Nayandahalli',
  'Nelamangala', 'Newthippasandra', 'NRI', 'Padmanabhanagar', 'Panathur', 'Pattandur',
  'Peenya', 'Puttenahalli', 'Rachenahalli', 'Ragigudda', 'Rajanukunte', 'Rajajinagar',
  'Ramamurthy', 'Ramanagara', 'Rajarajeshwari', 'RRNagar', 'RTNagar', 'Sahakaranagar',
  'Sampangi', 'Sanjaynagar', 'Sarjapur', 'Seegehalli', 'Shanthinagar', 'Shivajinagar',
  'Singanayakanahalli', 'Singasandra', 'Somasandrapalya', 'Somasundarapalya', 'Srirampuram',
  'Subramanyapura', 'Suddaguntepalya', 'Sunkadakatte', 'Tavarekere', 'Thanisandra',
  'Thippasandra', 'Thubarahalli', 'TinFactory', 'Tumkur', 'Ulsoor', 'Uttarahalli',
  'Varthur', 'Vasanthnagar', 'Veerasandra', 'Vibhuthipura', 'Vidyaranyapura', 'Vijayanagar',
  'Whitefield', 'Wilson', 'Yelahanka', 'Yelachenahalli', 'Yeshwanthpur', 'Yespothahalli',
  'Amruthnagar', 'Anandnagar', 'Ashwathnagar', 'Banashankari', 'Basaveshwaranagar',
  'Benson', 'Bharathinagar', 'Byrasandra', 'Chamarajpet', 'Chickpet', 'Cooke',
  'Cox', 'Cubbon', 'Cunningham', 'Dayananda', 'Domlur', 'Frazer', 'Gandhinagar',
  'Girinagar', 'Guttahalli', 'HAL', 'Hebbal', 'Hennur', 'Horamavu', 'Hoskote',
  'Hosur', 'HSR', 'Indiranagar', 'ITPL', 'Jakkur', 'Jalahalli', 'Jayanagar',
  'Kalyananagar', 'Kammanahalli', 'Kasturinagar', 'Kengeri', 'Koramangala',
  'Krishnarajapura', 'Kundalahalli', 'Lalbagh', 'Lavelle', 'Magadi', 'Mahadevapura',
  'Majestic', 'Malleshwaram', 'Marathahalli', 'Mathikere', 'Murphy', 'Nagarbhavi',
  'Nagasandra', 'Nagavara', 'Nayandahalli', 'Nelamangala', 'Padmanabhanagar',
  'Panathur', 'Peenya', 'Rajajinagar', 'Ramamurthynagar', 'Richmond', 'RTNagar',
  'Sahakaranagar', 'Sanjaynagar', 'Sarjapur', 'Seshadripuram', 'Shanthinagar',
  'Shivajinagar', 'Singasandra', 'Thanisandra', 'Ulsoor', 'Uttarahalli', 'Varthur',
  'Vasanthnagar', 'Vidyaranyapura', 'Vijayanagar', 'Whitefield', 'Yelahanka',
  'Yeshwanthpur', 'Akshayanagar', 'Arekere', 'Attibele', 'Avalahalli', 'Bagalur',
  'Baiyappanahalli', 'Banaswadi', 'Bannerghatta', 'Basapura', 'Begur', 'Bellandur',
  'Bidadi', 'Bommanahalli', 'Bommasandra', 'Brookefield', 'Budigere', 'Byatarayanapura',
  'Carmelaram', 'Chandapura', 'Chikkajala', 'Dasarahalli', 'Devanahalli', 'Doddaballapur',
  'Doddanekundi', 'Dommasandra', 'Electronic', 'Gandhinagar', 'Girinagar', 'Gottigere',
  'Gunjur', 'Haralur', 'Hebbagodi', 'Hennur', 'Hoodi', 'Horamavu', 'Hulimavu',
  'Huskur', 'Iblur', 'Jakkur', 'Jigani', 'Kadubeesanahalli', 'Kadugodi', 'Kaggadasapura',
  'Kaikondrahalli', 'Kannamangala', 'Kasavanahalli', 'Kodathi', 'Konanakunte', 'Kothanur',
  'Kudlu', 'Kumbalgodu', 'Kundalahalli', 'Mahadevapura', 'Manyata', 'Munnekolala',
  'Murugeshpalya', 'Nagavara', 'Nagasandra', 'Panathur', 'Puttenahalli', 'Rachenahalli',
  'Rajanukunte', 'Sarjapur', 'Seegehalli', 'Singasandra', 'Thanisandra', 'Thubarahalli',
  'Uttarahalli', 'Varthur', 'Veerasandra', 'Vidyaranyapura', 'Yelahanka', 'Yeshwanthpur',
  'Ambalipura', 'Anjanapura', 'Belathur', 'Benniganahalli', 'Bhoganahalli', 'Byrathi',
  'Chikkabanavara', 'Chinnapanahalli', 'Garudacharpalya', 'Geddalahalli', 'Goraguntepalya',
  'Halasuru', 'Harohalli', 'Hemmigepura', 'Herohalli', 'Hopefarm', 'Hunasamaranahalli',
  'Kalkere', 'Kattigenahalli', 'Kodigehalli', 'Kogilu', 'Koralur', 'Mallathahalli',
  'Malleshpalya', 'Medahalli', 'Meenakunte', 'Naganathapura', 'Newthippasandra',
  'Pattandur', 'Ragigudda', 'Silkboard', 'Soladevanahalli', 'Somasundarapalya',
  'Srirampuram', 'Suddaguntepalya', 'Sunkadakatte', 'Thippasandra', 'Turahalli',
  'Vibhuthipura', 'Vyalikaval', 'Yamare', 'Yelachenahalli', 'Abbigere', 'Allalasandra',
  'Attur', 'Basavanapura', 'Bilekahalli', 'Chamarajpet', 'Chikkakallasandra',
  'Cottonpet', 'Devasandra', 'Gattahalli', 'Gayathrinagar', 'Guttahalli', 'Hadosiddapura',
  'Hanumanthanagar', 'Hessarghatta', 'Hosakerehalli', 'Ittamadu', 'Kathriguppe',
  'Katriguppe', 'Kodihalli', 'Krishnarajapura', 'Lingarajapuram', 'Mahalakshmipuram',
  'Mallapura', 'Okalipuram', 'Parappana', 'Siddapura', 'Srirampura', 'Subramanyapura',
  'Sulikunte', 'Thalaghattapura', 'Thyagarajanagar', 'Vasanthapura', 'Viveknagar',
  'Balepet', 'BIAL', 'Brookfield', 'Choodasandra', 'Deepanjalinagar', 'Doddanekkundi',
  'Ganakal', 'Garvebhavipalya', 'Hongasandra', 'Kadirenahalli', 'Muthsandra', 'Roopena',
  'Sulikere', 'Bannerughatta', 'Byappanahalli', 'Baiyyappanahalli', 'HBR', 'HRBR',
  'Kanakapura', 'Nagawara', 'Kalyananagar', 'Kasturinagar', 'Ramamurthynagar',
  'Sahakaranagar', 'Sanjaynagar', 'Shanthinagar', 'RRNagar', 'RTNagar', 'JPNagar',
  'BTM', 'HSR', 'ORR', 'HAL', 'ITPL', 'AECS', 'BEML', 'BEL', 'ISRO', 'NRI'
];

/** Single photo entry from DB / JSON (string, Cloudinary object, etc.) → usable https URL or null. */
export const normalizePhotoUrl = (input: unknown): string | null => {
  if (input == null) return null;
  if (typeof input === 'string') {
    const s = input.trim();
    if (!s) return null;
    if (
      s.startsWith('http://') ||
      s.startsWith('https://') ||
      s.startsWith('blob:') ||
      s.startsWith('data:image/')
    ) {
      return s;
    }
    return null;
  }
  if (typeof input === 'object') {
    const o = input as Record<string, unknown>;
    const raw =
      (typeof o.secure_url === 'string' && o.secure_url.trim()) ||
      (typeof o.url === 'string' && o.url.trim()) ||
      '';
    const s = String(raw).trim();
    if (
      s.startsWith('http://') ||
      s.startsWith('https://') ||
      s.startsWith('blob:') ||
      s.startsWith('data:image/')
    ) {
      return s;
    }
  }
  return null;
};

// Extract photo URLs from various formats
export const extractPhotoUrls = (photos: any[]): string[] => {
  if (!Array.isArray(photos)) return [];
  return photos.map((p) => normalizePhotoUrl(p)).filter((url): url is string => url !== null);
};

// Parse job requirements - handles string, array, or object formats
export const parseJobRequirements = (reqData: any): any[] => {
  let requirements: any[] = [];
  try {
    if (typeof reqData === 'string') {
      requirements = JSON.parse(reqData);
    } else if (Array.isArray(reqData)) {
      requirements = reqData;
    } else if (reqData && typeof reqData === 'object') {
      requirements = [reqData];
    }
  } catch (e) {
    requirements = [];
  }
  return requirements;
};

/**
 * True when a job was completed by the office (no field technician). Marked via a
 * `{ completed_by_office: true }` entry in the job's requirements JSON, since the
 * `completed_by` column is a uuid and can't hold a sentinel string.
 */
export const isOfficeCompletedJob = (job: any): boolean => {
  if (!job) return false;
  const reqs = parseJobRequirements((job as any).requirements ?? job.requirements);
  return reqs.some((r: any) => r?.completed_by_office === true);
};

export interface OfficeJobPart {
  inventory_id: string;
  product_name: string;
  code: string | null;
  quantity: number;
  unit_price: number;
}

/**
 * Spare parts attached to an office / walk-in job. Reads the new `office_parts` array and
 * falls back to the legacy single-item `direct_sale_*` shape so older sales still show.
 */
export const getOfficeJobParts = (job: any): OfficeJobPart[] => {
  if (!job) return [];
  const reqs = parseJobRequirements((job as any).requirements ?? job.requirements);

  const arrEntry = reqs.find((r: any) => Array.isArray(r?.office_parts));
  if (arrEntry && Array.isArray(arrEntry.office_parts)) {
    return arrEntry.office_parts
      .filter((p: any) => p && p.inventory_id)
      .map((p: any) => ({
        inventory_id: String(p.inventory_id),
        product_name: p.product_name || '',
        code: p.code ?? null,
        quantity: Math.max(0, Math.floor(Number(p.quantity) || 0)),
        unit_price: Math.max(0, Number(p.unit_price) || 0),
      }));
  }

  const legacy = reqs.find((r: any) => r?.direct_sale_inventory_id);
  if (legacy) {
    const qty = Math.max(0, Math.floor(Number(legacy.direct_sale_quantity) || 0));
    const cost = Math.max(0, Number(legacy.direct_sale_parts_cost) || 0);
    return [
      {
        inventory_id: String(legacy.direct_sale_inventory_id),
        product_name: '',
        code: null,
        quantity: qty || 1,
        unit_price: qty > 0 ? cost / qty : cost,
      },
    ];
  }

  return [];
};

// Format time string to 12-hour format
export const formatTimeTo12Hour = (timeString: string | null): string | null => {
  if (!timeString) return null;
  const [hours, minutes] = String(timeString).split(':');
  if (!hours || !minutes) {
    return timeString;
  }
  const hourNum = parseInt(hours, 10);
  if (Number.isNaN(hourNum)) {
    return timeString;
  }
  const normalizedHour = ((hourNum % 12) + 12) % 12 || 12;
  const suffix = hourNum >= 12 ? 'PM' : 'AM';
  return `${normalizedHour}:${minutes.padEnd(2, '0')} ${suffix}`;
};

/** Short custom visit time for WhatsApp (e.g. "9 AM", "10:30 AM"), or null if none. */
export function formatCustomTimeLabel(timeString: string | null | undefined): string | null {
  if (!timeString || !String(timeString).trim()) return null;
  const formatted = formatTimeTo12Hour(String(timeString).trim());
  if (!formatted) return String(timeString).trim();
  return formatted.replace(/:00 /, ' ');
}

/** Custom visit time from job requirements for WhatsApp, or null if none. */
export function getJobCustomTimeLabel(job: Record<string, unknown> | null | undefined): string | null {
  if (!job) return null;
  try {
    const requirements = parseJobRequirements(job.requirements);
    const customTime = requirements.find((r: any) => r?.custom_time)?.custom_time;
    return formatCustomTimeLabel(typeof customTime === 'string' ? customTime : null);
  } catch {
    return null;
  }
}

// Get formatted time slot from job requirements
export const getFormattedTimeSlot = (job: any, requirements: any[]): string => {
  // Check if there's a custom time in requirements
  const customTime = requirements.find((r: any) => r?.custom_time)?.custom_time;
  
  if (customTime) {
    return formatTimeTo12Hour(customTime) || customTime;
  }
  
  // Check for flexible time
  const isFlexible = requirements.find((r: any) => r?.flexible_time)?.flexible_time;
  if (isFlexible) {
    return 'Flexible';
  }
  
  // Otherwise show the time slot
  const timeSlot = job.scheduled_time_slot || job.scheduledTimeSlot || 'Time not specified';
  const timeSlotMap: { [key: string]: string } = {
    'MORNING': 'Morning (9 AM - 1 PM)',
    'AFTERNOON': 'Afternoon (1 PM - 6 PM)',
    'EVENING': 'Evening (6 PM - 9 PM)'
  };
  return timeSlotMap[timeSlot] || timeSlot;
};

// Find lead source in requirements
export const findLeadSource = (requirements: any[]): string | null => {
  let leadSource: string | null = null;
  
  // Try to find lead_source in the array
  for (const req of requirements) {
    if (req && typeof req === 'object') {
      if (req.lead_source) {
        leadSource = req.lead_source;
        break;
      }
    }
  }
  
  // If still no lead_source found, check if requirements array has objects with nested properties
  if (!leadSource && requirements.length > 0) {
    const flatReq = requirements.flat();
    for (const req of flatReq) {
      if (req && typeof req === 'object' && req.lead_source) {
        leadSource = req.lead_source;
        break;
      }
    }
  }
  
  return leadSource;
};

function resolveWebsiteLeadLabel(
  job: Record<string, unknown>,
  leadSource: string
): string {
  if (leadSource !== 'Website') return leadSource;
  const bookingSource = String(job.booking_source ?? '').trim().toLowerCase();
  const bookingDomain = String(job.booking_domain ?? '').trim();
  if (bookingSource === 'elevenro') return 'Website (ElevenRO)';
  if (bookingSource === 'hydrogenro') return 'Website (HydrogenRO)';
  if (bookingDomain) return `Website (${bookingDomain})`;
  return leadSource;
}

/** Resolve lead source from requirements JSON (incl. Other → custom label). */
export function resolveLeadSourceFromRequirements(
  job: Record<string, unknown> | null | undefined
): string | null {
  if (!job) return null;
  try {
    const requirements = parseJobRequirements(job.requirements);
    const ls = findLeadSource(requirements);
    if (!ls || !String(ls).trim()) return null;

    const trimmed = String(ls).trim();
    if (trimmed.toLowerCase() === 'other') {
      for (const req of requirements) {
        const custom = req?.lead_source_custom;
        if (custom && String(custom).trim()) return String(custom).trim();
      }
      return 'Other';
    }

    return resolveWebsiteLeadLabel(job, trimmed);
  } catch {
    return null;
  }
}

/** Lead source for analytics — prefers requirements when column is empty/default. */
export function getLeadSourceFromJob(job: Record<string, unknown> | null | undefined): string {
  if (!job) return 'Direct call';

  const fromRequirements = resolveLeadSourceFromRequirements(job);
  const fromColumn = typeof job.lead_source === 'string' ? job.lead_source.trim() : '';

  if (fromRequirements) {
    if (!fromColumn || fromColumn === 'Direct call') {
      return fromRequirements;
    }
  }

  if (fromColumn) return fromColumn;
  if (fromRequirements) return fromRequirements;

  if (job.assigned_by || job.assignedBy) return 'Admin Created';
  return 'Direct call';
}

const isMeaningfulEquipmentValue = (val: unknown): val is string => {
  if (typeof val !== 'string') return false;
  const t = val.trim();
  return t !== '' && t.toLowerCase() !== 'not specified' && t.toLowerCase() !== 'n/a';
};

/** Label for job equipment row in customer report (RO vs softener). */
export function getEquipmentModelLabel(serviceType: string | undefined): string {
  const st = (serviceType || '').toUpperCase();
  if (st === 'SOFTENER') return 'Softener Model';
  return 'Purifier Model';
}

/** Resolve brand/model for a job, with customer fallback (incl. comma-separated multi-service). */
export function getJobEquipmentDisplay(
  job: Record<string, unknown>,
  customer?: Record<string, unknown> | null
): { label: string; value: string } | null {
  const jobServiceType = String(job.service_type ?? job.serviceType ?? '').toUpperCase();
  const jobBrand = String(job.brand ?? '');
  const jobModel = String(job.model ?? '');
  const customerBrand = String(customer?.brand ?? '');
  const customerModel = String(customer?.model ?? '');

  let brand = isMeaningfulEquipmentValue(jobBrand) ? jobBrand.trim() : '';
  let model = isMeaningfulEquipmentValue(jobModel) ? jobModel.trim() : '';

  if (!brand || !model) {
    if (customerBrand.includes(',')) {
      const brands = customerBrand.split(',').map((b) => b.trim());
      const models = customerModel ? customerModel.split(',').map((m) => m.trim()) : [];
      if (jobServiceType === 'RO' || jobServiceType === '') {
        if (!brand) brand = brands[0] || '';
        if (!model) model = models[0] || '';
      } else if (jobServiceType === 'SOFTENER' && brands.length > 1) {
        if (!brand) brand = brands[1] || brands[0] || '';
        if (!model) model = models[1] || models[0] || '';
      } else {
        if (!brand) brand = brands[0] || '';
        if (!model) model = models[0] || '';
      }
    } else {
      if (!brand && isMeaningfulEquipmentValue(customerBrand)) brand = customerBrand.trim();
      if (!model && isMeaningfulEquipmentValue(customerModel)) model = customerModel.trim();
    }
  }

  const validBrand = isMeaningfulEquipmentValue(brand) ? brand : '';
  const validModel = isMeaningfulEquipmentValue(model) ? model : '';
  if (!validBrand && !validModel) return null;

  const value =
    validBrand && validModel ? `${validBrand} - ${validModel}` : validBrand || validModel;

  return { label: getEquipmentModelLabel(jobServiceType), value };
}

/** Local calendar date (yyyy-mm-dd) for a job's completion timestamp. */
export function jobCompletionLocalDateIso(
  job: Record<string, unknown>
): string | null {
  const raw =
    job.completed_at ??
    job.completedAt ??
    job.end_time ??
    job.endTime;
  if (!raw) return null;
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const SERVICE_SUB_TYPE_NORMALIZE_MAP: Record<string, string> = {
  service: 'Service',
  installation: 'Installation',
  reinstallation: 'Reinstallation',
  'return complaint': 'Return Complaint',
  'return service': 'Return Service',
  returnservice: 'Return Service',
  amcservice: 'AMC Service',
  'amc service': 'AMC Service',
  'new purifier installation': 'New Purifier Installation',
  'un-installation': 'Un-Installation',
  uninstallation: 'Un-Installation',
  repair: 'Repair',
  maintenance: 'Maintenance',
  replacement: 'Replacement',
  inspection: 'Inspection',
  other: 'Other',
};

const LEAD_TYPE_NORMALIZE_MAP: Record<string, string> = {
  website: 'Website',
  directcall: 'Direct call',
  googleleads: 'Google-Leads',
  rocareindia: 'RO care india',
  hometriangle: 'Home Triangle',
  hometrianglesrujan: 'Home Triangle-Srujan',
  hometriangle3: 'Home Triangle-3',
  localramu: 'Local Ramu',
  admincreated: 'Admin Created',
  other: 'Other',
};

/** Same canonical labels as the admin completed-jobs list (picker + client filter). */
export function normalizeServiceSubType(value: string): string {
  const raw = (value || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  const compact = lower.replace(/[\s_-]+/g, '');
  return (
    SERVICE_SUB_TYPE_NORMALIZE_MAP[lower] ||
    SERVICE_SUB_TYPE_NORMALIZE_MAP[compact] ||
    raw
  );
}

export function normalizeLeadType(value: string): string {
  const raw = (value || '').trim();
  if (!raw) return '';
  const key = raw.toLowerCase().replace(/[\s_-]+/g, '');
  return LEAD_TYPE_NORMALIZE_MAP[key] || raw;
}

export function isHomeTriangleLeadSource(leadSource: string | undefined | null): boolean {
  const s = (leadSource || '').trim().toLowerCase();
  if (!s) return false;
  return s === 'home triangle' || s.startsWith('home triangle');
}

function resolveJobServiceSubTypeLabel(
  serviceSubType: string | undefined | null,
  customValue?: string | null,
): string {
  const base = (serviceSubType || '').trim();
  if (base === 'Custom' || base === 'Other') {
    return (customValue || '').trim() || base;
  }
  return base;
}

function isInstallationOrReinstallationServiceSubType(
  serviceSubType: string | undefined | null,
  customValue?: string | null,
): boolean {
  const label = resolveJobServiceSubTypeLabel(serviceSubType, customValue).toLowerCase();
  return label === 'installation' || label === 'reinstallation';
}

/** Default lead cost (₹) by lead source; Home Triangle + Installation/Reinstallation → 116. */
export function getDefaultLeadCost(
  leadSource: string,
  serviceSubType?: string,
  serviceSubTypeCustom?: string,
): string {
  if (
    isHomeTriangleLeadSource(leadSource) &&
    isInstallationOrReinstallationServiceSubType(serviceSubType, serviceSubTypeCustom)
  ) {
    return '116';
  }
  switch (leadSource) {
    case 'Home Triangle':
    case 'Home Triangle-Srujan':
    case 'Home Triangle-3':
      return '231';
    case 'Direct call':
      return '0';
    case 'RO care india':
      return '400';
    case 'Local Ramu':
      return '500';
    case 'Google-Leads':
    case 'Website':
      return '0';
    default:
      return '0';
  }
}

/** Technician row shape from admin dashboard / API (camelCase or snake_case). */
export type CompletedJobTechnicianLike = {
  id?: string;
  fullName?: string;
  full_name?: string;
  employee_id?: string;
  employeeId?: string;
};

/** Resolve “completed by” to a display name using the technician list (same rules as admin list filters). */
export function getCompletedJobTechnicianDisplayName(
  job: Record<string, unknown> | null | undefined,
  technicians: CompletedJobTechnicianLike[]
): string {
  const technicianNameByIdLower = new Map<string, string>();
  const technicianNameByNameLower = new Map<string, string>();
  technicians.forEach((t) => {
    if (t.id) technicianNameByIdLower.set(String(t.id).toLowerCase(), (t.fullName || t.full_name || '').trim());
    const name = (t.fullName || t.full_name || '').trim();
    if (name) technicianNameByNameLower.set(name.toLowerCase(), name);
  });
  const completedByIdOrName = (job?.completed_by ?? job?.completedBy ?? '').toString().trim();
  const completedByName = (job?.completed_by_name ?? '').toString().trim();
  if (completedByIdOrName) {
    const key = completedByIdOrName.toLowerCase();
    if (technicianNameByIdLower.has(key)) return technicianNameByIdLower.get(key)!;
    if (technicianNameByNameLower.has(key)) return technicianNameByNameLower.get(key)!;
  }
  if (completedByName) {
    const key = completedByName.toLowerCase();
    if (technicianNameByNameLower.has(key)) return technicianNameByNameLower.get(key)!;
  }
  return '';
}

export type CompletedDashboardClientFilters = {
  leadType: string;
  serviceSubType: string;
  completedBy: string;
};

/**
 * Client-side filters for the admin “Completed” tab (lead / service sub-type / completed-by).
 * Must stay in sync with the dashboard list; used for batch pagination when filters are active.
 */
export function completedJobMatchesDashboardClientFilters(
  job: Record<string, unknown> | null | undefined,
  filters: CompletedDashboardClientFilters,
  technicians: CompletedJobTechnicianLike[]
): boolean {
  if (!job) return false;
  if (filters.leadType !== 'all') {
    const lead = (findLeadSource(parseJobRequirements(job.requirements)) || 'Direct call').trim();
    if (normalizeLeadType(lead) !== normalizeLeadType(filters.leadType)) return false;
  }
  if (filters.serviceSubType !== 'all') {
    const st = normalizeServiceSubType(
      String(job.service_sub_type ?? job.serviceSubType ?? '').trim()
    );
    if (st !== normalizeServiceSubType(filters.serviceSubType)) return false;
  }
  if (filters.completedBy !== 'all') {
    const name = getCompletedJobTechnicianDisplayName(job, technicians);
    if (name.toLowerCase() !== filters.completedBy.trim().toLowerCase()) return false;
  }
  return true;
}

/**
 * Values for PostgREST `in('service_sub_type', …)` so DB casing / legacy labels still match
 * the same normalization used client-side in `doesCompletedJobMatchFilters`.
 */
export function serviceSubTypeDbMatchValues(uiFilterChoice: string): string[] {
  const trimmed = (uiFilterChoice || '').trim();
  if (!trimmed) return [];
  const canon = normalizeServiceSubType(trimmed);
  const out = new Set<string>();
  out.add(trimmed);
  if (canon) out.add(canon);
  const lower = trimmed.toLowerCase();
  if (lower) out.add(lower);
  if (canon && canon.toLowerCase() !== lower) out.add(canon.toLowerCase());
  for (const [k, v] of Object.entries(SERVICE_SUB_TYPE_NORMALIZE_MAP)) {
    if (v === canon) {
      out.add(k);
      if (k.includes('-')) out.add(k.replace(/-/g, ' '));
    }
  }
  return [...out].filter(Boolean);
}

/**
 * `lead_source` strings to use with PostgREST `requirements` `cs` (jsonb contains) so pagination
 * matches the lead filter. Array containment treats `[{"lead_source":"X"}]` as a subset of rows
 * whose requirements array has an object that includes that key/value (extra keys OK).
 */
export function completedJobLeadSourceContainVariants(uiFilterChoice: string): string[] {
  const trimmed = (uiFilterChoice || '').trim();
  if (!trimmed) return [];

  const canon = normalizeLeadType(trimmed);
  const vals = new Set<string>();
  vals.add(canon);
  if (trimmed !== canon) vals.add(trimmed);

  const tl = trimmed.toLowerCase();
  const cl = canon.toLowerCase();
  if (tl !== cl) vals.add(tl);

  for (const [k, v] of Object.entries(LEAD_TYPE_NORMALIZE_MAP)) {
    if (v === canon && k !== cl && k !== tl) vals.add(k);
  }
  return [...vals];
}

// Normalize string for comparison - handles variations like "J.P Nagar" vs "JP Nagar" (exported for Analytics location grouping)
export const normalizeForComparison = (str: string): string => {
  return str
    .toLowerCase()
    .replace(/\./g, '') // Remove dots (J.P -> JP)
    .replace(/\s+/g, '') // Remove all spaces (J P -> JP)
    .trim();
};

/** Max length for customer one-word / short location (visible_address). */
export const VISIBLE_ADDRESS_MAX_LEN = 40;

const GENERIC_GEO_LOCALITIES = new Set(
  [
    'bengaluru',
    'bangalore',
    'karnataka',
    'india',
    'in',
    'ka',
    'urban',
    'rural',
    'district',
    'taluk',
    'hobli',
    'bengaluru urban',
    'bangalore urban',
    'bengaluru urban district',
    'bangalore urban district',
    'bengaluru rural',
    'bangalore rural',
  ].map((s) => s.toLowerCase())
);

function clipVisibleAddress(value: string): string {
  return value.trim().substring(0, VISIBLE_ADDRESS_MAX_LEN);
}

function isGenericGeoLocality(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n || n.length < 3) return true;
  if (GENERIC_GEO_LOCALITIES.has(n)) return true;
  if (/^\d{6}$/.test(n)) return true; // pincode
  // "Bengaluru Urban", "Anekal Taluk", etc.
  if (/\b(bengaluru|bangalore)\b/.test(n) && /\b(urban|rural|district|division|metropolitan)\b/.test(n)) {
    return true;
  }
  if (/\btaluk\b/.test(n) && n.split(/\s+/).length <= 3) {
    // Prefer bare place name over "Anekal Taluk" when we can; still allow list match separately
  }
  return false;
}

/** Longest bangaloreAreas name that appears in the full address text. */
export function findLongestAreaMatchInText(completeAddress: string): string | null {
  if (!completeAddress?.trim()) return null;

  const uniqueAreas = [...new Set(bangaloreAreas)];
  const haystack = completeAddress.toLowerCase();
  const hayNorm = normalizeForComparison(completeAddress);

  let best: string | null = null;
  let bestLen = 0;

  for (const area of uniqueAreas) {
    const trimmed = area.trim();
    if (trimmed.length < 3) continue;
    const areaLower = trimmed.toLowerCase();
    const areaNorm = normalizeForComparison(trimmed);
    const hit =
      haystack.includes(areaLower) ||
      (areaNorm.length >= 3 && hayNorm.includes(areaNorm));
    if (hit && trimmed.length > bestLen) {
      best = trimmed;
      bestLen = trimmed.length;
    }
  }

  return best;
}

export type GoogleAddressComponentLike = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

const GOOGLE_SHORT_LOCATION_TYPES = [
  'neighborhood',
  'sublocality_level_1',
  'sublocality',
  'sublocality_level_2',
  'sublocality_level_3',
  'administrative_area_level_3',
  'administrative_area_level_4',
  'administrative_area_level_2',
  // Small towns/villages often come as locality (Bengaluru is filtered as generic)
  'locality',
  'premise',
] as const;

function componentLabel(comp: GoogleAddressComponentLike): string {
  return (comp.long_name || comp.short_name || '').trim();
}

/** Join all Google component labels so list matching can see Anekal/etc. even when missing from formatted_address. */
function joinGoogleComponentText(components: GoogleAddressComponentLike[]): string {
  return components
    .map((c) => componentLabel(c))
    .join(', ');
}

/**
 * Google Plus Code lines look like: "3Q5F+23 Amanidoddakere, India"
 * Extract the place name after the code (skip India/Karnataka/Bengaluru).
 */
export function extractPlaceFromPlusCodeAddress(formatted: string): string | null {
  if (!formatted?.trim()) return null;
  const m = formatted.trim().match(/^[A-Z0-9]{2,}\+[A-Z0-9]{2,}\s+(.+)$/i);
  if (!m) return null;

  const parts = m[1]
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    if (isGenericGeoLocality(part)) continue;
    // Drop trailing "Taluk"/"District" noise when present
    const cleaned = part.replace(/\s+(Taluk|District|Hobli)$/i, '').trim();
    if (!cleaned || isGenericGeoLocality(cleaned)) continue;
    return cleaned;
  }
  return null;
}

/**
 * Short location from Google reverse-geocode address_components (same Fetch call).
 * 1) Longest list match across ALL component names (covers Anekal in admin levels)
 * 2) Else first useful neighborhood/sublocality/admin/locality label
 */
export function shortLocationFromGoogleComponents(
  components: GoogleAddressComponentLike[] | null | undefined
): string | null {
  if (!Array.isArray(components) || components.length === 0) return null;

  // List match on every component label (and combined text) — works when Google
  // puts the place in administrative_area_level_* instead of neighborhood.
  const combined = joinGoogleComponentText(components);
  const listFromAll = findLongestAreaMatchInText(combined);
  if (listFromAll) return clipVisibleAddress(listFromAll);

  for (const type of GOOGLE_SHORT_LOCATION_TYPES) {
    const comp = components.find((c) => Array.isArray(c.types) && c.types.includes(type));
    const raw = componentLabel(comp || {});
    if (!raw || isGenericGeoLocality(raw)) continue;

    // Strip trailing " Taluk" / " District" for cleaner short location
    const cleaned = raw.replace(/\s+(Taluk|District|Hobli)$/i, '').trim();
    if (!cleaned || isGenericGeoLocality(cleaned)) continue;

    const fromList = findLongestAreaMatchInText(cleaned);
    if (fromList) return clipVisibleAddress(fromList);
    return clipVisibleAddress(cleaned);
  }

  return null;
}

/**
 * Resolve short/visible location after Fetch Address:
 * 1) bangaloreAreas list (longest match in address text / hints / Google components)
 * 2) Place name from Plus Code formatted addresses (e.g. "3Q5F+23 Amanidoddakere, India")
 * 3) Google place components from the same reverse-geocode (no extra API call)
 */
export function resolveVisibleAddressFromGeocode(options: {
  formattedAddress?: string | null;
  addressComponents?: GoogleAddressComponentLike[] | null;
  addressHints?: Array<string | null | undefined>;
}): string | null {
  const componentText = Array.isArray(options.addressComponents)
    ? joinGoogleComponentText(options.addressComponents)
    : '';

  const texts = [
    options.formattedAddress,
    componentText,
    ...(options.addressHints || []),
  ].filter((t): t is string => typeof t === 'string' && t.trim().length > 0);

  for (const text of texts) {
    const longest = findLongestAreaMatchInText(text);
    if (longest) return clipVisibleAddress(longest);
    const legacy = extractLocationFromAddressString(text);
    if (legacy) return clipVisibleAddress(legacy);
  }

  // Plus Code addresses often omit Hoskote/etc. and only name the village
  if (options.formattedAddress) {
    const plusPlace = extractPlaceFromPlusCodeAddress(options.formattedAddress);
    if (plusPlace) {
      const fromList = findLongestAreaMatchInText(plusPlace);
      if (fromList) return clipVisibleAddress(fromList);
      return clipVisibleAddress(plusPlace);
    }
  }

  return shortLocationFromGoogleComponents(options.addressComponents);
}

export type ReverseGeocodeResult = {
  formattedAddress: string;
  addressComponents: GoogleAddressComponentLike[];
};

/** Browser reverse-geocode — returns formatted address + components (one Google call). */
export async function reverseGeocodeLatLng(
  lat: number,
  lng: number
): Promise<ReverseGeocodeResult | null> {
  try {
    if (typeof window === 'undefined' || !window.google?.maps?.Geocoder) {
      return null;
    }
    return await new Promise((resolve) => {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        const ok =
          status === 'OK' ||
          (typeof window.google?.maps?.GeocoderStatus !== 'undefined' &&
            status === window.google.maps.GeocoderStatus.OK);
        if (ok && results && results[0]?.formatted_address) {
          resolve({
            formattedAddress: results[0].formatted_address,
            addressComponents: (results[0].address_components || []).map((c) => ({
              long_name: c.long_name,
              short_name: c.short_name,
              types: c.types ? [...c.types] : [],
            })),
          });
        } else {
          resolve(null);
        }
      });
    });
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return null;
  }
}

// Reusable function to extract location from any address string
// Only returns a match if it's confident - otherwise returns null
export const extractLocationFromAddressString = (completeAddress: string): string | null => {
  if (!completeAddress || completeAddress.trim().length === 0) {
    return null;
  }

  // Prefer longest area name found anywhere in the full address
  const longest = findLongestAreaMatchInText(completeAddress);
  if (longest) return longest;

  // Remove duplicates from bangaloreAreas
  const uniqueAreas = [...new Set(bangaloreAreas)];
  
  // Split address by common delimiters and extract potential location keywords
  const addressParts = completeAddress
    .split(/[,\s]+/)
    .map(part => part.trim())
    .filter(part => part.length > 2); // Filter out very short parts

  // First, try exact matches (highest priority - most confident)
  for (const part of addressParts) {
    const partLower = part.toLowerCase();
    const exactMatch = uniqueAreas.find(area => 
      area.toLowerCase() === partLower
    );
    if (exactMatch) {
      return exactMatch;
    }
  }

  // Second, try normalized exact matches (handles "J.P Nagar" vs "JP Nagar")
  for (const part of addressParts) {
    const normalizedPart = normalizeForComparison(part);
    const normalizedMatch = uniqueAreas.find(area => {
      const normalizedArea = normalizeForComparison(area);
      return normalizedArea === normalizedPart;
    });
    if (normalizedMatch) {
      return normalizedMatch;
    }
  }

  // Third, try multi-word exact matches (e.g., "G.B palya" should match "G.B palya")
  // This is more confident than partial matches
  for (let i = 0; i < addressParts.length - 1; i++) {
    const twoWordPart = `${addressParts[i]} ${addressParts[i + 1]}`.toLowerCase();
    const multiWordMatch = uniqueAreas.find(area => 
      area.toLowerCase() === twoWordPart
    );
    if (multiWordMatch) {
      return multiWordMatch;
    }
  }

  // Fourth, try normalized multi-word matches (handles "J.P Nagar" vs "JP Nagar")
  for (let i = 0; i < addressParts.length - 1; i++) {
    const twoWordPart = `${addressParts[i]} ${addressParts[i + 1]}`;
    const normalizedTwoWord = normalizeForComparison(twoWordPart);
    const normalizedMultiWordMatch = uniqueAreas.find(area => {
      const normalizedArea = normalizeForComparison(area);
      return normalizedArea === normalizedTwoWord;
    });
    if (normalizedMultiWordMatch) {
      return normalizedMultiWordMatch;
    }
  }

  // Third, try strict partial matches (only if part is significant length and match is substantial)
  // Only match if the part is at least 5 characters and the match covers at least 70% of the shorter string
  for (const part of addressParts) {
    if (part.length < 5) continue; // Require at least 5 characters for partial match
    const partLower = part.toLowerCase();
    const partialMatch = uniqueAreas.find(area => {
      const areaLower = area.toLowerCase();
      // Only match if one contains the other AND the overlap is substantial
      if (areaLower.includes(partLower)) {
        // Part must be at least 70% of the area name
        return partLower.length >= areaLower.length * 0.7;
      }
      if (partLower.includes(areaLower)) {
        // Area must be at least 70% of the part
        return areaLower.length >= partLower.length * 0.7;
      }
      return false;
    });
    if (partialMatch) {
      return partialMatch;
    }
  }

  // Last resort: fuzzy matching for typos (very strict - only for longer parts with high similarity)
  let bestMatch: string | null = null;
  let bestScore = 0.85; // Very high threshold (85%) to avoid false matches

  for (const part of addressParts) {
    if (part.length < 6) continue; // Require at least 6 characters for fuzzy matching

    for (const area of uniqueAreas) {
      // Skip if lengths are too different (more than 30% difference - very strict)
      const lengthDiff = Math.abs(area.length - part.length) / Math.max(area.length, part.length);
      if (lengthDiff > 0.3) continue;

      // Calculate similarity
      const similarity = calculateSimilarity(part, area);
      
      // Only use fuzzy match if similarity is very high
      if (similarity > bestScore) {
        bestScore = similarity;
        bestMatch = area;
      }
    }
  }

  // Only return match if we found a confident one, otherwise return null
  return bestMatch;
};

