/**
 * Advanced customer search powering Settings → Advanced customer search dialog.
 *
 * Job-side filters (completed_by / lead_source / service_sub_type / payment range)
 * collapse into ONE jobs query; the resulting customer-id set is then intersected
 * via `customers.id IN (...)` to keep egress tight.
 *
 * Nearby (Maps link + radius) uses admin-only RPC `search_customers_near_point`
 * (Haversine on stored JSONB coords) — no Distance Matrix, no full location dump.
 */
import { supabase } from './supabaseClient';
import { completedJobLeadSourceContainVariants } from './adminUtils';
import { escapeForLike, normalizePhoneForSearch } from './utils';

/**
 * Slim column set returned to the dialog. Trimmed aggressively to keep response
 * bytes low — fields used only for filtering (notes, customer_since) live
 * server-side and don't need to come back.
 */
const SLIM_COLS = [
  'id',
  'customer_id',
  'full_name',
  'phone',
  'email',
  'visible_address',
  'address',
  'service_type',
  'brand',
  'model',
  'last_service_date',
  'status',
  'has_prefilter',
  'has_google_review',
  'raw_water_tds',
  // gst_number omitted — search list is egress-tight; load full/document row when needed
].join(', ');

export type AdvancedSearchFilters = {
  /** Free-text matched against id / name / phone / email / notes. */
  freeText?: string;
  brandContains?: string;
  /** Where to look for brand matches. Default 'either'. */
  brandSource?: 'customer' | 'jobs' | 'either';
  /** Comma- or newline-separated tokens. Each token OR-matched across visible_address + address fields. */
  locationContains?: string;
  serviceType?: 'RO' | 'SOFTENER' | '';
  status?: 'ACTIVE' | 'INACTIVE' | 'BLOCKED' | '';
  hasPrefilter?: 'yes' | 'no' | '';
  hasGoogleReview?: 'yes' | 'no' | '';
  /** Active AMC contract check. 'yes' = has at least one active row. */
  hasAMC?: 'yes' | 'no' | '';
  /** YYYY-MM-DD inclusive */
  lastServiceFrom?: string;
  /** YYYY-MM-DD inclusive */
  lastServiceTo?: string;
  /** YYYY-MM-DD inclusive */
  createdSinceFrom?: string;
  /** YYYY-MM-DD inclusive */
  createdSinceTo?: string;
  /** Job-side: only customers who have a job with this sub-type. */
  serviceSubType?: string;
  /** Job-side: only customers who have a job with this lead_source (exact). */
  leadSource?: string;
  /** Job-side: only customers with a COMPLETED job whose completed_by is this technician id. */
  completedByTechnicianId?: string;
  /** Job-side: only customers whose past job's payment_amount is >= this. */
  billMin?: number | '';
  /** Job-side: only customers whose past job's payment_amount is <= this. */
  billMax?: number | '';
  /** Customer raw water TDS (ppm) >= this. */
  tdsMin?: number | '';
  /** Customer raw water TDS (ppm) <= this. */
  tdsMax?: number | '';
  /**
   * Nearby search center (resolved from a Google Maps link by the dialog).
   * When set with nearRadiusKm, restricts to customers whose map pin is within radius.
   */
  nearLat?: number | null;
  nearLng?: number | null;
  /** Radius in km around nearLat/nearLng. Clamped 0–50 km (RPC). */
  nearRadiusKm?: number | '';
  /** Raw paste / Maps URL kept for UI only (not sent to the RPC). */
  nearMapsLink?: string;
  sort?: 'last_service_desc' | 'created_desc' | 'name_asc' | 'distance_asc';
  limit?: number;
};

export type AdvancedSearchRow = {
  id: string;
  customer_id: string | null;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  visible_address: string | null;
  address: { street?: string; area?: string; city?: string } | null;
  service_type: string | null;
  brand: string | null;
  model: string | null;
  last_service_date: string | null;
  status: string | null;
  has_prefilter: boolean | null;
  has_google_review: boolean | null;
  raw_water_tds: number | null;
  /** Present when nearby filter was used (km from the Maps pin). */
  distance_km?: number | null;
  /** Which stored pin matched: primary | alternate. */
  matched_site?: 'primary' | 'alternate' | string | null;
};

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 200;
/** Keep PostgREST URLs short — large `in.(uuid,...)` lists cause 414 / network failures. */
const ID_IN_CHUNK = 100;
const FETCH_PAGE_SIZE = 1000;
const MAX_JOB_LOOKUP_ROWS = 20_000;
const MAX_LOCATION_TOKENS = 12;
const MAX_OR_PARTS = 48;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function postgrestEqValue(value: string): string {
  if (/^[a-zA-Z0-9_-]+$/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function formatSearchError(error: unknown): string {
  const msg =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: string }).message)
      : error instanceof Error
        ? error.message
        : 'Search failed';
  const lower = msg.toLowerCase();
  if (lower.includes('abort') || lower.includes('timeout')) {
    return 'Search timed out — try fewer filters or a smaller max results';
  }
  if (lower.includes('414') || lower.includes('uri') || lower.includes('too long')) {
    return 'Search query too large — try fewer location terms or narrower filters';
  }
  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return 'Network error — check your connection and try again';
  }
  return msg || 'Search failed';
}

function tokenize(input: string): string[] {
  return input
    .split(/[,\n]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, MAX_LOCATION_TOKENS);
}

function billBounds(filters: AdvancedSearchFilters) {
  return {
    min: typeof filters.billMin === 'number' ? filters.billMin : null,
    max: typeof filters.billMax === 'number' ? filters.billMax : null,
  };
}

function tdsBounds(filters: AdvancedSearchFilters) {
  return {
    min: typeof filters.tdsMin === 'number' ? filters.tdsMin : null,
    max: typeof filters.tdsMax === 'number' ? filters.tdsMax : null,
  };
}

/** Technician / lead / sub-type / bill — must not be bypassed by brand "either" OR logic. */
function hasRestrictiveJobFilter(filters: AdvancedSearchFilters): boolean {
  const { min, max } = billBounds(filters);
  return !!(
    filters.serviceSubType ||
    filters.leadSource ||
    filters.completedByTechnicianId ||
    min != null ||
    max != null
  );
}

function unionSets(...sets: Array<Set<string> | null | undefined>): Set<string> {
  const out = new Set<string>();
  for (const s of sets) {
    if (!s) continue;
    for (const id of s) out.add(id);
  }
  return out;
}

function sortRows(rows: AdvancedSearchRow[], sort: AdvancedSearchFilters['sort']): void {
  const mode = sort ?? 'last_service_desc';
  if (mode === 'distance_asc') {
    rows.sort((a, b) => {
      const ad = a.distance_km;
      const bd = b.distance_km;
      if (ad == null && bd == null) return (a.full_name ?? '').localeCompare(b.full_name ?? '');
      if (ad == null) return 1;
      if (bd == null) return -1;
      if (ad !== bd) return ad - bd;
      return (a.full_name ?? '').localeCompare(b.full_name ?? '');
    });
    return;
  }
  if (mode === 'created_desc') {
    rows.sort((a, b) => (b as { created_at?: string }).created_at?.localeCompare(
      (a as { created_at?: string }).created_at ?? ''
    ) ?? 0);
    return;
  }
  if (mode === 'name_asc') {
    rows.sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'en', { sensitivity: 'base' }));
    return;
  }
  rows.sort((a, b) => {
    const at = a.last_service_date ? new Date(a.last_service_date).getTime() : 0;
    const bt = b.last_service_date ? new Date(b.last_service_date).getTime() : 0;
    return bt - at;
  });
}

function nearBounds(filters: AdvancedSearchFilters): {
  lat: number;
  lng: number;
  radiusKm: number;
} | null {
  const lat = filters.nearLat;
  const lng = filters.nearLng;
  const km =
    typeof filters.nearRadiusKm === 'number' && Number.isFinite(filters.nearRadiusKm)
      ? filters.nearRadiusKm
      : null;
  if (
    lat == null ||
    lng == null ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    km == null ||
    km <= 0
  ) {
    return null;
  }
  // 0–50 km (matches RPC clamp)
  const radiusKm = Math.min(Math.max(km, 0), 50);
  return { lat, lng, radiusKm };
}

/**
 * Admin RPC: customers within radius of a Maps pin. Returns id → distance map.
 * Empty map = none in range. null = RPC unavailable / auth error (caller surfaces message).
 */
async function fetchNearbyCustomerDistances(
  lat: number,
  lng: number,
  radiusKm: number,
  limit: number
): Promise<
  | { ok: true; byId: Map<string, { distance_km: number; matched_site: string | null }> }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc('search_customers_near_point', {
    p_lat: lat,
    p_lng: lng,
    p_radius_km: radiusKm,
    p_limit: limit,
  });

  if (error) {
    const msg = error.message || 'Nearby search failed';
    const lower = msg.toLowerCase();
    if (
      lower.includes('could not find the function') ||
      lower.includes('schema cache') ||
      lower.includes('pgrst202') ||
      lower.includes('404')
    ) {
      return {
        ok: false,
        error:
          'Nearby search is not set up yet — run scripts/search-customers-near-point-rpc.sql in Supabase SQL Editor, then try again.',
      };
    }
    if (lower.includes('42501') || lower.includes('insufficient') || lower.includes('not authorized')) {
      return { ok: false, error: 'Nearby search requires an admin account' };
    }
    return { ok: false, error: formatSearchError(error) };
  }

  const byId = new Map<string, { distance_km: number; matched_site: string | null }>();
  for (const row of (data ?? []) as Array<{
    customer_id?: string;
    distance_km?: number | string | null;
    matched_site?: string | null;
  }>) {
    const id = row.customer_id;
    if (!id) continue;
    const dist = typeof row.distance_km === 'number' ? row.distance_km : Number(row.distance_km);
    if (!Number.isFinite(dist)) continue;
    const existing = byId.get(id);
    if (!existing || dist < existing.distance_km) {
      byId.set(id, {
        distance_km: dist,
        matched_site: row.matched_site ?? null,
      });
    }
  }
  return { ok: true, byId };
}

function intersectIdLists(a: string[] | null, b: string[]): string[] {
  if (!a) return b;
  if (a.length === 0 || b.length === 0) return [];
  const setB = new Set(b);
  return a.filter((id) => setB.has(id));
}

function applyLeadSourceJobFilter(q: ReturnType<typeof supabase.from>, leadSource: string) {
  const variants = completedJobLeadSourceContainVariants(leadSource);
  if (variants.length === 0) return q;
  if (variants.length === 1) {
    const v = variants[0];
    return q.or(
      `lead_source.eq.${postgrestEqValue(v)},requirements.cs.${JSON.stringify([{ lead_source: v }])}`
    );
  }
  const orParts = variants.flatMap((v) => [
    `lead_source.eq.${postgrestEqValue(v)}`,
    `requirements.cs.${JSON.stringify([{ lead_source: v }])}`,
  ]);
  return q.or(orParts.join(','));
}

async function paginateJobCustomerIds(
  build: (from: number, to: number) => ReturnType<ReturnType<typeof supabase.from>['select']>
): Promise<{ ids: Set<string>; error: unknown | null }> {
  const ids = new Set<string>();
  let from = 0;
  while (from < MAX_JOB_LOOKUP_ROWS) {
    const to = from + FETCH_PAGE_SIZE - 1;
    const { data, error } = await build(from, to);
    if (error) return { ids: new Set(), error };
    const page = data ?? [];
    for (const row of page) {
      const cid = (row as { customer_id?: string | null }).customer_id;
      if (cid) ids.add(cid);
    }
    if (page.length < FETCH_PAGE_SIZE) break;
    from += FETCH_PAGE_SIZE;
  }
  return { ids, error: null };
}

/**
 * Fetch customer ids that match ALL provided job-side filters (single query).
 * Returns null if no job-side filter is active (caller skips the constraint).
 */
async function fetchCustomerIdsForJobFilters(
  filters: AdvancedSearchFilters,
  jobBrandIfAny: string | null,
  options?: { applyJobBrand?: boolean }
): Promise<Set<string> | null> {
  const { min: billMin, max: billMax } = billBounds(filters);
  const applyJobBrand = options?.applyJobBrand !== false && !!jobBrandIfAny;
  const hasJobFilter =
    !!filters.serviceSubType ||
    !!filters.leadSource ||
    !!filters.completedByTechnicianId ||
    billMin != null ||
    billMax != null ||
    applyJobBrand;
  if (!hasJobFilter) return null;

  const { ids, error } = await paginateJobCustomerIds((from, to) => {
    let q = supabase.from('jobs').select('customer_id').range(from, to);
    if (filters.serviceSubType) q = q.eq('service_sub_type', filters.serviceSubType);
    if (filters.completedByTechnicianId) {
      q = q.eq('completed_by', filters.completedByTechnicianId).eq('status', 'COMPLETED');
    }
    if (filters.leadSource) q = applyLeadSourceJobFilter(q, filters.leadSource);
    if (billMin != null) q = q.gte('payment_amount', billMin);
    if (billMax != null) q = q.lte('payment_amount', billMax);
    if (applyJobBrand && jobBrandIfAny) q = q.ilike('brand', `%${escapeForLike(jobBrandIfAny)}%`);
    return q;
  });

  if (error) {
    console.warn('[advancedCustomerSearch] job-filter fetch failed', error);
    return new Set();
  }
  return ids;
}

/** Customers (within base job set) whose profile brand matches — for brand "either" + technician, etc. */
async function fetchCustomerIdsWithProfileBrand(
  baseJobIds: Set<string>,
  brand: string
): Promise<Set<string>> {
  const ids = Array.from(baseJobIds);
  if (ids.length === 0) return new Set();
  const e = escapeForLike(brand);
  const out = new Set<string>();
  for (const chunk of chunkArray(ids, ID_IN_CHUNK)) {
    const { data, error } = await supabase
      .from('customers')
      .select('id')
      .in('id', chunk)
      .ilike('brand', `%${e}%`)
      .limit(ID_IN_CHUNK);
    if (error) {
      console.warn('[advancedCustomerSearch] customer-brand fetch failed', error);
      return new Set();
    }
    for (const row of data ?? []) {
      const id = (row as { id?: string | null }).id;
      if (id) out.add(id);
    }
  }
  return out;
}

/**
 * Fill in `last_service_date` for rows where the customers row never had it written
 * (legacy data — only completions since the recent fix populate the column directly).
 */
async function enrichLastServiceDates(rows: AdvancedSearchRow[]): Promise<void> {
  const missingIds = rows.filter((r) => !r.last_service_date && r.id).map((r) => r.id);
  if (missingIds.length === 0) return;

  const latestByCustomer = new Map<string, string>();
  for (const chunk of chunkArray(missingIds, ID_IN_CHUNK)) {
    const { data, error } = await supabase
      .from('jobs')
      .select('customer_id, completed_at, end_time')
      .eq('status', 'COMPLETED')
      .in('customer_id', chunk)
      .limit(FETCH_PAGE_SIZE);
    if (error || !data) continue;

    for (const row of data as Array<{
      customer_id: string;
      completed_at: string | null;
      end_time: string | null;
    }>) {
      const cid = row.customer_id;
      const ts = row.completed_at || row.end_time;
      if (!cid || !ts) continue;
      const existing = latestByCustomer.get(cid);
      if (!existing || new Date(ts).getTime() > new Date(existing).getTime()) {
        latestByCustomer.set(cid, ts);
      }
    }
  }

  for (const r of rows) {
    if (!r.last_service_date && r.id) {
      const ts = latestByCustomer.get(r.id);
      if (ts) r.last_service_date = ts.slice(0, 10);
    }
  }
}

/** Fetch the set of customer ids with at least one active AMC contract. */
async function fetchActiveAMCCustomerIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  let from = 0;
  while (from < MAX_JOB_LOOKUP_ROWS) {
    const to = from + FETCH_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('amc_contracts')
      .select('customer_id')
      .eq('status', 'ACTIVE')
      .range(from, to);
    if (error) {
      console.warn('[advancedCustomerSearch] active-AMC fetch failed', error);
      return new Set();
    }
    const page = data ?? [];
    for (const row of page) {
      const cid = (row as { customer_id?: string | null }).customer_id;
      if (cid) ids.add(cid);
    }
    if (page.length < FETCH_PAGE_SIZE) break;
    from += FETCH_PAGE_SIZE;
  }
  return ids;
}

type CustomerQueryOptions = {
  filters: AdvancedSearchFilters;
  brand: string;
  brandSource: 'customer' | 'jobs' | 'either';
  restrictive: boolean;
  jobIdSet: Set<string> | null;
  activeAMCIds: Set<string>;
  /** When set, restrict to these customer ids (already intersected with job filters). */
  restrictToIds: string[] | null;
  /** Brand-either without restrictive: also match profile brand (second query path). */
  brandProfileMatch?: boolean;
  limit: number;
};

function applySharedCustomerFilters(q: ReturnType<typeof supabase.from>, opts: CustomerQueryOptions) {
  const { filters } = opts;

  const free = (filters.freeText ?? '').trim();
  if (free) {
    const e = escapeForLike(free);
    const orParts = [
      `customer_id.ilike.%${e}%`,
      `full_name.ilike.%${e}%`,
      `phone.ilike.%${e}%`,
      `alternate_phone.ilike.%${e}%`,
      `email.ilike.%${e}%`,
      `notes.ilike.%${e}%`,
    ];
    const norm = normalizePhoneForSearch(free);
    if (norm.length >= 10) {
      orParts.push(`phone.ilike.%${norm}%`, `alternate_phone.ilike.%${norm}%`);
    }
    q = q.or(orParts.join(','));
  }

  const locTokens = tokenize(filters.locationContains ?? '');
  if (locTokens.length > 0) {
    const orParts = locTokens.flatMap((token) => {
      const tokenE = escapeForLike(token);
      return [
        `visible_address.ilike.%${tokenE}%`,
        `address->>street.ilike.%${tokenE}%`,
        `address->>area.ilike.%${tokenE}%`,
        `address->>city.ilike.%${tokenE}%`,
      ];
    });
    if (orParts.length > MAX_OR_PARTS) {
      throw new Error(
        `Too many location terms (${locTokens.length}) — use at most ${MAX_LOCATION_TOKENS} areas`
      );
    }
    q = q.or(orParts.join(','));
  }

  if (opts.brandProfileMatch && opts.brand) {
    q = q.ilike('brand', `%${escapeForLike(opts.brand)}%`);
  } else if (opts.brand && opts.brandSource === 'customer') {
    q = q.ilike('brand', `%${escapeForLike(opts.brand)}%`);
  }

  if (filters.serviceType) q = q.eq('service_type', filters.serviceType);
  if (filters.status) q = q.eq('status', filters.status);

  if (filters.hasPrefilter === 'yes') q = q.eq('has_prefilter', true);
  else if (filters.hasPrefilter === 'no') q = q.or('has_prefilter.is.null,has_prefilter.eq.false');

  if (filters.hasGoogleReview === 'yes') q = q.eq('has_google_review', true);
  else if (filters.hasGoogleReview === 'no')
    q = q.or('has_google_review.is.null,has_google_review.eq.false');

  if (filters.hasAMC === 'yes' && opts.activeAMCIds.size <= ID_IN_CHUNK) {
    const list = Array.from(opts.activeAMCIds);
    if (list.length === 0) return null;
    q = q.in('id', list);
  }

  if (filters.lastServiceFrom) q = q.gte('last_service_date', filters.lastServiceFrom);
  if (filters.lastServiceTo) q = q.lte('last_service_date', filters.lastServiceTo);
  if (filters.createdSinceFrom) q = q.gte('customer_since', filters.createdSinceFrom);
  if (filters.createdSinceTo) q = q.lte('customer_since', filters.createdSinceTo);

  const { min: tdsMin, max: tdsMax } = tdsBounds(filters);
  if (tdsMin != null) q = q.gte('raw_water_tds', tdsMin);
  if (tdsMax != null) q = q.lte('raw_water_tds', tdsMax);

  if (filters.sort === 'created_desc') {
    q = q.order('created_at', { ascending: false });
  } else if (filters.sort === 'name_asc') {
    q = q.order('full_name', { ascending: true });
  } else {
    q = q
      .order('last_service_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
  }

  return q;
}

async function runCustomerQuery(opts: CustomerQueryOptions): Promise<{
  rows: AdvancedSearchRow[];
  error: { message: string } | null;
}> {
  const { filters, limit, restrictToIds } = opts;
  const amcExcludeClientSide =
    filters.hasAMC === 'no' && opts.activeAMCIds.size > ID_IN_CHUNK;
  const amcIncludeClientSide =
    filters.hasAMC === 'yes' && opts.activeAMCIds.size > ID_IN_CHUNK;
  const fetchLimit =
    amcExcludeClientSide || amcIncludeClientSide
      ? Math.min(Math.max(limit * 3, limit), MAX_LIMIT)
      : limit;

  const runSingle = async (idChunk: string[] | null) => {
    let q = supabase.from('customers').select(SLIM_COLS);
    const built = applySharedCustomerFilters(q, opts);
    if (built === null) return { data: [] as AdvancedSearchRow[], error: null };
    q = built;
    if (idChunk && idChunk.length > 0) q = q.in('id', idChunk);
    q = q.limit(fetchLimit);
    return q;
  };

  let merged = new Map<string, AdvancedSearchRow>();

  if (restrictToIds && restrictToIds.length > 0) {
    for (const chunk of chunkArray(restrictToIds, ID_IN_CHUNK)) {
      const { data, error } = await runSingle(chunk);
      if (error) return { rows: [], error: { message: formatSearchError(error) } };
      for (const row of (data ?? []) as AdvancedSearchRow[]) merged.set(row.id, row);
    }
  } else if (restrictToIds && restrictToIds.length === 0) {
    return { rows: [], error: null };
  } else {
    const { data, error } = await runSingle(null);
    if (error) return { rows: [], error: { message: formatSearchError(error) } };
    for (const row of (data ?? []) as AdvancedSearchRow[]) merged.set(row.id, row);
  }

  let rows = Array.from(merged.values());

  if (filters.hasAMC === 'no') {
    rows = rows.filter((r) => !opts.activeAMCIds.has(r.id));
  } else if (amcIncludeClientSide) {
    rows = rows.filter((r) => opts.activeAMCIds.has(r.id));
  }

  sortRows(rows, filters.sort);
  return { rows: rows.slice(0, limit), error: null };
}

export async function advancedCustomerSearch(
  filters: AdvancedSearchFilters
): Promise<{ data: AdvancedSearchRow[]; error: { message: string } | null }> {
  try {
    const limit = Math.min(Math.max(filters.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const brandSource = filters.brandSource ?? 'either';
    const brand = (filters.brandContains ?? '').trim();
    const jobBrandValue =
      brand && (brandSource === 'jobs' || brandSource === 'either') ? brand : null;
    const restrictive = hasRestrictiveJobFilter(filters);
    const needsAmcSet = filters.hasAMC === 'yes' || filters.hasAMC === 'no';
    const near = nearBounds(filters);

    let jobIdSet: Set<string> | null;
    let activeAMCIds: Set<string>;
    let nearbyById: Map<string, { distance_km: number; matched_site: string | null }> | null =
      null;

    const nearbyPromise = near
      ? fetchNearbyCustomerDistances(near.lat, near.lng, near.radiusKm, MAX_LIMIT)
      : Promise.resolve(null);

    if (brand && brandSource === 'either' && restrictive) {
      const [baseJobIds, jobBrandIds, amcIds, nearby] = await Promise.all([
        fetchCustomerIdsForJobFilters(filters, jobBrandValue, { applyJobBrand: false }),
        fetchCustomerIdsForJobFilters(filters, jobBrandValue),
        needsAmcSet ? fetchActiveAMCCustomerIds() : Promise.resolve(new Set<string>()),
        nearbyPromise,
      ]);
      if (nearby) {
        if (!nearby.ok) return { data: [], error: { message: nearby.error } };
        nearbyById = nearby.byId;
        if (nearbyById.size === 0) return { data: [], error: null };
      }
      const profileBrandIds =
        baseJobIds && baseJobIds.size > 0
          ? await fetchCustomerIdsWithProfileBrand(baseJobIds, brand)
          : new Set<string>();
      jobIdSet = unionSets(jobBrandIds, profileBrandIds);
      activeAMCIds = amcIds;
    } else {
      const [fetchedJobIds, amcIds, nearby] = await Promise.all([
        fetchCustomerIdsForJobFilters(filters, jobBrandValue),
        needsAmcSet ? fetchActiveAMCCustomerIds() : Promise.resolve(new Set<string>()),
        nearbyPromise,
      ]);
      if (nearby) {
        if (!nearby.ok) return { data: [], error: { message: nearby.error } };
        nearbyById = nearby.byId;
        if (nearbyById.size === 0) return { data: [], error: null };
      }
      jobIdSet = fetchedJobIds;
      activeAMCIds = amcIds;
    }

    if (filters.hasAMC === 'yes' && activeAMCIds.size === 0) {
      return { data: [], error: null };
    }

    const brandFoldedIntoOr = brandSource === 'either' && !!brand && !restrictive;
    let restrictFromJobs =
      jobIdSet && !brandFoldedIntoOr ? Array.from(jobIdSet) : null;

    if (nearbyById) {
      restrictFromJobs = intersectIdLists(restrictFromJobs, Array.from(nearbyById.keys()));
    }

    if (restrictFromJobs && restrictFromJobs.length === 0) {
      return { data: [], error: null };
    }

    const effectiveSort: AdvancedSearchFilters['sort'] =
      filters.sort ?? (nearbyById ? 'distance_asc' : 'last_service_desc');

    const baseOpts: CustomerQueryOptions = {
      filters: { ...filters, sort: effectiveSort === 'distance_asc' ? 'name_asc' : effectiveSort },
      brand,
      brandSource,
      restrictive,
      jobIdSet,
      activeAMCIds,
      restrictToIds: restrictFromJobs,
      limit,
    };

    let allRows: AdvancedSearchRow[] = [];

    if (brandFoldedIntoOr && brand) {
      const jobIds = jobIdSet ? Array.from(jobIdSet) : [];
      const restrictProfile = nearbyById
        ? intersectIdLists(null, Array.from(nearbyById.keys()))
        : null;
      const restrictJobBrand = nearbyById
        ? intersectIdLists(jobIds.length > 0 ? jobIds : null, Array.from(nearbyById.keys()))
        : jobIds.length > 0
          ? jobIds
          : [];
      const [profileResult, jobBrandResult] = await Promise.all([
        runCustomerQuery({
          ...baseOpts,
          restrictToIds: restrictProfile,
          brandProfileMatch: true,
        }),
        restrictJobBrand && restrictJobBrand.length > 0
          ? runCustomerQuery({
              ...baseOpts,
              restrictToIds: restrictJobBrand,
              brandProfileMatch: false,
            })
          : Promise.resolve({ rows: [] as AdvancedSearchRow[], error: null }),
      ]);
      if (profileResult.error) return { data: [], error: profileResult.error };
      if (jobBrandResult.error) return { data: [], error: jobBrandResult.error };
      const merged = new Map<string, AdvancedSearchRow>();
      for (const row of [...profileResult.rows, ...jobBrandResult.rows]) merged.set(row.id, row);
      allRows = Array.from(merged.values());
    } else {
      const result = await runCustomerQuery(baseOpts);
      if (result.error) return { data: [], error: result.error };
      allRows = result.rows;
    }

    if (nearbyById) {
      for (const row of allRows) {
        const nearHit = nearbyById.get(row.id);
        if (nearHit) {
          row.distance_km = nearHit.distance_km;
          row.matched_site = nearHit.matched_site;
        }
      }
    }

    await enrichLastServiceDates(allRows);
    sortRows(allRows, effectiveSort);
    allRows = allRows.slice(0, limit);

    return { data: allRows, error: null };
  } catch (err) {
    return {
      data: [],
      error: { message: formatSearchError(err) },
    };
  }
}
