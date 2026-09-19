import { supabase } from '@/lib/supabaseClient';
import { haversineKm } from '@/lib/maps';

export const BOOKING_SERVICE_HUBS_TABLE = 'booking_service_hubs';
export const BOOKING_HUB_SETTINGS_TABLE = 'booking_service_hub_settings';

export const DEFAULT_HUB_RADIUS_KM = 5;
export const MIN_HUB_RADIUS_KM = 0.5;
export const MAX_HUB_RADIUS_KM = 25;
export const DEFAULT_HUB_POLYGON_POINTS = 8;
export const MIN_HUB_POLYGON_POINTS = 3;
export const MAX_HUB_POLYGON_POINTS = 16;
export const MAX_CUSTOMER_NOTE_LEN = 240;
export const MAX_OUT_OF_AREA_MESSAGE_LEN = 320;
export const HUB_MATCH_SLACK_KM = 0.04;
export const DEFAULT_OUT_OF_AREA_MESSAGE =
  'We may not cover this area. Please call us if you need any help.';
export const DEFAULT_CALLBACK_MESSAGE =
  'We can come here, but not immediately. We’ll call you back to confirm the visit.';
export const DEFAULT_NO_SERVICE_MESSAGE =
  'We don’t serve this pocket right now. Please move the pin, or call us.';

export type HubLatLng = { lat: number; lng: number };
export type HubServiceKind = 'normal' | 'callback' | 'no_service';

export type BookingServiceHub = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  radius_km: number;
  polygon: HubLatLng[];
  service_kind: HubServiceKind;
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
  | {
      ok: true;
      enforced: true;
      hub: BookingServiceHub;
      distanceKm: number;
      kind: 'normal' | 'callback';
    }
  | {
      ok: false;
      enforced: true;
      reason: 'out_of_area' | 'no_service' | 'needs_pin';
      nearest: Array<{ hub: BookingServiceHub; distanceKm: number }>;
      hub?: BookingServiceHub;
    };

const PUBLIC_COLUMNS =
  'id,name,address,lat,lng,radius_km,polygon,service_kind,is_active,sort_order,customer_note,created_at,updated_at';
const PUBLIC_COLUMNS_NO_KIND =
  'id,name,address,lat,lng,radius_km,polygon,is_active,sort_order,customer_note,created_at,updated_at';
const PUBLIC_COLUMNS_NO_POLYGON =
  'id,name,address,lat,lng,radius_km,is_active,sort_order,customer_note,created_at,updated_at';
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

function isFinitePoint(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

export function parseHubPolygon(raw: unknown): HubLatLng[] {
  if (!Array.isArray(raw)) return [];
  const points: HubLatLng[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const lat = Number((row as { lat?: unknown }).lat);
    const lng = Number((row as { lng?: unknown }).lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    points.push({ lat, lng });
    if (points.length >= MAX_HUB_POLYGON_POINTS) break;
  }
  return points.length >= MIN_HUB_POLYGON_POINTS ? points : [];
}

export function circleToHubPolygon(
  lat: number,
  lng: number,
  radiusKm: number,
  count = DEFAULT_HUB_POLYGON_POINTS
): HubLatLng[] {
  const n = Math.min(
    MAX_HUB_POLYGON_POINTS,
    Math.max(MIN_HUB_POLYGON_POINTS, Math.round(count))
  );
  const radius = clampHubRadiusKm(radiusKm);
  const kmPerDegLat = 111.32;
  const kmPerDegLng = Math.max(0.2, 111.32 * Math.cos((lat * Math.PI) / 180));
  const rLat = radius / kmPerDegLat;
  const rLng = radius / kmPerDegLng;
  const points: HubLatLng[] = [];
  for (let i = 0; i < n; i += 1) {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    points.push({
      lat: lat + rLat * Math.cos(angle),
      lng: lng + rLng * Math.sin(angle),
    });
  }
  return points;
}

export function hubPolygonOrCircle(hub: {
  lat: number;
  lng: number;
  radius_km: number;
  polygon?: HubLatLng[] | null;
}): HubLatLng[] {
  const custom = parseHubPolygon(hub.polygon);
  if (custom.length >= MIN_HUB_POLYGON_POINTS) return custom;
  return circleToHubPolygon(hub.lat, hub.lng, hub.radius_km);
}

export function pointInHubPolygon(lat: number, lng: number, ring: HubLatLng[]): boolean {
  if (ring.length < MIN_HUB_POLYGON_POINTS) return false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    if (pointOnSegment(lat, lng, ring[j], ring[i])) return true;
  }
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const yi = ring[i].lat;
    const xi = ring[i].lng;
    const yj = ring[j].lat;
    const xj = ring[j].lng;
    const denom = yj - yi;
    if (denom === 0) continue;
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / denom + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointOnSegment(lat: number, lng: number, a: HubLatLng, b: HubLatLng): boolean {
  const cross = (lng - a.lng) * (b.lat - a.lat) - (lat - a.lat) * (b.lng - a.lng);
  if (Math.abs(cross) > 1e-10) return false;
  const dot = (lng - a.lng) * (b.lng - a.lng) + (lat - a.lat) * (b.lat - a.lat);
  if (dot < -1e-10) return false;
  const lenSq = (b.lng - a.lng) ** 2 + (b.lat - a.lat) ** 2;
  return dot <= lenSq + 1e-10;
}

function distanceToSegmentKm(lat: number, lng: number, a: HubLatLng, b: HubLatLng): number {
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-18) return haversineKm(lat, lng, a.lat, a.lng);
  const t = Math.max(0, Math.min(1, ((lng - a.lng) * dx + (lat - a.lat) * dy) / lenSq));
  return haversineKm(lat, lng, a.lat + t * dy, a.lng + t * dx);
}

function minDistanceKmToRing(lat: number, lng: number, ring: HubLatLng[]): number {
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    min = Math.min(min, distanceToSegmentKm(lat, lng, ring[j], ring[i]));
  }
  return min;
}

export function hubPolygonMetrics(points: HubLatLng[]): {
  lat: number;
  lng: number;
  radius_km: number;
} | null {
  const ring = parseHubPolygon(points);
  if (ring.length < MIN_HUB_POLYGON_POINTS) return null;
  const lat = ring.reduce((sum, p) => sum + p.lat, 0) / ring.length;
  const lng = ring.reduce((sum, p) => sum + p.lng, 0) / ring.length;
  let maxKm = MIN_HUB_RADIUS_KM;
  for (const p of ring) {
    maxKm = Math.max(maxKm, haversineKm(lat, lng, p.lat, p.lng));
  }
  return { lat, lng, radius_km: clampHubRadiusKm(maxKm) };
}

export function scaleHubPolygon(
  points: HubLatLng[],
  center: HubLatLng,
  fromRadiusKm: number,
  toRadiusKm: number
): HubLatLng[] {
  const from = Math.max(0.05, fromRadiusKm);
  const factor = clampHubRadiusKm(toRadiusKm) / from;
  return points.map((p) => ({
    lat: center.lat + (p.lat - center.lat) * factor,
    lng: center.lng + (p.lng - center.lng) * factor,
  }));
}

export function translateHubPolygon(
  points: HubLatLng[],
  from: HubLatLng,
  to: HubLatLng
): HubLatLng[] {
  const dLat = to.lat - from.lat;
  const dLng = to.lng - from.lng;
  return points.map((p) => ({ lat: p.lat + dLat, lng: p.lng + dLng }));
}

export function hubContainsPoint(
  hub: Pick<BookingServiceHub, 'lat' | 'lng' | 'radius_km' | 'polygon'>,
  lat: number,
  lng: number
): boolean {
  const ring = parseHubPolygon(hub.polygon);
  if (ring.length >= MIN_HUB_POLYGON_POINTS) {
    if (pointInHubPolygon(lat, lng, ring)) return true;
    return minDistanceKmToRing(lat, lng, ring) <= HUB_MATCH_SLACK_KM;
  }
  return haversineKm(lat, lng, hub.lat, hub.lng) <= hub.radius_km + HUB_MATCH_SLACK_KM;
}

export function parseHubServiceKind(raw: unknown): HubServiceKind {
  const value = String(raw || '').trim();
  if (value === 'callback' || value === 'no_service') return value;
  return 'normal';
}

export const HUB_KIND_OPTIONS: Array<{
  id: HubServiceKind;
  label: string;
  hint: string;
}> = [
  { id: 'normal', label: 'Normal', hint: 'Book as usual' },
  { id: 'callback', label: 'Call back', hint: 'We go, not immediately' },
  { id: 'no_service', label: 'No service', hint: 'Block this pocket' },
];

export function hubKindLabel(kind: HubServiceKind): string {
  if (kind === 'callback') return 'Call back';
  if (kind === 'no_service') return 'No service';
  return 'Normal';
}

export function hubKindMessagePlaceholder(kind: HubServiceKind): string {
  if (kind === 'callback') return DEFAULT_CALLBACK_MESSAGE;
  if (kind === 'no_service') return DEFAULT_NO_SERVICE_MESSAGE;
  return 'Optional note, e.g. we may be a bit late in this area.';
}

export function hubDisplayMessage(hub: Pick<BookingServiceHub, 'service_kind' | 'customer_note'>): string {
  const custom = String(hub.customer_note || '').trim();
  if (custom) return custom;
  if (hub.service_kind === 'callback') return DEFAULT_CALLBACK_MESSAGE;
  if (hub.service_kind === 'no_service') return DEFAULT_NO_SERVICE_MESSAGE;
  return '';
}

export function hubMapColors(
  kind: HubServiceKind,
  selected: boolean,
  active: boolean
): { fill: string; stroke: string } {
  if (kind === 'no_service') {
    return {
      fill: selected ? 'rgba(225, 29, 72, 0.30)' : 'rgba(225, 29, 72, 0.16)',
      stroke: selected ? '#e11d48' : '#be123c',
    };
  }
  if (kind === 'callback') {
    return {
      fill: selected ? 'rgba(217, 119, 6, 0.30)' : 'rgba(217, 119, 6, 0.16)',
      stroke: selected ? '#d97706' : '#b45309',
    };
  }
  if (!active) {
    return { fill: 'rgba(148, 163, 184, 0.18)', stroke: '#94a3b8' };
  }
  return {
    fill: selected ? 'rgba(2, 132, 199, 0.24)' : 'rgba(71, 85, 105, 0.28)',
    stroke: selected ? '#0284c7' : '#475569',
  };
}

export function parseBookingServiceHub(row: unknown): BookingServiceHub | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const lat = Number(r.lat);
  const lng = Number(r.lng);
  const radius = clampHubRadiusKm(Number(r.radius_km));
  const name = String(r.name || '').trim();
  if (!name || !isFinitePoint(lat, lng)) {
    return null;
  }
  return {
    id: String(r.id || ''),
    name: name.slice(0, 80),
    address: String(r.address || '').trim(),
    lat,
    lng,
    radius_km: radius,
    polygon: parseHubPolygon(r.polygon),
    service_kind: parseHubServiceKind(r.service_kind),
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
    return { ok: false, enforced: true, reason: 'needs_pin', nearest: [] };
  }

  const ranked = active
    .map((hub) => ({
      hub,
      distanceKm: haversineKm(lat, lng, hub.lat, hub.lng),
      inside: hubContainsPoint(hub, lat, lng),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const exclusion = ranked.find((row) => row.inside && row.hub.service_kind === 'no_service');
  if (exclusion) {
    return {
      ok: false,
      enforced: true,
      reason: 'no_service',
      hub: exclusion.hub,
      nearest: ranked.filter((row) => row.hub.service_kind !== 'no_service').slice(0, 3),
    };
  }

  const serving = ranked.filter((row) => row.hub.service_kind !== 'no_service');
  if (serving.length === 0) return { ok: true, enforced: false };

  const insideServing = serving.filter((row) => row.inside);
  const normal = insideServing.find((row) => row.hub.service_kind === 'normal');
  if (normal) {
    return {
      ok: true,
      enforced: true,
      hub: normal.hub,
      distanceKm: normal.distanceKm,
      kind: 'normal',
    };
  }
  const callback = insideServing.find((row) => row.hub.service_kind === 'callback');
  if (callback) {
    return {
      ok: true,
      enforced: true,
      hub: callback.hub,
      distanceKm: callback.distanceKm,
      kind: 'callback',
    };
  }

  return {
    ok: false,
    enforced: true,
    reason: 'out_of_area',
    nearest: serving.slice(0, 3),
  };
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
  if (result.reason === 'needs_pin') {
    return 'Please pin your location on the map so we can check coverage.';
  }
  if (result.reason === 'no_service') {
    return result.hub ? hubDisplayMessage(result.hub) : DEFAULT_NO_SERVICE_MESSAGE;
  }
  const names = result.nearest.map((row) => row.hub.name).filter(Boolean);
  const hubsLabel = formatHubsLabel(names);
  const custom = String(customMessage || '').trim();
  if (custom) {
    return custom.replaceAll('{hubs}', hubsLabel || 'our service areas');
  }
  if (!hubsLabel) return DEFAULT_OUT_OF_AREA_MESSAGE;
  return `We may not cover this area. We serve ${hubsLabel}. Please call us if you need any help.`;
}

export function hubCustomerNote(result: HubMatchResult): string {
  if (!result.ok || !result.enforced) return '';
  if (result.kind === 'callback') return hubDisplayMessage(result.hub);
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
  if (error && String(error.message || '').toLowerCase().includes('service_kind')) {
    const retry = await runSelect(PUBLIC_COLUMNS_NO_KIND);
    data = retry.data;
    error = retry.error;
  }
  if (error && String(error.message || '').toLowerCase().includes('polygon')) {
    const retry = await runSelect(PUBLIC_COLUMNS_NO_POLYGON);
    data = retry.data;
    error = retry.error;
  }
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
  polygon?: HubLatLng[];
  service_kind?: HubServiceKind;
  is_active?: boolean;
  sort_order?: number;
  customer_note?: string;
}): Promise<{ hub: BookingServiceHub | null; error: string | null }> {
  const name = String(input.name || '').trim().slice(0, 80);
  if (!name) return { hub: null, error: 'Hub name is required' };
  const polygon = parseHubPolygon(input.polygon);
  const payload: Record<string, unknown> = {
    name,
    address: String(input.address || '').trim().slice(0, 240),
    lat: input.lat,
    lng: input.lng,
    radius_km: clampHubRadiusKm(input.radius_km ?? DEFAULT_HUB_RADIUS_KM),
    is_active: input.is_active !== false,
    sort_order: input.sort_order ?? 0,
    customer_note: String(input.customer_note || '').trim().slice(0, MAX_CUSTOMER_NOTE_LEN),
    service_kind: parseHubServiceKind(input.service_kind),
  };
  if (polygon.length >= MIN_HUB_POLYGON_POINTS) payload.polygon = polygon;
  let { data, error } = await supabase
    .from(BOOKING_SERVICE_HUBS_TABLE)
    .insert(payload)
    .select(PUBLIC_COLUMNS)
    .single();
  if (error && String(error.message || '').toLowerCase().includes('service_kind')) {
    delete payload.service_kind;
    const retry = await supabase.from(BOOKING_SERVICE_HUBS_TABLE).insert(payload).select(PUBLIC_COLUMNS_NO_KIND).single();
    data = retry.data;
    error = retry.error;
  }
  if (error && String(error.message || '').toLowerCase().includes('polygon')) {
    delete payload.polygon;
    const retry = await supabase.from(BOOKING_SERVICE_HUBS_TABLE).insert(payload).select(PUBLIC_COLUMNS_NO_POLYGON).single();
    data = retry.data;
    error = retry.error;
  }
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
    Pick<
      BookingServiceHub,
      'name' | 'address' | 'lat' | 'lng' | 'radius_km' | 'polygon' | 'service_kind' | 'is_active' | 'sort_order' | 'customer_note'
    >
  >
): Promise<{ hub: BookingServiceHub | null; error: string | null }> {
  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) payload.name = String(patch.name).trim().slice(0, 80);
  if (patch.address !== undefined) payload.address = String(patch.address).trim().slice(0, 240);
  if (patch.lat !== undefined) payload.lat = patch.lat;
  if (patch.lng !== undefined) payload.lng = patch.lng;
  if (patch.radius_km !== undefined) payload.radius_km = clampHubRadiusKm(patch.radius_km);
  if (patch.polygon !== undefined) payload.polygon = parseHubPolygon(patch.polygon);
  if (patch.service_kind !== undefined) payload.service_kind = parseHubServiceKind(patch.service_kind);
  if (patch.is_active !== undefined) payload.is_active = patch.is_active;
  if (patch.sort_order !== undefined) payload.sort_order = patch.sort_order;
  if (patch.customer_note !== undefined) {
    payload.customer_note = String(patch.customer_note).trim().slice(0, MAX_CUSTOMER_NOTE_LEN);
  }
  let { data, error } = await supabase
    .from(BOOKING_SERVICE_HUBS_TABLE)
    .update(payload)
    .eq('id', id)
    .select(PUBLIC_COLUMNS)
    .single();
  if (error && payload.service_kind !== undefined && String(error.message || '').toLowerCase().includes('service_kind')) {
    delete payload.service_kind;
    const retry = await supabase
      .from(BOOKING_SERVICE_HUBS_TABLE)
      .update(payload)
      .eq('id', id)
      .select(PUBLIC_COLUMNS_NO_KIND)
      .single();
    data = retry.data;
    error = retry.error;
  }
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
