import { supabase } from '@/lib/supabaseClient';
import { haversineKm } from '@/lib/maps';

export const BOOKING_SERVICE_HUBS_TABLE = 'booking_service_hubs';
export const BOOKING_HUB_SETTINGS_TABLE = 'booking_service_hub_settings';

export const DEFAULT_HUB_RADIUS_KM = 5;
export const MIN_HUB_RADIUS_KM = 0.5;
export const MAX_HUB_RADIUS_KM = 25;
export const MAX_CUSTOMER_NOTE_LEN = 240;
export const MAX_OUT_OF_AREA_MESSAGE_LEN = 320;
export const DEFAULT_OUT_OF_AREA_MESSAGE =
  'We will not be able to come here. Please move the pin into a coverage area, or call us.';

export type BookingServiceHub = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  radius_km: number;
  is_active: boolean;
  sort_order: number;
  customer_note: string;
  created_at?: string;
  updated_at?: string;
};

export type BookingHubSettings = {
  out_of_area_message: string;
};

export type HubMatchResult =
  | { ok: true; enforced: false }
  | { ok: true; enforced: true; hub: BookingServiceHub; distanceKm: number }
  | {
      ok: false;
      enforced: true;
      nearest: Array<{ hub: BookingServiceHub; distanceKm: number }>;
    };

const PUBLIC_COLUMNS = 'id,name,address,lat,lng,radius_km,is_active,sort_order,customer_note,created_at,updated_at';
const PUBLIC_COLUMNS_LEGACY = 'id,name,address,lat,lng,radius_km,is_active,sort_order,created_at,updated_at';

let memoryHubs: BookingServiceHub[] | null = null;
let memoryHubsAt = 0;
let memorySettings: BookingHubSettings | null = null;
let memorySettingsAt = 0;
const MEMORY_TTL_MS = 60_000;

function isMissingTableError(message: string | undefined): boolean {
  const msg = String(message || '').toLowerCase();
  return (
    msg.includes('booking_service_hubs') &&
    (msg.includes('does not exist') ||
      msg.includes('schema cache') ||
      msg.includes('could not find the table'))
  );
}

export function clampHubRadiusKm(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_HUB_RADIUS_KM;
  return Math.min(MAX_HUB_RADIUS_KM, Math.max(MIN_HUB_RADIUS_KM, Math.round(value * 10) / 10));
}

export function parseBookingServiceHub(row: unknown): BookingServiceHub | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const lat = Number(r.lat);
  const lng = Number(r.lng);
  const radius = clampHubRadiusKm(Number(r.radius_km));
  const name = String(r.name || '').trim();
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    return null;
  }
  return {
    id: String(r.id || ''),
    name: name.slice(0, 80),
    address: String(r.address || '').trim(),
    lat,
    lng,
    radius_km: radius,
    is_active: r.is_active !== false,
    sort_order: Number.isFinite(Number(r.sort_order)) ? Number(r.sort_order) : 0,
    customer_note: String(r.customer_note || '').trim().slice(0, MAX_CUSTOMER_NOTE_LEN),
    created_at: typeof r.created_at === 'string' ? r.created_at : undefined,
    updated_at: typeof r.updated_at === 'string' ? r.updated_at : undefined,
  };
}

export function matchPointToServiceHubs(
  lat: number,
  lng: number,
  hubs: BookingServiceHub[]
): HubMatchResult {
  const active = hubs.filter((h) => h.is_active);
  if (active.length === 0) return { ok: true, enforced: false };
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    return { ok: false, enforced: true, nearest: [] };
  }

  const ranked = active
    .map((hub) => ({
      hub,
      distanceKm: haversineKm(lat, lng, hub.lat, hub.lng),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const inside = ranked.find((row) => row.distanceKm <= row.hub.radius_km);
  if (inside) {
    return {
      ok: true,
      enforced: true,
      hub: inside.hub,
      distanceKm: inside.distanceKm,
    };
  }

  return { ok: false, enforced: true, nearest: ranked.slice(0, 3) };
}

export function formatHubsLabel(names: string[]): string {
  const clean = names.map((n) => String(n || '').trim()).filter(Boolean);
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean[0];
  const last = clean[clean.length - 1];
  return `${clean.slice(0, -1).join(', ')}, and ${last}`;
}

export function formatOutOfServiceAreaMessage(
  result: HubMatchResult,
  customMessage?: string | null
): string {
  if (result.ok) return '';
  const names = result.nearest.map((row) => row.hub.name).filter(Boolean);
  const hubsLabel = formatHubsLabel(names);
  const custom = String(customMessage || '').trim();
  if (custom) {
    return custom.replaceAll('{hubs}', hubsLabel || 'our service areas');
  }
  if (!hubsLabel) return DEFAULT_OUT_OF_AREA_MESSAGE;
  return `We will not be able to come here. We cover ${hubsLabel} — move the pin into that area, or call us.`;
}

export function hubCustomerNote(result: HubMatchResult): string {
  if (!result.ok || !result.enforced) return '';
  return String(result.hub.customer_note || '').trim();
}

export function invalidateBookingServiceHubsCache() {
  memoryHubs = null;
  memoryHubsAt = 0;
  memorySettings = null;
  memorySettingsAt = 0;
}

function clampOutOfAreaMessage(value: string | null | undefined): string {
  const trimmed = String(value || '').trim().slice(0, MAX_OUT_OF_AREA_MESSAGE_LEN);
  return trimmed || DEFAULT_OUT_OF_AREA_MESSAGE;
}

export async function fetchBookingHubSettings(opts?: {
  force?: boolean;
}): Promise<{ settings: BookingHubSettings; missingTable: boolean }> {
  if (!opts?.force && memorySettings && Date.now() - memorySettingsAt < MEMORY_TTL_MS) {
    return { settings: memorySettings, missingTable: false };
  }
  const { data, error } = await supabase
    .from(BOOKING_HUB_SETTINGS_TABLE)
    .select('out_of_area_message')
    .eq('id', 1)
    .maybeSingle();
  if (error) {
    return {
      settings: { out_of_area_message: DEFAULT_OUT_OF_AREA_MESSAGE },
      missingTable: isMissingTableError(error.message) || error.message.toLowerCase().includes('booking_service_hub_settings'),
    };
  }
  const settings = {
    out_of_area_message: clampOutOfAreaMessage(data?.out_of_area_message),
  };
  memorySettings = settings;
  memorySettingsAt = Date.now();
  return { settings, missingTable: false };
}

export async function updateBookingHubSettings(patch: {
  out_of_area_message: string;
}): Promise<{ settings: BookingHubSettings | null; error: string | null }> {
  const out_of_area_message = clampOutOfAreaMessage(patch.out_of_area_message);
  const { data, error } = await supabase
    .from(BOOKING_HUB_SETTINGS_TABLE)
    .update({ out_of_area_message, updated_at: new Date().toISOString() })
    .eq('id', 1)
    .select('out_of_area_message')
    .single();
  if (error) {
    return {
      settings: null,
      error: error.message.toLowerCase().includes('booking_service_hub_settings')
        ? 'Run scripts/add-booking-service-hub-messages.sql in Supabase first.'
        : error.message,
    };
  }
  const settings = { out_of_area_message: clampOutOfAreaMessage(data?.out_of_area_message) };
  memorySettings = settings;
  memorySettingsAt = Date.now();
  return { settings, error: null };
}

export async function fetchBookingServiceHubs(opts?: {
  includeInactive?: boolean;
  force?: boolean;
}): Promise<{
  hubs: BookingServiceHub[];
  settings: BookingHubSettings;
  error: string | null;
  missingTable: boolean;
  missingSettingsTable: boolean;
}> {
  const includeInactive = opts?.includeInactive === true;
  if (!includeInactive && !opts?.force && memoryHubs && Date.now() - memoryHubsAt < MEMORY_TTL_MS) {
    return {
      hubs: memoryHubs,
      settings: memorySettings || { out_of_area_message: DEFAULT_OUT_OF_AREA_MESSAGE },
      error: null,
      missingTable: false,
      missingSettingsTable: false,
    };
  }

  const runSelect = (columns: string) => {
    let query = supabase
      .from(BOOKING_SERVICE_HUBS_TABLE)
      .select(columns)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (!includeInactive) {
      query = query.eq('is_active', true);
    }
    return query;
  };

  let { data, error } = await runSelect(PUBLIC_COLUMNS);
  if (error && String(error.message || '').toLowerCase().includes('customer_note')) {
    const retry = await runSelect(PUBLIC_COLUMNS_LEGACY);
    data = retry.data;
    error = retry.error;
  }
  const settingsResult = await fetchBookingHubSettings({ force: opts?.force });
  if (error) {
    return {
      hubs: [],
      settings: settingsResult.settings,
      error: error.message,
      missingTable: isMissingTableError(error.message),
      missingSettingsTable: settingsResult.missingTable,
    };
  }

  const hubs = (data || []).map(parseBookingServiceHub).filter((h): h is BookingServiceHub => Boolean(h));
  if (!includeInactive) {
    memoryHubs = hubs;
    memoryHubsAt = Date.now();
  }
  return {
    hubs,
    settings: settingsResult.settings,
    error: null,
    missingTable: false,
    missingSettingsTable: settingsResult.missingTable,
  };
}

export async function createBookingServiceHub(input: {
  name: string;
  address?: string;
  lat: number;
  lng: number;
  radius_km?: number;
  is_active?: boolean;
  sort_order?: number;
  customer_note?: string;
}): Promise<{ hub: BookingServiceHub | null; error: string | null }> {
  const name = String(input.name || '').trim().slice(0, 80);
  if (!name) return { hub: null, error: 'Hub name is required' };
  const { data, error } = await supabase
    .from(BOOKING_SERVICE_HUBS_TABLE)
    .insert({
      name,
      address: String(input.address || '').trim().slice(0, 240),
      lat: input.lat,
      lng: input.lng,
      radius_km: clampHubRadiusKm(input.radius_km ?? DEFAULT_HUB_RADIUS_KM),
      is_active: input.is_active !== false,
      sort_order: input.sort_order ?? 0,
      customer_note: String(input.customer_note || '').trim().slice(0, MAX_CUSTOMER_NOTE_LEN),
    })
    .select(PUBLIC_COLUMNS)
    .single();
  if (error) {
    return {
      hub: null,
      error: isMissingTableError(error.message)
        ? 'Run scripts/add-booking-service-hubs.sql in Supabase first.'
        : error.message,
    };
  }
  invalidateBookingServiceHubsCache();
  return { hub: parseBookingServiceHub(data), error: null };
}

export async function updateBookingServiceHub(
  id: string,
  patch: Partial<
    Pick<BookingServiceHub, 'name' | 'address' | 'lat' | 'lng' | 'radius_km' | 'is_active' | 'sort_order' | 'customer_note'>
  >
): Promise<{ hub: BookingServiceHub | null; error: string | null }> {
  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) payload.name = String(patch.name).trim().slice(0, 80);
  if (patch.address !== undefined) payload.address = String(patch.address).trim().slice(0, 240);
  if (patch.lat !== undefined) payload.lat = patch.lat;
  if (patch.lng !== undefined) payload.lng = patch.lng;
  if (patch.radius_km !== undefined) payload.radius_km = clampHubRadiusKm(patch.radius_km);
  if (patch.is_active !== undefined) payload.is_active = patch.is_active;
  if (patch.sort_order !== undefined) payload.sort_order = patch.sort_order;
  if (patch.customer_note !== undefined) {
    payload.customer_note = String(patch.customer_note).trim().slice(0, MAX_CUSTOMER_NOTE_LEN);
  }
  const { data, error } = await supabase
    .from(BOOKING_SERVICE_HUBS_TABLE)
    .update(payload)
    .eq('id', id)
    .select(PUBLIC_COLUMNS)
    .single();
  if (error) return { hub: null, error: error.message };
  invalidateBookingServiceHubsCache();
  return { hub: parseBookingServiceHub(data), error: null };
}

export async function deleteBookingServiceHub(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from(BOOKING_SERVICE_HUBS_TABLE).delete().eq('id', id);
  if (error) return { error: error.message };
  invalidateBookingServiceHubsCache();
  return { error: null };
}
