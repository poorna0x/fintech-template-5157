import {
  fetchOfficeLocation,
  readCachedOfficePin,
  writeCachedOfficePin,
  type OfficeLocation,
} from '@/lib/officeLocationSettings';

/**
 * This browser / phone only. v2 ignores the old shared setting that had been
 * copied onto the phone, so a phone that never chose stays off.
 */
const CACHE_KEY = 'hro_directions_from_office_v2';

export function readDirectionsFromOffice(): boolean {
  try {
    return localStorage.getItem(CACHE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeDirectionsFromOffice(on: boolean): void {
  try {
    localStorage.setItem(CACHE_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** Load this phone's pin-click preference and the shared office pin before opening Maps. */
export async function ensureAdminDirectionsPrefs(): Promise<{
  fromOffice: boolean;
  office: OfficeLocation | null;
}> {
  const officeResult = await fetchOfficeLocation();
  if (!officeResult.error) writeCachedOfficePin(officeResult.office);
  return {
    fromOffice: readDirectionsFromOffice(),
    office: officeResult.error ? readCachedOfficePin() : officeResult.office,
  };
}
