/**
 * Advanced customer search powering Settings → Advanced customer search dialog.
 *
 * All filtering happens through PostgREST — no extra RPCs. Job-side filters
 * (completed_by / lead_source / service_sub_type / payment range) collapse into
 * ONE jobs query; the resulting customer-id set is then intersected via
 * `customers.id IN (...)` to keep egress tight.
 */
// Use the lightweight auth client — this module talks to PostgREST directly via
// `supabase.from(...)` and never touches the `db` helper. Avoid pulling in the
// admin-data chunk just to type the client.
import { supabase } from './supabaseClient';
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
  sort?: 'last_service_desc' | 'created_desc' | 'name_asc';
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
};

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 200;
/** Cap for `id IN (uuid,...)` to keep PostgREST URLs sane. */
const MAX_ID_FILTER = 1000;
/** Job-side queries that build a customer-id set are capped to keep egress predictable. */
const MAX_JOB_LOOKUP_ROWS = 5000;

function tokenize(input: string): string[] {
  return input
    .split(/[,\n]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function billBounds(filters: AdvancedSearchFilters) {
  return {
    min: typeof filters.billMin === 'number' ? filters.billMin : null,
    max: typeof filters.billMax === 'number' ? filters.billMax : null,
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

  let q = supabase.from('jobs').select('customer_id').limit(MAX_JOB_LOOKUP_ROWS);
  if (filters.serviceSubType) q = q.eq('service_sub_type', filters.serviceSubType);
  if (filters.completedByTechnicianId) {
    q = q.eq('completed_by', filters.completedByTechnicianId).eq('status', 'COMPLETED');
  }
  if (filters.leadSource) {
    q = q.contains('requirements', JSON.stringify([{ lead_source: filters.leadSource }]));
  }
  if (billMin != null) q = q.gte('payment_amount', billMin);
  if (billMax != null) q = q.lte('payment_amount', billMax);
  if (applyJobBrand && jobBrandIfAny)
    q = q.ilike('brand', `%${escapeForLike(jobBrandIfAny)}%`);

  const { data, error } = await q;
  if (error) {
    console.warn('[advancedCustomerSearch] job-filter fetch failed', error);
    return new Set();
  }
  const ids = new Set<string>();
  for (const row of data ?? []) {
    const cid = (row as { customer_id?: string | null }).customer_id;
    if (cid) ids.add(cid);
  }
  return ids;
}

/** Customers (within base job set) whose profile brand matches — for brand "either" + technician, etc. */
async function fetchCustomerIdsWithProfileBrand(
  baseJobIds: Set<string>,
  brand: string
): Promise<Set<string>> {
  const ids = Array.from(baseJobIds).slice(0, MAX_ID_FILTER);
  if (ids.length === 0) return new Set();
  const e = escapeForLike(brand);
  const { data, error } = await supabase
    .from('customers')
    .select('id')
    .in('id', ids)
    .ilike('brand', `%${e}%`)
    .limit(MAX_ID_FILTER);
  if (error) {
    console.warn('[advancedCustomerSearch] customer-brand fetch failed', error);
    return new Set();
  }
  const out = new Set<string>();
  for (const row of data ?? []) {
    const id = (row as { id?: string | null }).id;
    if (id) out.add(id);
  }
  return out;
}

/**
 * Fill in `last_service_date` for rows where the customers row never had it written
 * (legacy data — only completions since the recent fix populate the column directly).
 *
 * Cheap: ONE jobs query for just the missing customer ids, aggregated client-side.
 */
async function enrichLastServiceDates(rows: AdvancedSearchRow[]): Promise<void> {
  const missingIds = rows
    .filter((r) => !r.last_service_date && r.id)
    .map((r) => r.id);
  if (missingIds.length === 0) return;

  const ids = missingIds.slice(0, MAX_ID_FILTER);
  const { data, error } = await supabase
    .from('jobs')
    .select('customer_id, completed_at, end_time')
    .eq('status', 'COMPLETED')
    .in('customer_id', ids)
    .limit(MAX_JOB_LOOKUP_ROWS);
  if (error || !data) return;

  const latestByCustomer = new Map<string, string>();
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
  for (const r of rows) {
    if (!r.last_service_date && r.id) {
      const ts = latestByCustomer.get(r.id);
      if (ts) {
        // Store as YYYY-MM-DD to match the column shape used by formatLastService.
        r.last_service_date = ts.slice(0, 10);
      }
    }
  }
}

/**
 * Fetch the set of customer ids with at least one active AMC contract.
 * Used for `hasAMC: 'yes' | 'no'`.
 */
async function fetchActiveAMCCustomerIds(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('amc_contracts')
    .select('customer_id')
    .eq('status', 'ACTIVE')
    .limit(MAX_JOB_LOOKUP_ROWS);
  if (error) {
    console.warn('[advancedCustomerSearch] active-AMC fetch failed', error);
    return new Set();
  }
  const ids = new Set<string>();
  for (const row of data ?? []) {
    const cid = (row as { customer_id?: string | null }).customer_id;
    if (cid) ids.add(cid);
  }
  return ids;
}

export async function advancedCustomerSearch(
  filters: AdvancedSearchFilters
): Promise<{ data: AdvancedSearchRow[]; error: { message: string } | null }> {
  try {
    const limit = Math.min(Math.max(filters.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const brandSource = filters.brandSource ?? 'either';

    // For 'jobs' / 'either' brand source, the brand match is folded into the
    // single combined jobs query so we don't fire two extra fetches.
    const brand = (filters.brandContains ?? '').trim();
    const jobBrandValue =
      brand && (brandSource === 'jobs' || brandSource === 'either') ? brand : null;
    const restrictive = hasRestrictiveJobFilter(filters);

    const needsAmcSet = filters.hasAMC === 'yes' || filters.hasAMC === 'no';

    // Brand "either" + technician (etc.): union job-brand matches with profile-brand
    // matches, but only within customers that satisfy the restrictive job filters.
    let jobIdSet: Set<string> | null;
    let activeAMCIds: Set<string>;
    if (brand && brandSource === 'either' && restrictive) {
      const [baseJobIds, jobBrandIds, amcIds] = await Promise.all([
        fetchCustomerIdsForJobFilters(filters, jobBrandValue, { applyJobBrand: false }),
        fetchCustomerIdsForJobFilters(filters, jobBrandValue),
        needsAmcSet ? fetchActiveAMCCustomerIds() : Promise.resolve(new Set<string>()),
      ]);
      const profileBrandIds =
        baseJobIds && baseJobIds.size > 0
          ? await fetchCustomerIdsWithProfileBrand(baseJobIds, brand)
          : new Set<string>();
      jobIdSet = unionSets(jobBrandIds, profileBrandIds);
      activeAMCIds = amcIds;
    } else {
      const [fetchedJobIds, amcIds] = await Promise.all([
        fetchCustomerIdsForJobFilters(filters, jobBrandValue),
        needsAmcSet ? fetchActiveAMCCustomerIds() : Promise.resolve(new Set<string>()),
      ]);
      jobIdSet = fetchedJobIds;
      activeAMCIds = amcIds;
    }

    let q = supabase.from('customers').select(SLIM_COLS);

    // Free text
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

    // Location: multi-token OR, each token matched across visible_address + address->>street/area/city
    const locTokens = tokenize(filters.locationContains ?? '');
    if (locTokens.length > 0) {
      const orParts = locTokens.flatMap((token) => {
        const e = escapeForLike(token);
        return [
          `visible_address.ilike.%${e}%`,
          `address->>street.ilike.%${e}%`,
          `address->>area.ilike.%${e}%`,
          `address->>city.ilike.%${e}%`,
        ];
      });
      q = q.or(orParts.join(','));
    }

    // Brand on customer record (profile); job-side brand is handled via jobIdSet.
    if (brand) {
      const e = escapeForLike(brand);
      if (brandSource === 'customer') {
        q = q.ilike('brand', `%${e}%`);
      } else if (brandSource === 'either' && !restrictive) {
        // either without technician/etc.: brand on customer OR id ∈ job-brand set
        const ids = jobIdSet ? Array.from(jobIdSet).slice(0, MAX_ID_FILTER) : [];
        const orParts: string[] = [`brand.ilike.%${e}%`];
        if (ids.length > 0) orParts.push(`id.in.(${ids.join(',')})`);
        q = q.or(orParts.join(','));
      }
      // 'jobs' / either+restrictive: enforced via jobIdSet `.in('id', …)` below.
    }

    // Intersect with job-side customer ids (technician, lead source, bills, job brand, …).
    const brandFoldedIntoOr = brandSource === 'either' && !!brand && !restrictive;
    if (jobIdSet && !brandFoldedIntoOr) {
      const ids = Array.from(jobIdSet).slice(0, MAX_ID_FILTER);
      if (ids.length === 0) return { data: [], error: null };
      q = q.in('id', ids);
    }

    if (filters.serviceType) q = q.eq('service_type', filters.serviceType);
    if (filters.status) q = q.eq('status', filters.status);

    if (filters.hasPrefilter === 'yes') q = q.eq('has_prefilter', true);
    else if (filters.hasPrefilter === 'no')
      q = q.or('has_prefilter.is.null,has_prefilter.eq.false');

    if (filters.hasGoogleReview === 'yes') q = q.eq('has_google_review', true);
    else if (filters.hasGoogleReview === 'no')
      q = q.or('has_google_review.is.null,has_google_review.eq.false');

    if (filters.hasAMC === 'yes') {
      const list = Array.from(activeAMCIds).slice(0, MAX_ID_FILTER);
      if (list.length === 0) return { data: [], error: null };
      q = q.in('id', list);
    } else if (filters.hasAMC === 'no') {
      const list = Array.from(activeAMCIds).slice(0, MAX_ID_FILTER);
      if (list.length > 0) {
        q = q.not('id', 'in', `(${list.join(',')})`);
      }
    }

    if (filters.lastServiceFrom) q = q.gte('last_service_date', filters.lastServiceFrom);
    if (filters.lastServiceTo) q = q.lte('last_service_date', filters.lastServiceTo);
    if (filters.createdSinceFrom) q = q.gte('customer_since', filters.createdSinceFrom);
    if (filters.createdSinceTo) q = q.lte('customer_since', filters.createdSinceTo);

    if (filters.sort === 'created_desc') {
      q = q.order('created_at', { ascending: false });
    } else if (filters.sort === 'name_asc') {
      q = q.order('full_name', { ascending: true });
    } else {
      q = q
        .order('last_service_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
    }

    q = q.limit(limit);

    const { data, error } = await q;
    if (error) return { data: [], error: { message: error.message } };
    const rows = (data || []) as unknown as AdvancedSearchRow[];

    // Backfill last_service_date for legacy customers whose column was never written.
    await enrichLastServiceDates(rows);

    // Server already sorted, but enrichment may have moved nulls into real dates —
    // re-sort client-side when the user picked "last service desc" so they see truth.
    if ((filters.sort ?? 'last_service_desc') === 'last_service_desc') {
      rows.sort((a, b) => {
        const at = a.last_service_date ? new Date(a.last_service_date).getTime() : 0;
        const bt = b.last_service_date ? new Date(b.last_service_date).getTime() : 0;
        return bt - at;
      });
    }

    return { data: rows, error: null };
  } catch (err) {
    return {
      data: [],
      error: { message: err instanceof Error ? err.message : 'Search failed' },
    };
  }
}
