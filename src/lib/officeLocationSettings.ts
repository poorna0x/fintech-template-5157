import { supabase } from '@/lib/supabase';

export const OFFICE_LOCATION_KEY = 'office_location';

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

export async function fetchOfficeLocation(): Promise<{
  office: OfficeLocation | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('crm_settings')
    .select('value')
    .eq('key', OFFICE_LOCATION_KEY)
    .maybeSingle();
  if (error) return { office: null, error: error.message };
  return { office: parseOffice(data?.value), error: null };
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
  return { ok: !error, error: error?.message || null };
}
