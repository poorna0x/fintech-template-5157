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
  if (latitude && longitude) {
    return `https://www.google.com/maps/place/${latitude},${longitude}`;
  }
  const query = address || 'Unknown Location';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
};

/**
 * Generate Google Maps directions URL (destination only — navigation from current location).
 */
export const generateGoogleMapsDirections = (destination: LocationData, address?: string): string => {
  const { latitude, longitude } = destination;
  // Always use coordinates for exact location, only use address as fallback if no coordinates
  if (latitude && longitude) {
    return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving&avoid=tolls`;
  }
  // Fallback to address if no coordinates available
  const query = address || 'Unknown Location';
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}&travelmode=driving&avoid=tolls`;
};

type LatLngPoint = { lat: number; lng: number };

/**
 * Google Maps directions URL from a fixed origin to destination (driving).
 * @see https://developers.google.com/maps/documentation/urls/get-started#directions-action
 */
export const generateGoogleMapsDirectionsBetween = (
  origin: LatLngPoint,
  destination: LatLngPoint,
  travelMode: 'driving' | 'walking' | 'bicycling' | 'transit' = 'driving'
): string => {
  const params = new URLSearchParams({
    api: '1',
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    travelmode: travelMode,
  });
  if (travelMode === 'driving') params.set('avoid', 'tolls');
  return `https://www.google.com/maps/dir/?${params.toString()}`;
};

/**
 * Multi-stop driving route for Google Maps (origin → optional waypoints → destination).
 * Maps URL API allows a limited number of waypoints; keep intermediate stops ≤ 9.
 */
export const generateGoogleMapsMultiStopDirections = (
  stops: LatLngPoint[],
  travelMode: 'driving' | 'walking' | 'bicycling' | 'transit' = 'driving'
): string | null => {
  if (!stops || stops.length < 2) return null;
  const origin = stops[0];
  const destination = stops[stops.length - 1];
  const middle = stops.slice(1, -1).slice(0, 9);
  const params = new URLSearchParams({
    api: '1',
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    travelmode: travelMode,
  });
  if (travelMode === 'driving') params.set('avoid', 'tolls');
  if (middle.length > 0) {
    params.set(
      'waypoints',
      middle.map((p) => `${p.lat},${p.lng}`).join('|')
    );
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
};

export const openGoogleMapsMultiStopDirections = (stops: LatLngPoint[]): boolean => {
  const url = generateGoogleMapsMultiStopDirections(stops);
  if (!url) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
};

/**
 * Open Google Maps directions between two coordinates in a new tab (or Maps app on mobile).
 */
export const openGoogleMapsDirectionsBetween = (
  origin: LatLngPoint,
  destination: LatLngPoint,
  travelMode?: 'driving' | 'walking' | 'bicycling' | 'transit'
): void => {
  const url = generateGoogleMapsDirectionsBetween(origin, destination, travelMode);
  window.open(url, '_blank', 'noopener,noreferrer');
};

/**
 * Distance between two points in km (Haversine formula).
 * Used to compare booking location with existing customer location.
 */
/** True when lat/lng are finite and not the default 0,0 placeholder. */
export function hasValidMapCoordinates(
  coords: { lat?: number; lng?: number } | null | undefined
): boolean {
  const lat = coords?.lat;
  const lng = coords?.lng;
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    (lat !== 0 || lng !== 0)
  );
}

/** Read latitude/longitude from a customer/job location JSON blob. */
export function readLocationLatLng(
  location: unknown
): { lat: number; lng: number } | null {
  if (!location || typeof location !== 'object') return null;
  const loc = location as Record<string, unknown>;
  const latRaw = loc.latitude ?? loc.lat;
  const lngRaw = loc.longitude ?? loc.lng;
  const lat = typeof latRaw === 'number' ? latRaw : parseFloat(String(latRaw ?? ''));
  const lng = typeof lngRaw === 'number' ? lngRaw : parseFloat(String(lngRaw ?? ''));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    return null;
  }
  return { lat, lng };
}

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Remove Google Plus Codes from address string.
 * Plus codes look like "VM99+4P" / "VJVJ+8XW" and should not appear in Full Address.
 */
export const removePlusCode = (address: string): string => {
  if (!address) return '';
  // Match patterns like "VM99+4P", "VJVJ+8XW, Address", "3Q5F+23 Place", etc.
  // Global Plus Codes: 2–8 chars, +, 2–3 chars (local/compound forms vary).
  const plusCodePattern = /\s*[A-Z0-9]{2,8}\+[A-Z0-9]{2,3}\s*,?\s*/gi;
  return address
    .replace(plusCodePattern, ' ')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
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
