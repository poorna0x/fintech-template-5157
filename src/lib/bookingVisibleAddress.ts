import {
  resolveVisibleAddressFromGeocode,
  reverseGeocodeLatLng,
} from '@/lib/adminUtils';
import { hasValidMapCoordinates } from '@/lib/maps';

/**
 * Short location (visible_address) for public /book create+update.
 * Tries address text first; reverse-geocodes only when needed.
 */
export async function resolveBookingVisibleAddress(options: {
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}): Promise<string | null> {
  const address = typeof options.address === 'string' ? options.address.trim() : '';

  const fromText = resolveVisibleAddressFromGeocode({
    formattedAddress: address || null,
    addressHints: address ? [address] : [],
  });
  if (fromText) return fromText;

  const lat = options.lat;
  const lng = options.lng;
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !hasValidMapCoordinates({ lat, lng })
  ) {
    return null;
  }

  const geo = await reverseGeocodeLatLng(lat, lng);
  if (!geo) return null;

  return resolveVisibleAddressFromGeocode({
    formattedAddress: geo.formattedAddress,
    addressComponents: geo.addressComponents,
    addressHints: address ? [address] : [],
  });
}
