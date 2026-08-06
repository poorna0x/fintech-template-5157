/**
 * Admin "Nearby jobs" tool — find ongoing or follow-up jobs near a technician
 * origin (live GPS / last known pin / one of his job sites).
 *
 * Ongoing: that technician's assigned open jobs within radius.
 * Follow-up: any FOLLOW_UP job within radius (assignment not required).
 * Uses Haversine only (no Distance Matrix). Follow-ups use the existing
 * search_customers_near_point RPC to avoid pulling the full follow-up list.
 */
import { supabase } from '@/lib/supabase';
import { haversineDistanceMeters } from '@/lib/adminGoogleMapsDistance';
import { resolveJobLatLngFromRow, resolveJobDestinationCoordsSync } from '@/lib/jobLocationHelpers';
import { readLocationLatLng } from '@/lib/maps';
import { VISIT_ORDER_STATUSES } from '@/lib/adminVisitOrder';
import { getJobLocationLabelForWhatsApp } from '@/lib/customer-locations';

export type NearbyJobsMode = 'ongoing' | 'followup';

export type NearbyJobOriginKind = 'tech_location' | 'job';

export type NearbyOriginJobOption = {
  id: string;
  job_number?: string | null;
  status?: string | null;
  label: string;
};

export type NearbyJobResult = {
  id: string;
  job_number: string | null;
  status: string;
  distance_m: number;
  scheduled_date: string | null;
  follow_up_date: string | null;
  assigned_technician_id: string | null;
  customer_name: string;
  visible_address: string;
  lat: number;
  lng: number;
};

const ORIGIN_JOB_SELECT = [
  'id',
  'job_number',
  'status',
  'scheduled_date',
  'follow_up_date',
  'assigned_technician_id',
  'service_location',
  'service_address',
  'service_site',
  'customer:customers(id,full_name,visible_address,location,alternate_location,alternate_visible_address,alternate_address)',
].join(',');

const ONGOING_NEAR_SELECT = ORIGIN_JOB_SELECT;

const FOLLOW_UP_NEAR_SELECT = [
  'id',
  'job_number',
  'status',
  'scheduled_date',
  'follow_up_date',
  'assigned_technician_id',
  'customer_id',
  'service_location',
  'service_address',
  'service_site',
  'customer:customers(id,full_name,visible_address,location,alternate_location,alternate_visible_address,alternate_address)',
].join(',');

/** Preset radii in kilometers (0.5 = 500 m). */
export const NEARBY_RADIUS_PRESETS_KM = [0.2, 0.5, 1, 2, 3, 5, 10] as const;
export const DEFAULT_NEARBY_RADIUS_KM = 2;
export const MIN_NEARBY_RADIUS_KM = 0;
export const MAX_NEARBY_RADIUS_KM = 50;

export function clampNearbyRadiusKm(raw: number): number {
  if (!Number.isFinite(raw)) return DEFAULT_NEARBY_RADIUS_KM;
  // Keep up to 3 decimal places (≈1 m) without forcing integers
  const rounded = Math.round(raw * 1000) / 1000;
  return Math.min(Math.max(rounded, MIN_NEARBY_RADIUS_KM), MAX_NEARBY_RADIUS_KM);
}

export function nearbyRadiusKmToMeters(km: number): number {
  return clampNearbyRadiusKm(km) * 1000;
}

/** Label for a km radius input / preset (e.g. 0.5 → "0.5 km"). */
export function formatNearbyKmLabel(km: number): string {
  if (!Number.isFinite(km) || km < 0) return '';
  const rounded = Math.round(km * 1000) / 1000;
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace(/\.?0+$/, '');
  return `${text} km`;
}

/** Label for a measured distance in meters (results list). */
export function formatNearbyDistanceLabel(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(2)} km` : `${km.toFixed(1)} km`;
}

/** True while the user is mid-typing a decimal km value (e.g. "", ".", "0."). */
export function isNearbyKmDraft(raw: string): boolean {
  return raw === '' || raw === '.' || /^\d+\.$/.test(raw);
}

/** Parse a km text field; null if empty/incomplete draft. */
export function parseNearbyKmInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '.') return null;
  if (!/^\d*\.?\d*$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function customerLabel(job: Record<string, unknown>): { name: string; address: string } {
  const cust = (job.customer || {}) as Record<string, unknown>;
  const name = String(cust.full_name || cust.fullName || 'Customer').trim() || 'Customer';
  const address = getJobLocationLabelForWhatsApp(
    job as { service_site?: string; service_address?: any },
    cust
  )
    .replace(/[\s\u00a0\u2000-\u200B\uFEFF]+/g, ' ')
    .trim();
  return { name, address };
}

function toResult(
  job: Record<string, unknown>,
  distance_m: number,
  coords: { lat: number; lng: number }
): NearbyJobResult {
  const { name, address } = customerLabel(job);
  return {
    id: String(job.id),
    job_number: job.job_number != null ? String(job.job_number) : null,
    status: String(job.status || '').toUpperCase(),
    distance_m,
    scheduled_date: job.scheduled_date != null ? String(job.scheduled_date) : null,
    follow_up_date: job.follow_up_date != null ? String(job.follow_up_date) : null,
    assigned_technician_id:
      job.assigned_technician_id != null ? String(job.assigned_technician_id) : null,
    customer_name: name,
    visible_address: address,
    lat: coords.lat,
    lng: coords.lng,
  };
}

/** Live GPS row, else technicians.current_location. */
export async function resolveTechnicianCurrentCoords(
  technicianId: string
): Promise<{ lat: number; lng: number; source: 'live' | 'current_location'; updatedAt: string | null } | null> {
  const { data: live } = await supabase
    .from('technician_live_locations')
    .select('latitude,longitude,updated_at,fix_time')
    .eq('technician_id', technicianId)
    .maybeSingle();

  if (live?.latitude != null && live?.longitude != null) {
    const lat = Number(live.latitude);
    const lng = Number(live.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
      return {
        lat,
        lng,
        source: 'live',
        updatedAt: (live.fix_time as string | null) || (live.updated_at as string | null) || null,
      };
    }
  }

  const { data: tech } = await supabase
    .from('technicians')
    .select('current_location')
    .eq('id', technicianId)
    .maybeSingle();

  const fromCurrent = readLocationLatLng(tech?.current_location);
  if (fromCurrent) {
    const loc = tech?.current_location as Record<string, unknown> | null;
    const updatedAt =
      loc && typeof loc === 'object'
        ? String(loc.lastUpdated || loc.last_updated || loc.updated_at || '') || null
        : null;
    return { ...fromCurrent, source: 'current_location', updatedAt };
  }

  return null;
}

/**
 * Jobs the admin can pick as origin — this tech's ongoing + assigned follow-ups.
 * Includes location columns so we can resolve pins without a second fetch.
 */
export async function fetchTechnicianJobsForNearbyOrigin(
  technicianId: string
): Promise<{ data: NearbyOriginJobOption[]; rows: Record<string, unknown>[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('jobs')
    .select(ORIGIN_JOB_SELECT)
    .eq('assigned_technician_id', technicianId)
    .in('status', [...Array.from(VISIT_ORDER_STATUSES), 'FOLLOW_UP'])
    .order('created_at', { ascending: false })
    .limit(60);

  if (error) {
    return { data: [], rows: [], error: new Error(error.message) };
  }

  const rows = (data || []) as Record<string, unknown>[];
  const options: NearbyOriginJobOption[] = rows.map((job) => {
    const { name, address } = customerLabel(job);
    const jn = job.job_number != null ? String(job.job_number) : '';
    const status = String(job.status || '').toUpperCase();
    const base = jn ? `#${jn} · ${name}` : name;
    const withAddr = address ? `${base} (${address})` : base;
    return {
      id: String(job.id),
      job_number: jn || null,
      status,
      label: status === 'FOLLOW_UP' ? `${withAddr} · follow-up` : withAddr,
    };
  });

  return { data: options, rows, error: null };
}

async function scoreJobsNearOrigin(
  jobs: Record<string, unknown>[],
  origin: { lat: number; lng: number },
  radiusMeters: number,
  excludeJobId?: string | null
): Promise<NearbyJobResult[]> {
  const results: NearbyJobResult[] = [];

  for (const job of jobs) {
    const id = String(job.id);
    if (excludeJobId && id === excludeJobId) continue;

    let coords = resolveJobDestinationCoordsSync(job);
    if (!coords) {
      const resolved = await resolveJobLatLngFromRow(job);
      if (resolved) coords = { lat: resolved.lat, lng: resolved.lng };
    }
    if (!coords) continue;

    const distance_m = haversineDistanceMeters(origin, coords);
    if (distance_m > radiusMeters) continue;
    results.push(toResult(job, distance_m, coords));
  }

  results.sort((a, b) => a.distance_m - b.distance_m);
  return results;
}

async function searchOngoingNearby(opts: {
  origin: { lat: number; lng: number };
  radiusMeters: number;
  technicianId: string;
  excludeJobId?: string | null;
}): Promise<{ data: NearbyJobResult[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('jobs')
    .select(ONGOING_NEAR_SELECT)
    .eq('assigned_technician_id', opts.technicianId)
    .in('status', Array.from(VISIT_ORDER_STATUSES))
    .order('created_at', { ascending: false })
    .limit(60);

  if (error) {
    return { data: [], error: new Error(error.message) };
  }

  const scored = await scoreJobsNearOrigin(
    (data || []) as Record<string, unknown>[],
    opts.origin,
    opts.radiusMeters,
    opts.excludeJobId
  );
  return { data: scored, error: null };
}

async function searchFollowUpNearby(opts: {
  origin: { lat: number; lng: number };
  radiusMeters: number;
  excludeJobId?: string | null;
}): Promise<{ data: NearbyJobResult[]; error: Error | null }> {
  const radiusKm = opts.radiusMeters / 1000;

  const { data: nearCustomers, error: rpcError } = await supabase.rpc('search_customers_near_point', {
    p_lat: opts.origin.lat,
    p_lng: opts.origin.lng,
    p_radius_km: radiusKm,
    p_limit: 500,
  });

  if (rpcError) {
    const msg = rpcError.message || 'Nearby customer search failed';
    const lower = msg.toLowerCase();
    if (
      lower.includes('could not find the function') ||
      lower.includes('schema cache') ||
      lower.includes('pgrst202')
    ) {
      return {
        data: [],
        error: new Error(
          'Nearby search RPC is not installed. Run scripts/search-customers-near-point-rpc.sql in Supabase.'
        ),
      };
    }
    return { data: [], error: new Error(msg) };
  }

  const customerIds = [
    ...new Set(
      ((nearCustomers || []) as Array<{ customer_id?: string }>)
        .map((r) => r.customer_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  if (customerIds.length === 0) {
    return { data: [], error: null };
  }

  // Chunk to stay under PostgREST URL / .in() limits
  const chunkSize = 80;
  const jobs: Record<string, unknown>[] = [];
  for (let i = 0; i < customerIds.length; i += chunkSize) {
    const chunk = customerIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('jobs')
      .select(FOLLOW_UP_NEAR_SELECT)
      .eq('status', 'FOLLOW_UP')
      .in('customer_id', chunk)
      .order('follow_up_date', { ascending: true, nullsFirst: false })
      .limit(200);

    if (error) {
      return { data: [], error: new Error(error.message) };
    }
    jobs.push(...((data || []) as Record<string, unknown>[]));
  }

  const scored = await scoreJobsNearOrigin(jobs, opts.origin, opts.radiusMeters, opts.excludeJobId);
  return { data: scored, error: null };
}

export async function searchNearbyJobs(opts: {
  origin: { lat: number; lng: number };
  /** Radius in kilometers (0.5 = 500 m). */
  radiusKm: number;
  mode: NearbyJobsMode;
  technicianId: string;
  excludeJobId?: string | null;
}): Promise<{ data: NearbyJobResult[]; error: Error | null }> {
  const radiusMeters = nearbyRadiusKmToMeters(opts.radiusKm);
  if (opts.mode === 'ongoing') {
    return searchOngoingNearby({
      origin: opts.origin,
      radiusMeters,
      technicianId: opts.technicianId,
      excludeJobId: opts.excludeJobId,
    });
  }
  return searchFollowUpNearby({
    origin: opts.origin,
    radiusMeters,
    excludeJobId: opts.excludeJobId,
  });
}
