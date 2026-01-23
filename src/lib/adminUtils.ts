// Admin Dashboard Utility Functions

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
export const bangaloreAreas = [
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
  'Kadubeesanahalli', 'Kadugodi', 'Kaggadasapura', 'Kalyan Nagar', 'Kalyan Nagar Main Road',
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
  'Yelahanka', 'Yelahanka New Town', 'Yeshwanthpur', 'Yeshwanthpur Industrial'
];

// Extract photo URLs from various formats
export const extractPhotoUrls = (photos: any[]): string[] => {
  if (!Array.isArray(photos)) return [];
  return photos.map(photo => {
    if (typeof photo === 'string') {
      return photo;
    } else if (photo && typeof photo === 'object' && photo.secure_url) {
      return photo.secure_url;
    }
    return null;
  }).filter(url => url !== null) as string[];
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

// Normalize string for comparison - handles variations like "J.P Nagar" vs "JP Nagar"
const normalizeForComparison = (str: string): string => {
  return str
    .toLowerCase()
    .replace(/\./g, '') // Remove dots (J.P -> JP)
    .replace(/\s+/g, '') // Remove all spaces (J P -> JP)
    .trim();
};

// Reusable function to extract location from any address string
// Only returns a match if it's confident - otherwise returns null
export const extractLocationFromAddressString = (completeAddress: string): string | null => {
  if (!completeAddress || completeAddress.trim().length === 0) {
    return null;
  }

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

