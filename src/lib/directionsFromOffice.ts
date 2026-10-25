import { supabase } from '@/lib/supabase';
import {
  fetchOfficeLocation,
  readCachedOfficePin,
  writeCachedOfficePin,
  type OfficeLocation,
} from '@/lib/officeLocationSettings';

export const DIRECTIONS_FROM_OFFICE_KEY = 'directions_from_office';

const CACHE_KEY = 'hro_directions_from_office_v1';

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

export async function fetchDirectionsFromOffice(): Promise<{
  enabled: boolean;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('crm_settings')
    .select('value')
    .eq('key', DIRECTIONS_FROM_OFFICE_KEY)
    .maybeSingle();
  if (error) return { enabled: readDirectionsFromOffice(), error: error.message };
  const enabled = data?.value === true;
  writeDirectionsFromOffice(enabled);
  return { enabled, error: null };
}

export async function saveDirectionsFromOffice(
  enabled: boolean
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await supabase.from('crm_settings').upsert(
    {
      key: DIRECTIONS_FROM_OFFICE_KEY,
      value: enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );
  if (!error) writeDirectionsFromOffice(enabled);
  return { ok: !error, error: error?.message || null };
}

/** Load the pin-click preference and the office pin before opening Maps. */
export async function ensureAdminDirectionsPrefs(): Promise<{
  fromOffice: boolean;
  office: OfficeLocation | null;
}> {
  const [flag, officeResult] = await Promise.all([
    fetchDirectionsFromOffice(),
    fetchOfficeLocation(),
  ]);
  if (!officeResult.error) writeCachedOfficePin(officeResult.office);
  return {
    fromOffice: flag.enabled,
    office: officeResult.error ? readCachedOfficePin() : officeResult.office,
  };
}
