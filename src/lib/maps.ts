// Maps utility functions for Google Maps integration

export interface LocationData {
  latitude: number;
  longitude: number;
  formattedAddress?: string;
}

export interface AddressData {
  houseNumber?: string;
  street?: string;
  area?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  fullAddress?: string;
}

/**
 * Generate Google Maps URL for a location
 */
export const generateGoogleMapsUrl = (location: LocationData, address?: string): string => {
  const { latitude, longitude } = location;
  // Always use coordinates for exact location, only use address as fallback if no coordinates
  if (latitude && longitude) {
    // Use the place parameter for exact coordinates - most reliable format
    return `https://www.google.com/maps/place/${latitude},${longitude}`;
  }
  // Fallback to address if no coordinates available
  const query = address || 'Unknown Location';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
};

/**
 * Generate Google Maps directions URL
 */
export const generateGoogleMapsDirections = (destination: LocationData, address?: string): string => {
  const { latitude, longitude } = destination;
  // Always use coordinates for exact location, only use address as fallback if no coordinates
  if (latitude && longitude) {
    return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
  }
  // Fallback to address if no coordinates available
  const query = address || 'Unknown Location';
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
};

/**
 * Remove Google Plus Codes from address string
 * Plus codes look like "VJVJ+8XW" and should be removed from display
 */
export const removePlusCode = (address: string): string => {
  // Match patterns like "VJVJ+8XW", "VJVJ+8XW, Address", etc.
  // Plus codes typically have 2-6 characters, a +, and 2-6 characters
  const plusCodePattern = /\s*[A-Z0-9]{2,6}\+[A-Z0-9]{2,6}\s*,?\s*/gi;
  return address.replace(plusCodePattern, '').trim();
};

/**
 * Format address for display
 */
export const formatAddressForDisplay = (address: string | AddressData): string => {
  if (typeof address === 'string') {
    return removePlusCode(address);
  }
  
  const parts = [];
  if (address.houseNumber) parts.push(address.houseNumber);
  if (address.street) parts.push(address.street);
  if (address.area) parts.push(address.area);
  if (address.city) parts.push(address.city);
  if (address.state) parts.push(address.state);
  if (address.pincode) parts.push(address.pincode);
  
  const fullAddress = parts.join(', ');
  return removePlusCode(fullAddress);
};

/**
 * Extract coordinates from location data
 */
export const extractCoordinates = (location: any): LocationData | null => {
  if (!location) return null;
  
  // Handle different location data formats
  if (location.latitude && location.longitude) {
    return {
      latitude: location.latitude,
      longitude: location.longitude,
      formattedAddress: location.formattedAddress
    };
  }
  
  if (location.lat && location.lng) {
    return {
      latitude: location.lat,
      longitude: location.lng,
      formattedAddress: location.formattedAddress
    };
  }
  
  return null;
};

/**
 * Open Google Maps in new tab
 */
export const openInGoogleMaps = (location: LocationData, address?: string): void => {
  const url = generateGoogleMapsUrl(location, address);
  window.open(url, '_blank', 'noopener,noreferrer');
};

/**
 * Copy coordinates to clipboard
 */
export const copyCoordinatesToClipboard = async (location: LocationData): Promise<void> => {
  const coordinates = `${location.latitude}, ${location.longitude}`;
  try {
    await navigator.clipboard.writeText(coordinates);
  } catch (err) {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = coordinates;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  }
};
