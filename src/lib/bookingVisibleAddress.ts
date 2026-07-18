import {
  resolveVisibleAddressFromGoogleOnly,
  reverseGeocodeLatLng,
} from '@/lib/adminUtils';
import { hasValidMapCoordinates } from '@/lib/maps';

/**
 * Short location (visible_address) for public /book create+update.
 * Google reverse-geocode only (neighborhood / sublocality / Plus Code place) —
 * does not use the bangaloreAreas list.
 */
export async function resolveBookingVisibleAddress(options: {
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}): Promise<string | null> {
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

  return resolveVisibleAddressFromGoogleOnly({
    formattedAddress: geo.formattedAddress,
    addressComponents: geo.addressComponents,
  });
}
