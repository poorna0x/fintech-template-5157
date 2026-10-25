import { supabase } from '@/lib/supabase';

export const OFFICE_LOCATION_KEY = 'office_location';
const OFFICE_PIN_CACHE_KEY = 'hro_office_pin_v1';

export type OfficeLocation = {
  lat: number;
  lng: number;
  mapsUrl?: string;
  label?: string;
};

function parseOffice(value: unknown): OfficeLocation | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const lat = Number(row.lat ?? row.latitude);
  const lng = Number(row.lng ?? row.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  return {
    lat,
    lng,
    mapsUrl: typeof row.mapsUrl === 'string' ? row.mapsUrl : undefined,
    label: typeof row.label === 'string' ? row.label : undefined,
  };
}

export function readCachedOfficePin(): OfficeLocation | null {
  try {
    const raw = localStorage.getItem(OFFICE_PIN_CACHE_KEY);
    if (!raw) return null;
    return parseOffice(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeCachedOfficePin(office: OfficeLocation | null): void {
  try {
    if (!office) localStorage.removeItem(OFFICE_PIN_CACHE_KEY);
    else localStorage.setItem(OFFICE_PIN_CACHE_KEY, JSON.stringify(office));
  } catch {
    /* ignore */
  }
}

export async function fetchOfficeLocation(): Promise<{
  office: OfficeLocation | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('crm_settings')
    .select('value')
    .eq('key', OFFICE_LOCATION_KEY)
    .maybeSingle();
  if (error) return { office: readCachedOfficePin(), error: error.message };
  const office = parseOffice(data?.value);
  writeCachedOfficePin(office);
  return { office, error: null };
}

export async function saveOfficeLocation(
  office: OfficeLocation
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await supabase.from('crm_settings').upsert(
    {
      key: OFFICE_LOCATION_KEY,
      value: {
        lat: office.lat,
        lng: office.lng,
        ...(office.mapsUrl ? { mapsUrl: office.mapsUrl } : {}),
        ...(office.label ? { label: office.label } : {}),
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );
  if (!error) writeCachedOfficePin(office);
  return { ok: !error, error: error?.message || null };
}
