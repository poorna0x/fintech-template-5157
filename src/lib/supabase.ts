import type { SupabaseClient } from '@supabase/supabase-js';
import { Database, ServiceReminderStatus, Reminder } from '@/types';
import { supabase as supabaseAuthClient } from './supabaseClient';
import { escapeForLike, normalizePhoneForSearch } from './utils';
import { PENDING_PAYMENT_REMINDER_TITLE } from './pendingPaymentReminder';
import { cacheGet, cacheSet, cacheInvalidate } from './supabaseQueryCache';
import { isMissingServiceBrandColumnError } from './amc-brand';
import {
  isMissingDualSiteColumnError,
  omitDualSiteCustomerCols,
  stripDualSiteCustomerFields,
  stripDualSiteJobFields,
} from './dual-site-columns';
import {
  isMissingVisitOrderColumnError,
  markVisitOrderColumnMissing,
  resolveJobSelect,
} from './visit-order-columns';
import {
  normalizeAmcAgreementNumber,
  parseAmcAgreementNumberFromAdditionalInfo,
  amcCreatedOnIstDay,
} from './amc-agreement-number';
import type { PublicSiteKey } from './websiteSiteKey';
import {
  applySentEmailLogFilters,
  buildSentEmailLogRpcArgs,
  resolveSentEmailLogDateRange,
  SENT_EMAIL_LOG_LIST_COLUMNS,
  type SentEmailLogQueryFilters,
} from './sent-email-log-filters';
import { buildCompletedJobsDateOrFilter } from './jobAnalytics';

export { supabaseAuthClient as supabase };
export { generateJobNumber } from './jobNumber';

/** Typed client for admin/technician data layer (admin-data chunk). */
const supabase = supabaseAuthClient as SupabaseClient<Database>;

/**
 * Set once if the optional `get_admin_job_counts` RPC is not present in the DB
 * (e.g. before the SQL function is applied). When true, getCounts skips the RPC
 * attempt and goes straight to the 4-query fallback to avoid a wasted round-trip.
 */
let adminJobCountsRpcMissing = false;

/** Explicit job columns for ongoing admin list + technician job list (no before/after/images — use getPhotoFieldsForJobIds). */
const JOB_SELECT_ONGOING_AND_TECH = [
  'id',
  'job_number',
  'customer_id',
  'service_type',
  'service_sub_type',
  'service_brand',
  'brand',
  'model',
  'status',
  'priority',
  'scheduled_date',
  'scheduled_time_slot',
  'created_at',
  'updated_at',
  'completed_at',
  'end_time',
  'denied_at',
  'denial_reason',
  'denied_by',
  'assigned_technician_id',
  'visit_order',
  'team_members',
  'follow_up_date',
  'follow_up_time',
  'follow_up_notes',
  'follow_up_scheduled_by',
  'follow_up_scheduled_at',
  'completed_by',
  'payment_amount',
  'actual_cost',
  'estimated_cost',
  'estimated_duration',
  'payment_method',
  'service_address',
  'service_location',
  'service_site',
  'description',
  'assigned_by',
  'assigned_date',
  'completion_notes',
  'requirements',
  'start_time',
  'actual_duration',
  'payment_status',
  'lead_cost',
  'parts_cost_total',
].join(',');

/** Job list select — strips `visit_order` if the DB column is not migrated yet. */
function jobSelectOngoingAndTech(): string {
  return resolveJobSelect(JOB_SELECT_ONGOING_AND_TECH);
}

/** Large JSON arrays — omitted from `JOB_SELECT_ONGOING_AND_TECH`; batch-fetch when UI needs thumbnails. */
const JOB_PHOTO_ARRAY_COLUMNS = 'before_photos,after_photos,images';

function mergeJobPhotoFieldsIntoRows<T extends { id: string }>(rows: T[], photoRows: Record<string, unknown>[] | null | undefined): T[] {
  if (!rows.length || !photoRows?.length) return rows;
  const byId = new Map(photoRows.map((r: any) => [r.id, r]));
  return rows.map((j) => {
    const p = byId.get(j.id) as any;
    if (!p) return j;
    return {
      ...j,
      before_photos: p.before_photos,
      after_photos: p.after_photos,
      images: p.images,
    };
  });
}

/** Customer embed for technician job list (maps/cards); omit notes/history to cut egress vs customers(*). */
const CUSTOMER_EMBED_FOR_TECH_JOBS = [
  'id',
  'customer_id',
  'full_name',
  'phone',
  'alternate_phone',
  'email',
  'visible_address',
  'alternate_visible_address',
  'address',
  'alternate_address',
  'location',
  'alternate_location',
  'service_type',
  'brand',
  'model',
  'last_service_date',
  'has_prefilter',
  'has_google_review',
  'customer_tier',
  'raw_water_tds',
  // gst_number intentionally omitted — list poll egress; documents use getByIdForDocuments
].join(',');

/** Customer embed for technician job list (low-egress). Must include address + location so maps / full-address dialog match DB (slim omit caused fallback to stale job.service_address). */
const CUSTOMER_EMBED_FOR_TECH_JOBS_SLIM = [
  'id',
  'customer_id',
  'full_name',
  'phone',
  'alternate_phone',
  'visible_address',
  'alternate_visible_address',
  'address',
  'alternate_address',
  'location',
  'alternate_location',
  'service_type',
  'brand',
  'model',
  'last_service_date',
  'has_prefilter',
  'has_google_review',
  'customer_tier',
  'raw_water_tds',
  // gst_number intentionally omitted — list poll egress; documents use getByIdForDocuments
].join(',');

/**
 * Customer embed for admin ongoing + ALL-tab lists (low egress).
 * Omits address, location, notes, etc. — same shape as completed slim embed.
 * UI loads full row via db.customers.getById when user opens edit, address, bills, new job, reports, etc.
 */
const CUSTOMER_EMBED_FOR_ONGOING_ADMIN = [
  'id',
  'customer_id',
  'full_name',
  'phone',
  'alternate_phone',
  'email',
  'visible_address',
  'alternate_visible_address',
  'alternate_address',
  'alternate_location',
  'service_type',
  'brand',
  'model',
  'last_service_date',
  'has_prefilter',
  'has_google_review',
  'customer_tier',
  'raw_water_tds',
  // gst_number intentionally omitted — list poll egress; documents use getByIdForDocuments
].join(',');

/** Per-customer job lists: no before_photos/after_photos/images (large JSON). Shared by slim + report helpers. */
const JOB_BY_CUSTOMER_SLIM_COLS = [
  'id',
  'job_number',
  'customer_id',
  'status',
  'priority',
  'service_type',
  'service_sub_type',
  'service_brand',
  'scheduled_date',
  'scheduled_time_slot',
  'created_at',
  'updated_at',
  'completed_at',
  'end_time',
  'denied_at',
  'denial_reason',
  'assigned_technician_id',
  'completed_by',
  'payment_amount',
  'actual_cost',
  'estimated_cost',
  'payment_method',
  'lead_cost',
  'parts_cost_total',
  'requirements',
] as const;

/** Admin job-number search — no requirements JSON (keeps egress low). */
const JOB_ADMIN_SEARCH_COLS = [
  'id',
  'job_number',
  'customer_id',
  'status',
  'service_type',
  'service_sub_type',
  'service_brand',
  'completed_at',
  'end_time',
  'completed_by',
  'payment_amount',
  'actual_cost',
  'payment_method',
] as const;

/** Full customer row for getById / getByPhone / getByCustomerId (no `*`). */
export const CUSTOMER_ROW_COLUMNS = [
  'id',
  'customer_id',
  'full_name',
  'phone',
  'alternate_phone',
  'email',
  'address',
  'location',
  'visible_address',
  'alternate_address',
  'alternate_location',
  'alternate_visible_address',
  'alternate_brand',
  'alternate_model',
  'alternate_service_type',
  'custom_time',
  'service_type',
  'brand',
  'model',
  'installation_date',
  'warranty_expiry',
  'status',
  'customer_since',
  'last_service_date',
  'notes',
  'preferred_time_slot',
  'preferred_language',
  'has_prefilter',
  'has_google_review',
  'customer_tier',
  'raw_water_tds',
  'gst_number',
  'photos',
  'created_at',
  'updated_at',
].join(',');

/** Full tax invoice row for detail / PDF / edit (no `*`). */
export const TAX_INVOICE_ROW_COLUMNS = [
  'id',
  'invoice_number',
  'invoice_date',
  'invoice_type',
  'customer_id',
  'customer_name',
  'customer_address',
  'customer_phone',
  'customer_email',
  'customer_gstin',
  'company_info',
  'items',
  'place_of_supply',
  'place_of_supply_code',
  'is_intra_state',
  'reverse_charge',
  'e_way_bill_no',
  'transport_mode',
  'vehicle_no',
  'subtotal',
  'total_discount',
  'service_charge',
  'total_tax',
  'cgst',
  'sgst',
  'igst',
  'round_off',
  'total_amount',
  'gst_breakup',
  'invoice_details',
  'bank_details',
  'notes',
  'terms',
  'validity_note',
  'service_type',
  'created_at',
  'updated_at',
].join(',');

/** Document modals — omit photos/notes; keep dual-site address so AMC/bill can pick a location. */
export const CUSTOMER_DOCUMENT_COLUMNS = [
  'id',
  'customer_id',
  'full_name',
  'phone',
  'alternate_phone',
  'email',
  'address',
  'visible_address',
  'alternate_address',
  'alternate_visible_address',
  'alternate_location',
  'service_type',
  'brand',
  'model',
  'alternate_brand',
  'alternate_model',
  'alternate_service_type',
  'installation_date',
  'warranty_expiry',
  'status',
  'customer_since',
  'last_service_date',
  'preferred_time_slot',
  'preferred_language',
  'gst_number',
  'created_at',
  'updated_at',
].join(',');

/** Technician customer-update dialog — contact + address + equipment (no photos/notes/history). */
export const CUSTOMER_TECHNICIAN_UPDATE_COLUMNS = [
  'id',
  'full_name',
  'phone',
  'alternate_phone',
  'email',
  'address',
  'location',
  'alternate_address',
  'alternate_location',
  'visible_address',
  'alternate_visible_address',
  'service_type',
  'brand',
  'model',
].join(',');

/** Assignment / map / calling: exclude INACTIVE; null treated as active (legacy rows). */
const TECHNICIAN_ROSTER_ACTIVE_OR =
  'account_status.is.null,account_status.eq.ACTIVE,account_status.eq.SUSPENDED';

/**
 * Direct-select columns for the public.technicians table.
 *
 * Excludes:
 *   - `password` — column dropped 2026-05-24 (Supabase Auth is the sole source of truth).
 *   - `push_subscription` — SELECT revoked from authenticated; service_role only.
 *   - `salary` — SELECT revoked from authenticated; admin reads via the
 *     `get_technicians_for_admin` / `get_technician_for_admin` SECURITY DEFINER RPCs.
 */
const TECHNICIAN_ROW_COLUMNS = [
  'id',
  'full_name',
  'phone',
  'whatsapp_phone',
  'email',
  'employee_id',
  'skills',
  'service_areas',
  'status',
  'current_location',
  'work_schedule',
  'performance',
  'vehicle',
  'qr_code',
  'upi_id',
  'payee_name',
  'upi_phone',
  'dynamic_upi_enabled',
  'photo',
  'visible_qr_codes',
  'common_qr_code_ids',
  'account_status',
  'push_notifications_enabled',
  'push_prefs',
  'whatsapp_prefs',
  'salary_slip_auto_send',
  'created_at',
  'updated_at',
].join(',');

/** Same as full row but omits `current_location` — admin dashboard initial load (live GPS loaded on demand). */
const TECHNICIAN_DASHBOARD_COLUMNS = [
  'id',
  'full_name',
  'phone',
  'whatsapp_phone',
  'email',
  'employee_id',
  'skills',
  'service_areas',
  'status',
  'work_schedule',
  'performance',
  'vehicle',
  'qr_code',
  'upi_id',
  'payee_name',
  'upi_phone',
  'dynamic_upi_enabled',
  'photo',
  'visible_qr_codes',
  'common_qr_code_ids',
  'account_status',
  'created_at',
  'updated_at',
].join(',');

export const REMINDER_ROW_COLUMNS = [
  'id',
  'entity_type',
  'entity_id',
  'title',
  'notes',
  'reminder_at',
  'created_by',
  'created_at',
  'completed_at',
  'interval_type',
  'interval_value',
].join(',');

/**
 * Column list for the Reminder Tracking worklist only. Adds the contact-tracking
 * columns from the `add-recurring-service-tracking` migration. Kept separate from
 * REMINDER_ROW_COLUMNS so the existing reminder/pending-payment screens never
 * depend on those columns (they keep working even if the migration hasn't run).
 */
export const REMINDER_TRACKER_COLUMNS = [
  REMINDER_ROW_COLUMNS,
  'service_status',
  'last_contacted_at',
  'status_note',
].join(',');

export const FOLLOW_UP_ROW_COLUMNS = [
  'id',
  'job_id',
  'parent_follow_up_id',
  'follow_up_date',
  'follow_up_time',
  'reason',
  'notes',
  'scheduled_by',
  'scheduled_at',
  'completed',
  'completed_at',
  'created_at',
  'updated_at',
].join(',');

export const AMC_CONTRACT_ROW_COLUMNS = [
  'id',
  'customer_id',
  'job_id',
  'start_date',
  'end_date',
  'years',
  'includes_prefilter',
  'additional_info',
  'status',
  'renewed_from_amc_id',
  'service_period_months',
  'given_by_technician_id',
  'created_at',
  'updated_at',
].join(',');

const PRODUCT_QR_ROW_COLUMNS =
  'id,name,qr_code_url,product_image_url,product_name,product_description,product_mrp,created_at,updated_at';

const TECHNICIAN_EXPENSE_ROW_COLUMNS =
  'id,technician_id,amount,description,expense_date,category,receipt_url,notes,added_by,created_at,updated_at';

/** Matches `schema.sql` technician_advances (uses paid_by, not added_by). */
const TECHNICIAN_ADVANCE_ROW_COLUMNS =
  'id,technician_id,amount,description,advance_date,payment_method,payment_reference,notes,paid_by,created_at,updated_at';

/** Slim selects for Analytics.tsx totals (less egress than full expense rows). */
const ANALYTICS_TECHNICIAN_EXPENSE_COLUMNS = 'amount';
const ANALYTICS_TECHNICIAN_ADVANCE_COLUMNS = 'amount';
const ANALYTICS_BUSINESS_EXPENSE_COLUMNS = 'amount,category';
const ANALYTICS_OTHER_EXPENSE_COLUMNS = 'amount';
const ANALYTICS_EXTRA_COMMISSION_COLUMNS = 'technician_id,commission_date,amount';

type AnalyticsQueryOpts = { forAnalytics?: boolean };

const ANALYTICS_FETCH_PAGE_SIZE = 1000;

/** Slim columns for Calling page — no address/location JSONB. */
const CUSTOMER_CALLING_PAGE_COLUMNS = [
  'id',
  'customer_id',
  'full_name',
  'customer_tier',
  'phone',
  'alternate_phone',
  'email',
  'service_type',
  'brand',
  'model',
  'status',
  'has_prefilter',
  'last_service_date',
].join(', ');

/** CRM analytics job rows — `lead_source` column instead of heavy `requirements` JSON. */
const ANALYTICS_JOB_COLUMNS = [
  'id',
  'customer_id',
  'status',
  'created_at',
  'completed_at',
  'end_time',
  'lead_source',
  'assigned_technician_id',
  'assigned_by',
  'payment_amount',
  'actual_cost',
  'lead_cost',
  'parts_cost_total',
  'service_type',
  'service_sub_type',
  'payment_method',
  'job_number',
].join(', ');

/** Store requirements as jsonb array/object — never a JSON string scalar (breaks SQL extract). */
function coerceJobRequirementsForDb(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return parsed;
      return value;
    } catch {
      return value;
    }
  }
  return value;
}

/** Completed jobs for lead-source breakdown (reads requirements JSON). */
const LEAD_BREAKDOWN_JOB_COLUMNS = [
  'id',
  'status',
  'lead_source',
  'requirements',
  'assigned_by',
  'booking_source',
  'booking_domain',
  'payment_amount',
  'actual_cost',
  'lead_cost',
  'parts_cost_total',
  'service_sub_type',
  'completed_at',
  'end_time',
].join(', ');

/** Trend graph period drill-down — slim columns with filter fields. */
const TREND_DRILLDOWN_JOB_COLUMNS = [
  'id',
  'job_number',
  'status',
  'completed_at',
  'end_time',
  'payment_amount',
  'actual_cost',
  'payment_method',
  'service_type',
  'service_sub_type',
  'lead_source',
  'requirements',
  'assigned_by',
  'assigned_technician_id',
  'brand',
  'service_brand',
  'technician:technicians(id, full_name)',
  'customer:customers(id, customer_id, full_name, brand)',
].join(', ');

/** Conversion / attribution analytics — minimal columns, no requirements JSON. */
const ANALYTICS_CONVERSION_JOB_COLUMNS = [
  'id',
  'customer_id',
  'status',
  'created_at',
  'completed_at',
  'end_time',
  'lead_source',
  'assigned_by',
  'assigned_technician_id',
  'payment_amount',
  'actual_cost',
  'service_sub_type',
].join(', ');

/** Page through Supabase queries (default API max is 1000 rows per request). */
async function fetchAnalyticsPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const to = from + ANALYTICS_FETCH_PAGE_SIZE - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) return { data: rows, error };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < ANALYTICS_FETCH_PAGE_SIZE) break;
    from += ANALYTICS_FETCH_PAGE_SIZE;
  }
  return { data: rows, error: null };
}

const JOB_ASSIGNMENT_REQUEST_ROW =
  'id,job_id,technician_id,status,assigned_by,assigned_at,responded_at,response_notes,created_at,updated_at';

const CALL_HISTORY_ROW_COLUMNS =
  'id,customer_id,contact_type,contact_method,phone_number,message_sent,status,notes,contacted_at,created_at,updated_at';

/** Local calendar `YYYY-MM-DD` → UTC bounds for `completed_at` / `end_time` / `denied_at` filters. */
function jobLocalDayBounds(dateStr: string): { startISO: string; nextISO: string } {
  const [year, month, day] = dateStr.split('-').map(Number);
  const localStart = new Date(year, month - 1, day, 0, 0, 0, 0);
  const localNext = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return { startISO: localStart.toISOString(), nextISO: localNext.toISOString() };
}

type AdminCompletedListFilters = {
  completedByUserId?: string;
  serviceSubTypeIn?: string[];
  leadRequirementsContainVariants?: string[];
};

function applyAdminCompletedListFilters(query: any, listFilters?: AdminCompletedListFilters) {
  if (!listFilters) return query;
  if (listFilters.completedByUserId) {
    query = query.eq('completed_by', listFilters.completedByUserId);
  }
  if (listFilters.serviceSubTypeIn?.length) {
    query = query.in('service_sub_type', listFilters.serviceSubTypeIn);
  }
  if (listFilters.leadRequirementsContainVariants?.length) {
    const variants = listFilters.leadRequirementsContainVariants;
    if (variants.length === 1) {
      query = query.contains('requirements', JSON.stringify([{ lead_source: variants[0] }]));
    } else {
      query = query.or(
        variants.map((v) => `requirements.cs.${JSON.stringify([{ lead_source: v }])}`).join(',')
      );
    }
  }
  return query;
}

/** Customer columns for patching jobs missing embedded `customer` (omits `photos` json). */
export const CUSTOMER_ADMIN_LIST_PATCH_COLUMNS = [
  'id',
  'customer_id',
  'full_name',
  'phone',
  'alternate_phone',
  'email',
  'visible_address',
  'alternate_visible_address',
  'address',
  'alternate_address',
  'location',
  'alternate_location',
  'service_type',
  'brand',
  'model',
  'installation_date',
  'warranty_expiry',
  'status',
  'customer_since',
  'last_service_date',
  'notes',
  'preferred_time_slot',
  'preferred_language',
  'has_prefilter',
  'has_google_review',
  'customer_tier',
  'raw_water_tds',
  // gst_number omitted from list patches — document modals refetch via CUSTOMER_DOCUMENT_COLUMNS
  'created_at',
  'updated_at',
].join(',');

/** True when logged-in admin may use direct customers table (not anon / technician). */
async function hasAdminCustomerAccess(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return false;
  const role =
    session.user.app_metadata?.role ?? session.user.user_metadata?.role ?? 'admin';
  return role !== 'technician';
}

type CustomerTableAuthMode = 'admin' | 'technician' | 'anon';

async function getCustomerTableAuthMode(): Promise<CustomerTableAuthMode> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return 'anon';
  const role =
    session.user.app_metadata?.role ?? session.user.user_metadata?.role ?? 'admin';
  return role === 'technician' ? 'technician' : 'admin';
}

function isCallingRpcNotFoundError(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  if (e?.code === 'PGRST202') return true;
  const msg = typeof e?.message === 'string' ? e.message : '';
  return msg.includes('Could not find the function') || msg.includes('does not exist');
}

function isSentEmailLogsRpcNotFoundError(error: unknown): boolean {
  return isCallingRpcNotFoundError(error);
}

/** Parse jsonb array returned by technician customer-jobs RPCs. */
function parseJsonbRpcJobRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data == null) return [];
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export type SentEmailLogsPageResult = {
  total: number;
  rows: Record<string, unknown>[];
  server_paginated: boolean;
};

export type CallingPageRpcRow = {
  id: string;
  customer_id: string;
  full_name: string;
  customer_tier?: string | null;
  phone: string;
  alternate_phone?: string | null;
  email?: string | null;
  service_type: string;
  brand: string;
  model: string;
  status: string;
  has_prefilter?: boolean | null;
  last_service_date?: string | null;
  raw_water_tds?: number | null;
  last_service_at?: string | null;
  last_service_type?: string | null;
  last_service_sub_type?: string | null;
  last_contacted_at?: string | null;
  last_contact_status?: string | null;
  last_contact_type?: string | null;
  last_whatsapp_at?: string | null;
  last_whatsapp_status?: string | null;
  days_since_service?: number | null;
  days_since_contact?: number | null;
  days_since_whatsapp?: number | null;
};

export type CallingPageRpcResult = {
  total: number;
  stats: { over_one_year: number; six_to_twelve: number };
  rows: CallingPageRpcRow[];
  server_paginated: boolean;
};

type CallingPageQueryParams = {
  page: number;
  limit: number;
  search?: string;
  serviceFilter?: string;
  serviceHistoryFilter?: string;
  serviceSubTypeFilter?: string;
  showRecentlyContacted?: boolean;
  recentContactDays?: number;
  statusFilter?: string;
  prefilterFilter?: string;
  onFallbackProgress?: (loaded: number) => void;
};

type CallHistoryContactSummary = {
  lastCall?: {
    contacted_at: string;
    status: string;
    contact_type: string;
  };
  lastWhatsApp?: {
    contacted_at: string;
    status: string;
  };
};

async function enrichCallingPageRowsWithContactMeta(
  rows: CallingPageRpcRow[]
): Promise<CallingPageRpcRow[]> {
  if (rows.length === 0) return rows;

  const ids = rows.map((r) => r.id);
  const summary: Record<string, CallHistoryContactSummary> = {};
  const CHUNK = 80;

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('call_history')
      .select('customer_id, contacted_at, status, contact_type')
      .in('customer_id', chunk)
      .order('contacted_at', { ascending: false })
      .limit(400);

    if (error) return rows;

    for (const row of data || []) {
      const cid = (row as { customer_id?: string }).customer_id;
      if (!cid) continue;
      if (!summary[cid]) summary[cid] = {};
      const entry = summary[cid];
      const typed = row as {
        contacted_at: string;
        status: string;
        contact_type: string;
      };
      if (!entry.lastCall && typed.contact_type === 'CALL') {
        entry.lastCall = typed;
      }
      if (typed.contact_type === 'WHATSAPP' && !entry.lastWhatsApp) {
        entry.lastWhatsApp = { contacted_at: typed.contacted_at, status: typed.status };
      }
    }
  }

  const now = Date.now();
  return rows.map((row) => {
    const meta = summary[row.id];
    const lastContactedAt = meta?.lastCall?.contacted_at ?? row.last_contacted_at ?? null;
    const lastWhatsappAt = meta?.lastWhatsApp?.contacted_at ?? row.last_whatsapp_at ?? null;
    const daysSinceContact =
      row.days_since_contact ??
      (lastContactedAt != null
        ? Math.floor((now - new Date(lastContactedAt).getTime()) / (1000 * 60 * 60 * 24))
        : null);
    const daysSinceWhatsapp =
      row.days_since_whatsapp ??
      (lastWhatsappAt != null
        ? Math.floor((now - new Date(lastWhatsappAt).getTime()) / (1000 * 60 * 60 * 24))
        : null);

    return {
      ...row,
      last_contacted_at: lastContactedAt,
      last_contact_status: meta?.lastCall?.status ?? row.last_contact_status ?? null,
      last_contact_type: meta?.lastCall?.contact_type ?? (lastContactedAt ? 'CALL' : null),
      last_whatsapp_at: lastWhatsappAt,
      last_whatsapp_status: meta?.lastWhatsApp?.status ?? row.last_whatsapp_status ?? null,
      days_since_contact: daysSinceContact,
      days_since_whatsapp: daysSinceWhatsapp,
    };
  });
}

/** Client-side filter + slice when get_calling_page RPC is not deployed yet. */
async function getCallingPageFallback(
  params: CallingPageQueryParams,
  page: number,
  limit: number
): Promise<CallingPageRpcResult | null> {
  const rows: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    const to = from + ANALYTICS_FETCH_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('customers')
      .select(CUSTOMER_CALLING_PAGE_COLUMNS)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) return null;
    const batch = data ?? [];
    rows.push(...batch);
    params.onFallbackProgress?.(rows.length);
    if (batch.length < ANALYTICS_FETCH_PAGE_SIZE) break;
    from += ANALYTICS_FETCH_PAGE_SIZE;
  }

  type JobRow = {
    customer_id: string;
    completed_at: string;
    service_type?: string | null;
    service_sub_type?: string | null;
  };
  type ContactRow = {
    customer_id: string;
    contacted_at: string;
    status: string;
    contact_type?: string;
  };

  const [jobsRes, contactsRes] = await Promise.all([
    supabase.rpc('get_last_completed_job_per_customer') as Promise<{
      data: JobRow[] | null;
      error: unknown;
    }>,
    supabase.rpc('get_last_contact_per_customer') as Promise<{
      data: ContactRow[] | null;
      error: unknown;
    }>,
  ]);

  let lastJobsData: JobRow[] | null = jobsRes.data;
  if (jobsRes.error) {
    const fallback = await supabase
      .from('jobs')
      .select('customer_id, completed_at, service_type, service_sub_type')
      .eq('status', 'COMPLETED')
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(2000);
    lastJobsData = fallback.data;
  }

  let lastContactsData: ContactRow[] | null = contactsRes.data;
  if (contactsRes.error) {
    const fallback = await supabase
      .from('call_history')
      .select('customer_id, contacted_at, status, contact_type')
      .order('contacted_at', { ascending: false })
      .limit(2000);
    lastContactsData = fallback.data;
  }

  const lastServiceMap = new Map<
    string,
    { completed_at: string; service_type?: string | null; service_sub_type?: string | null }
  >();
  (lastJobsData || []).forEach((job) => {
    if (job.customer_id && !lastServiceMap.has(job.customer_id)) {
      lastServiceMap.set(job.customer_id, {
        completed_at: job.completed_at,
        service_type: job.service_type ?? null,
        service_sub_type: job.service_sub_type ?? null,
      });
    }
  });

  const lastCallMap = new Map<
    string,
    { contacted_at: string; status: string }
  >();
  const lastWhatsAppMap = new Map<
    string,
    { contacted_at: string; status: string }
  >();
  (lastContactsData || []).forEach((contact) => {
    if (!contact.customer_id) return;
    if (contact.contact_type === 'CALL' && !lastCallMap.has(contact.customer_id)) {
      lastCallMap.set(contact.customer_id, {
        contacted_at: contact.contacted_at,
        status: contact.status,
      });
    }
    if (contact.contact_type === 'WHATSAPP' && !lastWhatsAppMap.has(contact.customer_id)) {
      lastWhatsAppMap.set(contact.customer_id, {
        contacted_at: contact.contacted_at,
        status: contact.status,
      });
    }
  });

  const now = Date.now();
  const search = (params.search ?? '').trim();
  const searchLower = search.toLowerCase();
  const searchDigits = search.replace(/\D/g, '');
  const isPhoneSearch = searchDigits.length >= 10;

  const enriched: CallingPageRpcRow[] = rows.map((customer: any) => {
    const lastJobInfo = lastServiceMap.get(customer.id);
    const lastServiceAt = lastJobInfo?.completed_at || customer.last_service_date || null;
    const lastCall = lastCallMap.get(customer.id);
    const lastWhatsApp = lastWhatsAppMap.get(customer.id);
    const daysSinceService =
      lastServiceAt != null
        ? Math.floor((now - new Date(lastServiceAt).getTime()) / (1000 * 60 * 60 * 24))
        : null;
    const daysSinceContact =
      lastCall != null
        ? Math.floor((now - new Date(lastCall.contacted_at).getTime()) / (1000 * 60 * 60 * 24))
        : null;
    const daysSinceWhatsapp =
      lastWhatsApp != null
        ? Math.floor((now - new Date(lastWhatsApp.contacted_at).getTime()) / (1000 * 60 * 60 * 24))
        : null;

    return {
      id: customer.id,
      customer_id: customer.customer_id,
      full_name: customer.full_name,
      customer_tier: customer.customer_tier ?? null,
      phone: customer.phone,
      alternate_phone: customer.alternate_phone ?? null,
      email: customer.email ?? null,
      service_type: customer.service_type,
      brand: customer.brand,
      model: customer.model,
      status: customer.status,
      has_prefilter: customer.has_prefilter ?? null,
      last_service_date: customer.last_service_date ?? null,
      raw_water_tds: customer.raw_water_tds ?? null,
      last_service_at: lastServiceAt,
      last_service_type: lastJobInfo?.service_type ?? null,
      last_service_sub_type: lastJobInfo?.service_sub_type ?? null,
      last_contacted_at: lastCall?.contacted_at ?? null,
      last_contact_status: lastCall?.status ?? null,
      last_contact_type: lastCall ? 'CALL' : null,
      last_whatsapp_at: lastWhatsApp?.contacted_at ?? null,
      last_whatsapp_status: lastWhatsApp?.status ?? null,
      days_since_service: daysSinceService,
      days_since_contact: daysSinceContact,
      days_since_whatsapp: daysSinceWhatsapp,
    };
  });

  let filtered = enriched;

  if (search) {
    filtered = filtered.filter((customer) => {
      const phoneMatch =
        isPhoneSearch &&
        (customer.phone?.replace(/\D/g, '') === searchDigits ||
          (customer.alternate_phone ?? '').replace(/\D/g, '') === searchDigits);
      return (
        customer.full_name?.toLowerCase().includes(searchLower) ||
        customer.phone?.includes(search) ||
        (customer.alternate_phone ?? '').includes(search) ||
        customer.customer_id?.toLowerCase().includes(searchLower) ||
        (customer.email ?? '').toLowerCase().includes(searchLower) ||
        phoneMatch
      );
    });
  }

  const serviceFilter = params.serviceFilter ?? 'all';
  if (serviceFilter !== 'all') {
    filtered = filtered.filter((customer) => {
      if (!customer.last_service_at) return serviceFilter === 'never';
      const days = customer.days_since_service ?? 0;
      switch (serviceFilter) {
        case '3months':
          return days >= 90 && days < 180;
        case '6months':
          return days >= 180 && days < 365;
        case '1year':
          return days >= 365;
        case 'never':
          return false;
        default:
          return true;
      }
    });
  }

  const serviceHistoryFilter = params.serviceHistoryFilter ?? 'all';
  if (serviceHistoryFilter !== 'all') {
    filtered = filtered.filter((customer) => {
      const hasService = !!customer.last_service_at;
      if (serviceHistoryFilter === 'serviced') return hasService;
      if (serviceHistoryFilter === 'never') return !hasService;
      return true;
    });
  }

  const serviceSubTypeFilter = params.serviceSubTypeFilter ?? 'all';
  if (serviceSubTypeFilter !== 'all') {
    filtered = filtered.filter((customer) => {
      const subType = (customer.last_service_sub_type || '').toUpperCase();
      return subType === serviceSubTypeFilter.toUpperCase();
    });
  }

  const recentContactDays = params.recentContactDays ?? 7;
  if (!params.showRecentlyContacted) {
    filtered = filtered.filter((customer) => {
      if (!customer.last_contacted_at) return true;
      return (customer.days_since_contact ?? 0) >= recentContactDays;
    });
  }

  const statusFilter = params.statusFilter ?? 'all';
  if (statusFilter !== 'all') {
    filtered = filtered.filter((customer) => {
      if (!customer.last_contact_status) return statusFilter === 'never';
      return customer.last_contact_status === statusFilter;
    });
  }

  const prefilterFilter = params.prefilterFilter ?? 'all';
  if (prefilterFilter !== 'all') {
    filtered = filtered.filter((customer) => {
      if (prefilterFilter === 'yes') return customer.has_prefilter === true;
      if (prefilterFilter === 'no') return customer.has_prefilter === false;
      if (prefilterFilter === 'unknown') return customer.has_prefilter == null;
      return true;
    });
  }

  filtered.sort((a, b) => {
    const aDays = a.days_since_service != null ? a.days_since_service : -1;
    const bDays = b.days_since_service != null ? b.days_since_service : -1;
    return bDays - aDays;
  });

  const total = filtered.length;
  const overOneYear = filtered.filter((c) => (c.days_since_service ?? 0) >= 365).length;
  const sixToTwelve = filtered.filter(
    (c) => (c.days_since_service ?? 0) >= 180 && (c.days_since_service ?? 0) < 365
  ).length;
  const offset = (page - 1) * limit;
  const pageRows = filtered.slice(offset, offset + limit);

  return {
    total,
    stats: { over_one_year: overOneYear, six_to_twelve: sixToTwelve },
    rows: pageRows,
    server_paginated: false,
  };
}

// Database helper functions
export const db = {
  // Customer operations
  customers: {
    async create(customer: Database['public']['Tables']['customers']['Insert']) {
      // Public booking (anon): must use SECURITY DEFINER RPC after customers RLS lockdown
      if (!(await hasAdminCustomerAccess())) {
        return db.customers.createForBooking(customer as Record<string, unknown>);
      }

      // customer_id is set by DB trigger set_customer_id (generate_customer_id is not exposed to anon RPC)
      const insertPayload = { ...customer } as Record<string, unknown>;
      if (!insertPayload.customer_id) {
        delete insertPayload.customer_id;
      }

      const { data, error } = await supabase
        .from('customers')
        .insert(insertPayload as Database['public']['Tables']['customers']['Insert'])
        .select()
        .single();
      
      return { data, error };
    },

    /**
     * Find (or lazily create) the shared placeholder customer used for direct/office sales
     * that aren't tied to a real customer or technician. One row is reused for all such sales.
     */
    async getOrCreateWalkIn() {
      const WALK_IN_NAME = 'Walk-in / Office Sale';
      const WALK_IN_PHONE = 'WALK-IN';

      const { data: existing, error: findError } = await supabase
        .from('customers')
        .select(CUSTOMER_ROW_COLUMNS)
        .eq('full_name', WALK_IN_NAME)
        .limit(1)
        .maybeSingle();

      if (findError) return { data: null, error: findError };
      if (existing) return { data: existing, error: null };

      const walkInPayload = {
        full_name: WALK_IN_NAME,
        phone: WALK_IN_PHONE,
        alternate_phone: '',
        email: '',
        address: { street: '', area: 'Office', city: 'Bangalore', state: 'Karnataka', pincode: '' },
        location: {
          latitude: 0,
          longitude: 0,
          formattedAddress: 'Office',
          googleLocation: '',
        },
        visible_address: 'Office',
        service_type: 'RO',
        brand: '',
        model: '',
        status: 'ACTIVE',
        notes: 'Auto-created placeholder for direct/office sales (no customer or technician).',
        customer_since: new Date().toISOString(),
        preferred_time_slot: 'MORNING',
        preferred_language: 'ENGLISH',
      } as unknown as Database['public']['Tables']['customers']['Insert'];

      return db.customers.create(walkInPayload);
    },

    /**
     * Direct office sale: real customer when name + 10-digit phone are given;
     * shared walk-in placeholder only when both are omitted.
     */
    async resolveForDirectSale(opts?: { name?: string; phone?: string }) {
      const name = String(opts?.name || '').trim();
      const phone = String(opts?.phone || '').replace(/\D/g, '').slice(-10);

      if (!name && !phone) {
        const walkIn = await db.customers.getOrCreateWalkIn();
        return { ...walkIn, isWalkIn: true as const };
      }

      if (!name || phone.length !== 10) {
        return {
          data: null,
          error: {
            message:
              'Enter both customer name and a valid 10-digit phone, or leave both empty for walk-in sale.',
          } as any,
          isWalkIn: false as const,
        };
      }

      const { data: existing, error: findError } = await db.customers.getByPhone(phone);
      if (findError) return { data: null, error: findError, isWalkIn: false as const };
      if (existing) return { data: existing, error: null, isWalkIn: false as const };

      const payload = {
        full_name: name,
        phone,
        alternate_phone: '',
        email: '',
        address: {
          street: '',
          area: 'Office',
          city: 'Bangalore',
          state: 'Karnataka',
          pincode: '',
        },
        location: {
          latitude: 0,
          longitude: 0,
          formattedAddress: 'Office',
          googleLocation: '',
        },
        visible_address: 'Office',
        service_type: 'RO',
        brand: '',
        model: '',
        status: 'ACTIVE',
        notes: 'Created from direct office sale.',
        customer_since: new Date().toISOString(),
        preferred_time_slot: 'MORNING',
        preferred_language: 'ENGLISH',
      } as unknown as Database['public']['Tables']['customers']['Insert'];

      const created = await db.customers.create(payload);
      return { ...created, isWalkIn: false as const };
    },
    
    async getById(id: string) {
      let { data, error } = await supabase
        .from('customers')
        .select(CUSTOMER_ROW_COLUMNS)
        .eq('id', id)
        .single();

      if (error && isMissingDualSiteColumnError(error)) {
        ({ data, error } = await supabase
          .from('customers')
          .select(omitDualSiteCustomerCols(CUSTOMER_ROW_COLUMNS))
          .eq('id', id)
          .single());
      }
      
      return { data, error };
    },

    /** Slim row for document generators — skips photos, notes, and location JSON. */
    async getByIdForDocuments(id: string) {
      const { data, error } = await supabase
        .from('customers')
        .select(CUSTOMER_DOCUMENT_COLUMNS)
        .eq('id', id)
        .single();

      return { data, error };
    },

    /** Slim fetch for technician Update customer details — avoids photos/notes egress on open. */
    async getByIdForTechnicianUpdate(id: string) {
      const { data, error } = await supabase
        .from('customers')
        .select(CUSTOMER_TECHNICIAN_UPDATE_COLUMNS)
        .eq('id', id)
        .single();

      return { data, error };
    },

    /** Batch fetch by UUIDs – one query instead of N. Use for labels (id, full_name, customer_id). */
    async getByIds(ids: string[]) {
      if (!ids?.length) return { data: [] as { id: string; full_name: string | null; customer_id: string | null }[], error: null };
      const { data, error } = await supabase
        .from('customers')
        .select('id, full_name, customer_id')
        .in('id', ids);
      return { data: data || [], error };
    },

    /** Returning-customer flags: customers with last_service_date set (batched). */
    async getLastServiceDateFlags(customerIds: string[]) {
      const ids = [...new Set(customerIds.filter(Boolean))];
      const map: Record<string, boolean> = {};
      if (ids.length === 0) return { data: map, error: null };

      const CHUNK = 80;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from('customers')
          .select('id, last_service_date')
          .in('id', chunk);
        if (error) return { data: map, error };
        for (const row of data || []) {
          if ((row as { last_service_date?: string | null }).last_service_date) {
            map[(row as { id: string }).id] = true;
          }
        }
      }
      return { data: map, error: null };
    },
    
    async getByPhone(phone: string) {
      if (!(await hasAdminCustomerAccess())) {
        return db.customers.getByPhoneForBooking(phone);
      }

      const { data, error } = await supabase
        .from('customers')
        .select(CUSTOMER_ROW_COLUMNS)
        .eq('phone', phone)
        .maybeSingle();
      
      return { data, error };
    },

    /** @deprecated Use getBookingCustomerByPhone() — anon RPC revoked (PII enumeration fix). */
    async getByPhoneForBooking(_phone: string) {
      return {
        data: null,
        error: {
          message:
            'Direct customer lookup is disabled. Use getBookingCustomerByPhone with ALTCHA verification.',
        },
      };
    },

    async createForBooking(customer: Record<string, unknown>) {
      const { createBookingCustomer } = await import('@/lib/bookingCustomer');
      return createBookingCustomer(customer);
    },

    async updateForBooking(_id: string, _phone: string, _updates: Record<string, unknown>) {
      return {
        data: null,
        error: {
          message:
            'Direct customer update is disabled. Use updateBookingCustomer with ALTCHA verification.',
        },
      };
    },
    
    async update(id: string, updates: Database['public']['Tables']['customers']['Update']) {
      const authMode = await getCustomerTableAuthMode();

      if (authMode === 'anon') {
        const phone =
          (updates as { phone?: string }).phone ??
          (updates as { phone_number?: string }).phone_number;
        if (phone) {
          return db.customers.updateForBooking(id, phone, updates as Record<string, unknown>);
        }
        return {
          data: null,
          error: {
            message:
              'Public booking must use updateForBooking(id, phone, updates) after customers RLS is enabled',
          },
        };
      }

      // Admin + technician: direct UPDATE (RLS scopes technician to assigned customers).
      let payload = { ...updates } as Database['public']['Tables']['customers']['Update'];
      let { data, error } = await supabase
        .from('customers')
        .update(payload)
        .eq('id', id)
        .select();

      if (error && isMissingDualSiteColumnError(error)) {
        payload = stripDualSiteCustomerFields(payload as Record<string, unknown>) as typeof payload;
        ({ data, error } = await supabase
          .from('customers')
          .update(payload)
          .eq('id', id)
          .select());
      }

      if (error) {
        return { data: null, error };
      }

      return { data: data?.[0] || null, error: null };
    },

    /** Whitelisted customer patch for technicians on an active assigned job (prefer RPC). */
    async updateByTechnician(
      customerId: string,
      jobId: string,
      patch: {
        full_name?: string;
        email?: string;
        alternate_phone?: string;
        visible_address?: string;
        address?: Record<string, unknown>;
        location?: Record<string, unknown>;
        brand?: string;
        model?: string;
      }
    ) {
      const { sanitizeTechnicianCustomerPatch, isMissingRpcError } = await import(
        '@/lib/technicianCustomerUpdate'
      );
      const sanitized = sanitizeTechnicianCustomerPatch(patch);
      if ('error' in sanitized) {
        return { data: null, error: { message: sanitized.error } };
      }
      if (Object.keys(sanitized).length === 0) {
        return { data: null, error: { message: 'No valid fields to update' } };
      }

      const { data, error } = await supabase.rpc('technician_patch_customer', {
        p_customer_id: customerId,
        p_job_id: jobId,
        p_full_name: sanitized.full_name ?? null,
        p_email: sanitized.email ?? null,
        p_alternate_phone: sanitized.alternate_phone ?? null,
        p_visible_address: sanitized.visible_address ?? null,
        p_address: sanitized.address ?? null,
        p_location: sanitized.location ?? null,
        p_brand: sanitized.brand ?? null,
        p_model: sanitized.model ?? null,
      });

      if (!error) {
        return { data: data as Database['public']['Tables']['customers']['Row'] | null, error: null };
      }

      if (!isMissingRpcError(error.message)) {
        return { data: null, error };
      }

      // Pre-RPC fallback: still only send whitelisted columns (RLS must block other roles).
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('customers')
        .update(sanitized as Database['public']['Tables']['customers']['Update'])
        .eq('id', customerId)
        .select();

      if (fallbackError) {
        return { data: null, error: fallbackError };
      }
      return { data: fallbackData?.[0] || null, error: null };
    },
    
    async getAll(limit?: number) {
      let query = supabase
        .from('customers')
        .select(CUSTOMER_ROW_COLUMNS)
        .order('created_at', { ascending: false });
      
      // Add limit if provided to reduce data transfer
      if (limit && limit > 0) {
        query = query.limit(limit);
      }
      
      const { data, error } = await query;
      return { data, error };
    },

    /** Low-egress customers list for dashboards/autocomplete. */
    async getAllSlim(limit?: number) {
      const cols = [
        'id',
        'customer_id',
        'full_name',
        'phone',
        'alternate_phone',
        'email',
        'visible_address',
        'service_type',
        'brand',
        'model',
        'last_service_date',
        'has_prefilter',
        'has_google_review',
        'customer_tier',
        'raw_water_tds',
        'created_at',
        'updated_at',
      ].join(', ');

      let query = supabase
        .from('customers')
        .select(cols)
        .order('created_at', { ascending: false });

      if (limit && limit > 0) {
        query = query.limit(limit);
      }

      const { data, error } = await query;
      return { data, error };
    },

    /**
     * All customers for Calling page (batched 1000/request — Supabase row cap).
     * Optional onProgress reports rows loaded so the UI can show fetch progress.
     */
    async getAllForCallingPage(opts?: { onProgress?: (loaded: number) => void }) {
      const rows: Record<string, unknown>[] = [];
      let from = 0;
      for (;;) {
        const to = from + ANALYTICS_FETCH_PAGE_SIZE - 1;
        const { data, error } = await supabase
          .from('customers')
          .select(CUSTOMER_CALLING_PAGE_COLUMNS)
          .order('created_at', { ascending: false })
          .range(from, to);
        if (error) return { data: rows, error };
        const page = data ?? [];
        rows.push(...page);
        opts?.onProgress?.(rows.length);
        if (page.length < ANALYTICS_FETCH_PAGE_SIZE) break;
        from += ANALYTICS_FETCH_PAGE_SIZE;
      }
      return { data: rows, error: null };
    },

    async search(query: string, limit: number = 50) {
      const trimmed = (query ?? '').trim();
      if (!trimmed) return { data: [], error: null };
      return this.searchSlim(trimmed, limit, { includeAddressAndLocation: true });
    },

    /** Low-egress customer search for pickers/lists. Set includeAddressAndLocation for admin map/address UI. */
    async searchSlim(
      query: string,
      limit: number = 50,
      opts?: { includeAddressAndLocation?: boolean }
    ) {
      const trimmed = (query ?? '').trim();
      if (!trimmed) {
        return { data: [], error: null };
      }
      const cols = [
        'id',
        'customer_id',
        'full_name',
        'phone',
        'alternate_phone',
        'email',
        'visible_address',
        'service_type',
        'brand',
        'model',
        'last_service_date',
        'has_prefilter',
        'has_google_review',
        'customer_tier',
        'raw_water_tds',
        'created_at',
        'updated_at',
        ...(opts?.includeAddressAndLocation
          ? ([
              'address',
              'location',
              'alternate_visible_address',
              'alternate_address',
              'alternate_location',
              'notes',
              'preferred_time_slot',
              'preferred_language',
              'custom_time',
              'photos',
              'installation_date',
              'warranty_expiry',
              'status',
              'customer_since',
            ] as const)
          : []),
      ].join(', ');

      const escaped = escapeForLike(trimmed);
      const orParts: string[] = [
        `customer_id.ilike.%${escaped}%`,
        `full_name.ilike.%${escaped}%`,
        `phone.ilike.%${escaped}%`,
        `alternate_phone.ilike.%${escaped}%`,
        `email.ilike.%${escaped}%`,
      ];
      const normalizedPhone = normalizePhoneForSearch(trimmed);
      if (normalizedPhone.length >= 10) {
        orParts.push(`phone.ilike.%${normalizedPhone}%`, `alternate_phone.ilike.%${normalizedPhone}%`);
        if (normalizedPhone.length === 10) {
          const first4 = normalizedPhone.slice(0, 4);
          const last6 = normalizedPhone.slice(4);
          orParts.push(`phone.ilike.%${first4}%${last6}%`, `alternate_phone.ilike.%${first4}%${last6}%`);
        }
      }

      let q = supabase
        .from('customers')
        .select(cols)
        .or(orParts.join(','))
        .order('created_at', { ascending: false });
      if (limit > 0) q = q.limit(limit);

      const { data, error } = await q;
      return { data, error };
    },

    /**
     * Technician customer search (SECURITY DEFINER RPC — slim columns only).
     * Requires scripts/add-technician-customer-tools.sql.
     */
    async searchAsTechnician(query: string) {
      const trimmed = (query ?? '').trim();
      if (trimmed.length < 3) return { data: [], error: null };
      const { data, error } = await supabase.rpc('technician_search_customers', {
        p_query: trimmed,
      } as never);
      return { data: (data as Record<string, unknown>[] | null) ?? [], error };
    },

    /** Scoped fetch: customers created today (local date). Use instead of loading all customers. Limit default 100. */
    async getCreatedToday(limit: number = 100) {
      const d = new Date();
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      const { data, error } = await supabase
        .from('customers')
        .select(CUSTOMER_ROW_COLUMNS)
        .gte('customer_since', start.toISOString())
        .lte('customer_since', end.toISOString())
        .order('customer_since', { ascending: false })
        .limit(limit);
      return { data, error };
    },

    async getByCustomerId(customerId: string) {
      let { data, error } = await supabase
        .from('customers')
        .select(CUSTOMER_ROW_COLUMNS)
        .eq('customer_id', customerId)
        .single();

      if (error && isMissingDualSiteColumnError(error)) {
        ({ data, error } = await supabase
          .from('customers')
          .select(omitDualSiteCustomerCols(CUSTOMER_ROW_COLUMNS))
          .eq('customer_id', customerId)
          .single());
      }
      
      return { data, error };
    },

    /** Tiny fetch: address + email (e.g. warranty dialog). */
    async getAddressById(id: string) {
      const { data, error } = await supabase
        .from('customers')
        .select('address, email')
        .eq('id', id)
        .single();
      return { data, error };
    },

    async delete(id: string) {
      const { data, error } = await supabase
        .from('customers')
        .delete()
        .eq('id', id)
        .select(); // Select to verify deletion
      
      return { data, error };
    },

    /** Admin: preview what merge_customers_admin will move (requires SQL migration). */
    async previewMerge(primaryId: string, secondaryId: string) {
      const { data, error } = await supabase.rpc('preview_merge_customers_admin', {
        p_primary: primaryId,
        p_secondary: secondaryId,
      } as never);
      return { data: data as CustomerMergePreview | null, error };
    },

    /** Admin: merge duplicate customer into keeper (atomic RPC). */
    async merge(
      primaryId: string,
      secondaryId: string,
      locationFrom: 'primary' | 'secondary' = 'primary'
    ) {
      const { data, error } = await supabase.rpc('merge_customers_admin', {
        p_primary: primaryId,
        p_secondary: secondaryId,
        p_location_from: locationFrom,
      } as never);
      return { data: data as CustomerMergeResult | null, error };
    },
  },

  // Job operations
  jobs: {
    async create(
      job: Database['public']['Tables']['jobs']['Insert'],
      retryCount: number = 0,
      bookingPhone?: string,
      bookingAltcha?: import('@/lib/bookingCustomer').BookingAltchaContext
    ) {
      // Public booking (anon): SECURITY DEFINER RPC after jobs RLS lockdown
      if (!(await hasAdminCustomerAccess())) {
        if (!bookingPhone?.trim()) {
          return {
            data: null,
            error: { message: 'booking phone is required for public job creation', code: 'BOOKING_PHONE_REQUIRED' } as any,
          };
        }
        if (!bookingAltcha?.altchaLoginToken) {
          return {
            data: null,
            error: { message: 'Security verification required for booking', code: 'BOOKING_ALTCHA_REQUIRED' } as any,
          };
        }
        const { createBookingJob } = await import('@/lib/bookingJob');
        const { data: rpcJob, error: rpcError } = await createBookingJob(
          bookingPhone.trim(),
          job as Record<string, unknown>,
          bookingAltcha
        );
        if (rpcError?.code === '23505' && rpcError.message?.includes('job_number') && retryCount < 3) {
          const serviceType = (job as any).service_type || 'RO';
          const prefix = serviceType === 'RO' ? 'RO' : 'WS';
          const timestamp = Date.now().toString().slice(-6);
          const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
          const newJobNumber = `${prefix}${timestamp}${random}`;
          return this.create({ ...job, job_number: newJobNumber }, retryCount + 1, bookingPhone, bookingAltcha);
        }
        if (!rpcError) {
          cacheInvalidate('job_counts_v1');
        }
        return { data: rpcJob as any, error: rpcError };
      }

      // Return same shape as getOngoing (explicit columns + customer) so UI can prepend without refetch.
      const insertRow = { ...job } as Database['public']['Tables']['jobs']['Insert'];
      if (insertRow.requirements !== undefined) {
        insertRow.requirements = coerceJobRequirementsForDb(insertRow.requirements) as typeof insertRow.requirements;
      }

      const jobSelectAfterInsert = `${jobSelectOngoingAndTech()},${JOB_PHOTO_ARRAY_COLUMNS},customer:customers(${CUSTOMER_EMBED_FOR_ONGOING_ADMIN})`;

      let { data, error } = await supabase
        .from('jobs')
        .insert(insertRow)
        .select(jobSelectAfterInsert)
        .single();

      if (error && isMissingDualSiteColumnError(error)) {
        const legacyRow = stripDualSiteJobFields(
          insertRow as unknown as Record<string, unknown>
        ) as Database['public']['Tables']['jobs']['Insert'];
        ({ data, error } = await supabase
          .from('jobs')
          .insert(legacyRow)
          .select(jobSelectAfterInsert)
          .single());
      }
      
      // If duplicate job_number error and we haven't retried too many times, retry with new job number
      if (error && error.code === '23505' && error.message?.includes('job_number') && retryCount < 3) {
        // Generate a new job number by adding more randomness
        const serviceType = (job as any).service_type || 'RO';
        const prefix = serviceType === 'RO' ? 'RO' : 'WS';
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0'); // 4 digits for more uniqueness
        const newJobNumber = `${prefix}${timestamp}${random}`;
        
        // Retry with new job number
        return this.create({ ...job, job_number: newJobNumber }, retryCount + 1, bookingPhone, bookingAltcha);
      }

      if (!error) {
        cacheInvalidate('job_counts_v1');
        if ((job as { status?: string })?.status === 'COMPLETED') {
          cacheInvalidate('completed_customers_map_v1');
        }
      }
      return { data, error };
    },

    /**
     * Technician job creation (SECURITY DEFINER RPC — lead cost computed
     * server-side, status derived from assignment). Retries duplicate
     * job_number like the admin path. Requires
     * scripts/add-technician-customer-tools.sql.
     */
    async createAsTechnician(
      job: Record<string, unknown>,
      retryCount: number = 0
    ): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> {
      const { data, error } = await supabase.rpc('technician_create_job', {
        p_job: job,
      } as never);
      if (
        error &&
        (error.code === '23505' || /job_number/i.test(error.message || '')) &&
        retryCount < 3
      ) {
        const serviceType = (job as { service_type?: string }).service_type || 'RO';
        const prefix = serviceType === 'RO' ? 'RO' : 'WS';
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        return this.createAsTechnician(
          { ...job, job_number: `${prefix}${timestamp}${random}` },
          retryCount + 1
        );
      }
      if (!error) cacheInvalidate('job_counts_v1');
      return { data: data as Record<string, unknown> | null, error };
    },

    async createForBooking(
      phone: string,
      row: Record<string, unknown>,
      bookingAltcha: import('@/lib/bookingCustomer').BookingAltchaContext
    ) {
      const { createBookingJob } = await import('@/lib/bookingJob');
      return createBookingJob(phone, row, bookingAltcha);
    },
    
    async getById(id: string) {
      // Backward-compatible default now uses SLIM select to reduce egress.
      // Use getByIdFull() when you explicitly need photos/address/location/etc.
      return this.getByIdSlim(id);
    },

    /** Low-egress jobs-by-id fetch. Avoids large payload fields and customer JSON. */
    async getByIdSlim(id: string) {
      const jobCols = [
        'id',
        'job_number',
        'customer_id',
        'status',
        'priority',
        'service_type',
        'service_sub_type',
        'service_brand',
        'scheduled_date',
        'scheduled_time_slot',
        'created_at',
        'updated_at',
        'completed_at',
        'end_time',
        'denied_at',
        'denial_reason',
        'assigned_technician_id',
        'completed_by',
        'payment_amount',
        'actual_cost',
        'estimated_cost',
        'payment_method',
        'lead_cost',
        'parts_cost_total',
        'requirements',
      ].join(', ');

      const customerCols = [
        'id',
        'customer_id',
        'full_name',
        'phone',
        'alternate_phone',
        'email',
        'visible_address',
        'service_type',
        'brand',
        'model',
        'last_service_date',
        'has_prefilter',
        'has_google_review',
        'customer_tier',
        'raw_water_tds',
      ].join(', ');

      const { data, error } = await supabase
        .from('jobs')
        .select(`${jobCols},customer:customers(${customerCols})`)
        .eq('id', id)
        .single();

      return { data, error };
    },

    /** Full jobs-by-id fetch. Use only when explicitly requested (photos/full details). */
    async getByIdFull(id: string) {
      const { data, error } = await supabase
        .from('jobs')
        .select(`
          *,
          customer:customers(*)
        `)
        .eq('id', id)
        .single();

      return { data, error };
    },
    
    async getByCustomerId(customerId: string) {
      // Backward-compatible default uses slim list; use getByCustomerIdForReport / getByCustomerIdForPhotoAggregation / getByCustomerIdFull as needed.
      return this.getByCustomerIdSlim(customerId);
    },

    /**
     * Ultra-lean jobs list for pickers (e.g. warranty dialog): only the 5 columns
     * needed to label a job. Capped to the 100 most recent to bound egress.
     */
    async getByCustomerIdForPicker(customerId: string) {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, job_number, status, service_type, service_sub_type, scheduled_date, completed_at')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(100);
      return { data: data || [], error };
    },

    /** Low-egress jobs-by-customer list. Avoids big payload fields. */
    async getByCustomerIdSlim(customerId: string) {
      const cols = JOB_BY_CUSTOMER_SLIM_COLS.join(', ');

      const { data, error } = await supabase
        .from('jobs')
        .select(cols)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      return { data, error };
    },

    /**
     * Paginated slim jobs-by-customer list. Keeps egress bounded for customers with
     * very many jobs (e.g. the shared walk-in / office-sale customer). Fetches one
     * extra row to detect whether more pages exist without a separate count query.
     */
    async getByCustomerIdSlimPaged(customerId: string, limit: number = 50, offset: number = 0) {
      const cols = JOB_BY_CUSTOMER_SLIM_COLS.join(', ');
      const safeLimit = Math.min(Math.max(1, limit), 200);
      const safeOffset = Math.max(0, offset);

      const { data, error } = await supabase
        .from('jobs')
        .select(cols)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .range(safeOffset, safeOffset + safeLimit); // fetch limit + 1 to detect more

      if (error) return { data: [], hasMore: false, error };

      const rows = data || [];
      const hasMore = rows.length > safeLimit;
      return { data: hasMore ? rows.slice(0, safeLimit) : rows, hasMore, error: null };
    },

    /**
     * Customer / technician “report” UI: completed jobs only; no photo arrays (use enrichJobsWithAfterPhotosIfNeeded).
     */
    async getByCustomerIdForReport(customerId: string) {
      const cols = [
        ...JOB_BY_CUSTOMER_SLIM_COLS,
        'brand',
        'model',
        'completion_notes',
        'description',
      ].join(', ');

      const { data, error } = await supabase
        .from('jobs')
        .select(cols)
        .eq('customer_id', customerId)
        .eq('status', 'COMPLETED')
        .order('created_at', { ascending: false });

      return { data, error };
    },

    /** Report jobs + lazy after_photos for rows missing payment/bill URLs in requirements. */
    async getByCustomerIdForReportEnriched(customerId: string) {
      const { data, error } = await this.getByCustomerIdForReport(customerId);
      if (error) return { data: data || [], error };
      if (!data?.length) return { data: data || [], error: null };
      const { enrichJobsWithAfterPhotosIfNeeded } = await import('@/lib/jobReportPhotos');
      const enriched = await enrichJobsWithAfterPhotosIfNeeded(data);
      return { data: enriched, error: null };
    },

    /**
     * Technician Customer Report: SECURITY DEFINER RPC so all completed jobs for the
     * customer are visible (direct SELECT is limited to technician_can_access_job per row).
     */
    async getByCustomerIdForReportAsTechnician(customerId: string) {
      const authMode = await getCustomerTableAuthMode();
      if (authMode !== 'technician') {
        return this.getByCustomerIdForReport(customerId);
      }

      const { data, error } = await supabase.rpc('get_technician_customer_jobs_report', {
        p_customer_id: customerId,
      });

      if (error) {
        if (isCallingRpcNotFoundError(error)) {
          return this.getByCustomerIdForReport(customerId);
        }
        return { data: [], error };
      }

      return { data: parseJsonbRpcJobRows(data), error: null };
    },

    /** Technician report + after_photos enrichment (RPC rows may already include after_photos). */
    async getByCustomerIdForReportEnrichedAsTechnician(customerId: string) {
      const { data, error } = await this.getByCustomerIdForReportAsTechnician(customerId);
      if (error) return { data: data || [], error };
      if (!data?.length) return { data: data || [], error: null };
      const { enrichJobsWithAfterPhotosIfNeeded } = await import('@/lib/jobReportPhotos');
      const enriched = await enrichJobsWithAfterPhotosIfNeeded(data);
      return { data: enriched, error: null };
    },

    /** Admin customer search: jobs whose job_number matches the query (slim — no requirements/photos). */
    async searchByJobNumberForAdmin(query: string, limit = 20) {
      const trimmed = (query ?? '').trim();
      if (trimmed.length < 2) return { data: [], error: null };
      const escaped = escapeForLike(trimmed);
      const cols = [
        ...JOB_ADMIN_SEARCH_COLS,
        `customer:customers(${CUSTOMER_EMBED_FOR_ONGOING_ADMIN})`,
      ].join(', ');

      const { data, error } = await supabase
        .from('jobs')
        .select(cols)
        .ilike('job_number', `%${escaped}%`)
        .order('completed_at', { ascending: false, nullsFirst: false })
        .limit(Math.min(Math.max(limit, 1), 30));

      return { data: data || [], error };
    },

    /**
     * Gallery / delete-photo flows: only fields used to aggregate or mutate photo URLs.
     * Much smaller than getByCustomerIdFull (*).
     */
    async getByCustomerIdForPhotoAggregation(customerId: string) {
      const cols = [
        'id',
        'created_at',
        'updated_at',
        'completed_at',
        'end_time',
        'before_photos',
        'after_photos',
        'images',
        'requirements',
      ].join(', ');

      const { data, error } = await supabase
        .from('jobs')
        .select(cols)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      return { data, error };
    },

    /**
     * Technician photo gallery: SECURITY DEFINER RPC for all customer jobs + photo fields.
     */
    async getByCustomerIdForPhotoAggregationAsTechnician(customerId: string) {
      const authMode = await getCustomerTableAuthMode();
      if (authMode !== 'technician') {
        return this.getByCustomerIdForPhotoAggregation(customerId);
      }

      const { data, error } = await supabase.rpc('get_technician_customer_jobs_photos', {
        p_customer_id: customerId,
      });

      if (error) {
        if (isCallingRpcNotFoundError(error)) {
          return this.getByCustomerIdForPhotoAggregation(customerId);
        }
        return { data: [], error };
      }

      return { data: parseJsonbRpcJobRows(data), error: null };
    },

    /**
     * Single latest job (for merging new customer-gallery uploads into before_photos).
     */
    async getLatestJobForCustomerPhotoUpload(customerId: string) {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, before_photos, created_at')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return { data, error };
    },

    /** Full jobs-by-customer fetch: ongoing column set plus photo JSON arrays. */
    async getByCustomerIdFull(customerId: string) {
      const { data, error } = await supabase
        .from('jobs')
        .select(`${jobSelectOngoingAndTech()},${JOB_PHOTO_ARRAY_COLUMNS}`)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });
      return { data, error };
    },

    /** Load only photo array fields for many jobs (follows slim list query). */
    async getPhotoFieldsForJobIds(jobIds: string[]) {
      const ids = [...new Set(jobIds.filter(Boolean))];
      if (ids.length === 0) {
        return { data: [] as Record<string, unknown>[], error: null };
      }
      const { data, error } = await supabase
        .from('jobs')
        .select(`id,${JOB_PHOTO_ARRAY_COLUMNS}`)
        .in('id', ids);
      return { data: data || [], error };
    },

    /**
     * Lean variant of getPhotoFieldsForJobIds for report / completed enrichment, which
     * only consumes `after_photos`. Skips before_photos + images to cut egress (those
     * JSON arrays can be large and are never read on the report path).
     */
    async getAfterPhotosForJobIds(jobIds: string[]) {
      const ids = [...new Set(jobIds.filter(Boolean))];
      if (ids.length === 0) {
        return { data: [] as Record<string, unknown>[], error: null };
      }
      const { data, error } = await supabase
        .from('jobs')
        .select('id,after_photos')
        .in('id', ids);
      return { data: data || [], error };
    },

    /**
     * Latest COMPLETED job `service_brand` per customer (batched `.in` query).
     * Rows are ordered by completion time desc; first row per customer_id wins.
     */
    async getLastServiceBrandByCustomerIds(customerIds: string[]) {
      const ids = [...new Set(customerIds.filter(Boolean))];
      if (ids.length === 0) {
        return { data: {} as Record<string, string | null>, error: null };
      }

      const map: Record<string, string | null> = {};
      const CHUNK = 80;

      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from('jobs')
          .select('customer_id, service_brand, completed_at, end_time, created_at')
          .in('customer_id', chunk)
          .eq('status', 'COMPLETED')
          .not('service_brand', 'is', null)
          .order('completed_at', { ascending: false, nullsFirst: false })
          .order('end_time', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false });

        if (error) return { data: map, error };

        for (const row of data || []) {
          const cid = (row as { customer_id?: string | null }).customer_id;
          if (!cid || cid in map) continue;
          map[cid] = (row as { service_brand?: string | null }).service_brand ?? null;
        }
      }

      for (const id of ids) {
        if (!(id in map)) map[id] = null;
      }

      return { data: map, error: null };
    },

    /** Among given customer UUIDs, which have at least one COMPLETED job (returning-customer UI). */
    async getCustomerIdsWithCompletedAmong(customerIds: string[]) {
      const ids = [...new Set(customerIds.filter(Boolean))];
      const map: Record<string, boolean> = {};
      if (ids.length === 0) return { data: map, error: null };

      const CHUNK = 80;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from('jobs')
          .select('customer_id')
          .in('customer_id', chunk)
          .eq('status', 'COMPLETED');
        if (error) return { data: map, error };
        for (const row of data || []) {
          const cid = (row as { customer_id?: string | null }).customer_id;
          if (cid) map[cid] = true;
        }
      }
      return { data: map, error: null };
    },
    
    async getAll(limit?: number, includeCustomer?: boolean) {
      const run = async () => {
        let query;
        if (includeCustomer) {
          query = supabase
            .from('jobs')
            .select(`${jobSelectOngoingAndTech()},customer:customers(${CUSTOMER_EMBED_FOR_ONGOING_ADMIN})`);
        } else {
          query = supabase
            .from('jobs')
            .select(jobSelectOngoingAndTech());
        }

        query = query.order('created_at', { ascending: false });

        if (limit && limit > 0) {
          query = query.limit(limit);
        }

        return query;
      };

      let { data, error } = await run();
      if (error && isMissingVisitOrderColumnError(error)) {
        markVisitOrderColumnMissing();
        ({ data, error } = await run());
      }
      return { data, error };
    },

    /**
     * Record a direct/office counter sale (no technician).
     * When `customerName` + `customerPhone` (10 digits) are provided, finds or creates a
     * real customer and attaches the job to them. When both are omitted, uses the shared
     * walk-in placeholder customer.
     *
     * Stored as a COMPLETED, fully-paid job so it flows into revenue analytics for the sale date.
     * When inventory items are provided, cost is stored in `parts_cost_total` and stock is decremented.
     */
    async createDirectSale(params: {
      amount: number;
      item?: string;
      saleDate: Date;
      /** Real customer — both required together; omit both for walk-in sale. */
      customerName?: string;
      customerPhone?: string;
      /** @deprecated single-item fields kept for backward compatibility; prefer `items`. */
      inventoryId?: string | null;
      quantity?: number;
      partsCost?: number;
      /** Multiple inventory items sold in one office sale. Stored as `office_parts`.
       * Custom (one-off) items not in the catalog use `custom: true` and carry their own
       * synthetic `inventoryId` (e.g. `custom:...`); they don't touch inventory stock. */
      items?: Array<{
        inventoryId: string;
        quantity: number;
        unitPrice: number;
        productName?: string;
        code?: string | null;
        custom?: boolean;
      }>;
      paymentMode?: 'CASH' | 'ONLINE' | 'PARTIAL';
      partialCashAmount?: number;
      partialOnlineAmount?: number;
      qrPhotos?: {
        qr_code_type?: string;
        selected_qr_code_id?: string;
        selected_qr_code_url?: string;
        selected_qr_code_name?: string;
      } | null;
    }) {
      const {
        amount,
        item,
        saleDate,
        customerName,
        customerPhone,
        inventoryId,
        quantity,
        partsCost,
        items,
        paymentMode,
        partialCashAmount,
        partialOnlineAmount,
        qrPhotos,
      } = params;
      // Map the sale's payment mode to the jobs.payment_method enum used across analytics.
      const dbPaymentMethod =
        paymentMode === 'ONLINE' ? 'UPI' : paymentMode === 'PARTIAL' ? 'PARTIAL' : 'CASH';

      // Normalize the items list. Prefer the new multi-item `items` array; fall back to the
      // legacy single-item fields so older callers keep working.
      let cleanItems = (Array.isArray(items) ? items : [])
        .map((it) => ({
          inventoryId: String(it.inventoryId),
          quantity: Math.max(0, Math.floor(Number(it.quantity) || 0)),
          unitPrice: Math.max(0, Number(it.unitPrice) || 0),
          productName: it.productName || '',
          code: it.code ?? null,
          custom: it.custom === true || String(it.inventoryId).startsWith('custom:'),
        }))
        .filter((it) => it.inventoryId && it.quantity > 0);

      if (cleanItems.length === 0) {
        const legacyQty = Math.max(0, Math.floor(Number(quantity) || 0));
        const legacyCost = Math.max(0, Number(partsCost) || 0);
        if (inventoryId && legacyQty > 0) {
          cleanItems = [{
            inventoryId: String(inventoryId),
            quantity: legacyQty,
            unitPrice: legacyQty > 0 ? legacyCost / legacyQty : legacyCost,
            productName: '',
            code: null,
            custom: false,
          }];
        }
      }

      const useInventory = cleanItems.length > 0;
      const totalPartsCost = cleanItems.reduce((s, it) => s + it.quantity * it.unitPrice, 0);

      const {
        data: saleCustomer,
        error: customerError,
        isWalkIn,
      } = await db.customers.resolveForDirectSale({
        name: customerName,
        phone: customerPhone,
      });
      if (customerError || !saleCustomer) {
        return {
          data: null,
          error: customerError || ({ message: 'Could not resolve customer for sale' } as any),
        };
      }

      // Reserve stock first so an out-of-stock sale fails before any job row is created.
      // Track what we reserved so we can roll back every item if a later one fails.
      const reserved: Array<{ id: string; qty: number }> = [];
      for (const it of cleanItems) {
        // Custom one-off items aren't tracked in inventory, so there's no stock to reserve.
        if (it.custom) continue;
        const { error: decErr } = await db.inventory.decrementForJob(it.inventoryId, it.quantity);
        if (decErr) {
          for (const r of reserved) {
            await db.inventory.incrementForJob(r.id, r.qty).catch(() => {});
          }
          return { data: null, error: decErr };
        }
        reserved.push({ id: it.inventoryId, qty: it.quantity });
      }

      // Anchor the sale to noon of the selected day so it lands inside the day's local range.
      const completion = new Date(
        saleDate.getFullYear(),
        saleDate.getMonth(),
        saleDate.getDate(),
        12, 0, 0, 0
      );
      const completionISO = completion.toISOString();

      const prefix = 'RO';
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      const jobNumber = `${prefix}${timestamp}${random}`;

      const baseItem = (item && item.trim()) ? item.trim() : 'Direct office sale';
      const itemsLabel = cleanItems
        .map((it) => `${it.productName || 'Item'} × ${it.quantity}`)
        .join(', ');
      const description = useInventory && itemsLabel ? itemsLabel : baseItem;

      const requirements: any[] = [{ lead_source: 'Office Sale' }];
      if (isWalkIn) {
        requirements.push({ completed_by_office: true });
      }
      if (useInventory) {
        requirements.push({
          office_parts: cleanItems.map((it) => ({
            inventory_id: it.inventoryId,
            product_name: it.productName,
            code: it.code,
            quantity: it.quantity,
            unit_price: it.unitPrice,
          })),
        });
      }
      // Mirror the job-completion flow: store partial split and the QR used (for reports).
      if (paymentMode === 'PARTIAL') {
        requirements.push({
          partial_cash_amount: Math.max(0, Number(partialCashAmount) || 0),
          partial_online_amount: Math.max(0, Number(partialOnlineAmount) || 0),
        });
      }
      if ((paymentMode === 'ONLINE' || paymentMode === 'PARTIAL') && qrPhotos?.selected_qr_code_id) {
        requirements.push({ qr_photos: qrPhotos });
      }

      const jobData = {
        job_number: jobNumber,
        customer_id: (saleCustomer as any).id,
        service_type: 'RO',
        service_sub_type: 'Direct Sale',
        brand: '',
        model: '',
        scheduled_date: completionISO,
        scheduled_time_slot: 'MORNING',
        service_address: (saleCustomer as any).address ?? {},
        service_location: (saleCustomer as any).location ?? {},
        status: 'COMPLETED',
        priority: 'LOW',
        description,
        requirements,
        estimated_cost: amount,
        actual_cost: amount,
        lead_cost: 0,
        parts_cost_total: useInventory ? totalPartsCost : 0,
        payment_status: 'PAID',
        payment_amount: amount,
        payment_method: dbPaymentMethod,
        assigned_technician_id: null,
        end_time: completionISO,
        completed_at: completionISO,
      } as unknown as Database['public']['Tables']['jobs']['Insert'];

      const result = await db.jobs.create(jobData);

      // If the job failed to save after we reserved stock, put it all back.
      if ((result.error || !result.data) && useInventory) {
        for (const r of reserved) {
          await db.inventory.incrementForJob(r.id, r.qty).catch(() => {});
        }
      }

      return result;
    },

    /**
     * Replace the spare-parts list for an office / walk-in job (no technician). Parts are
     * stored in requirements under `office_parts` and `parts_cost_total` is recomputed so
     * profit and analytics stay accurate. Legacy single-item `direct_sale_*` entries are
     * folded into the new array. Main-inventory stock adjustments are handled by the caller.
     */
    async setOfficeJobParts(
      jobId: string,
      parts: Array<{
        inventory_id: string;
        product_name?: string;
        code?: string | null;
        quantity: number;
        unit_price: number;
      }>
    ) {
      const { data: jobRow, error: fetchErr } = await supabase
        .from('jobs')
        .select('requirements')
        .eq('id', jobId)
        .maybeSingle();
      if (fetchErr) return { data: null, error: fetchErr };

      let reqs: any[] = [];
      const raw = (jobRow as any)?.requirements;
      if (typeof raw === 'string') {
        try {
          reqs = JSON.parse(raw);
        } catch {
          reqs = [];
        }
      } else if (Array.isArray(raw)) {
        reqs = raw;
      } else if (raw && typeof raw === 'object') {
        reqs = [raw];
      }
      if (!Array.isArray(reqs)) reqs = [];

      // Remove any prior parts entries (new array form + legacy single-item form).
      reqs = reqs.filter(
        (r: any) => !r?.office_parts && !r?.direct_sale_inventory_id
      );

      const cleanParts = (parts || [])
        .filter((p) => p && p.inventory_id && Number(p.quantity) > 0)
        .map((p) => ({
          inventory_id: p.inventory_id,
          product_name: p.product_name || '',
          code: p.code ?? null,
          quantity: Math.max(0, Math.floor(Number(p.quantity) || 0)),
          unit_price: Math.max(0, Number(p.unit_price) || 0),
        }));

      if (cleanParts.length > 0) {
        reqs.push({ office_parts: cleanParts });
      }

      const partsCostTotal = cleanParts.reduce(
        (s, p) => s + p.quantity * p.unit_price,
        0
      );

      const { error } = await supabase
        .from('jobs')
        .update({
          requirements: coerceJobRequirementsForDb(reqs),
          parts_cost_total: partsCostTotal,
        } as Database['public']['Tables']['jobs']['Update'])
        .eq('id', jobId);

      if (error) return { data: null, error };
      return { data: { id: jobId, parts_cost_total: partsCostTotal }, error: null };
    },
    
    async update(id: string, updates: Database['public']['Tables']['jobs']['Update']) {
      // Debug logging
      console.log('🔧 [db.jobs.update] Called with:', {
        id,
        updates,
        updateKeys: Object.keys(updates || {}),
        assignedTechnicianId: (updates as any)?.assigned_technician_id
      });
      
      try {
        const payload = { ...updates } as Database['public']['Tables']['jobs']['Update'];
        if (payload.requirements !== undefined) {
          payload.requirements = coerceJobRequirementsForDb(payload.requirements) as typeof payload.requirements;
        }

        // First, try update without select to avoid relationship query issues
        const { error: updateError } = await supabase
        .from('jobs')
        .update(payload)
          .eq('id', id);
        
        if (updateError) {
          console.error('❌ [db.jobs.update] Supabase update error:', {
            error: updateError,
            errorMessage: updateError.message,
            errorDetails: updateError.details,
            errorHint: updateError.hint,
            errorCode: updateError.code,
            id,
            updates
          });
          return { data: null, error: updateError };
        }
        
        // Re-fetch the row with the same column set as list views so merged client state shows edits without a manual refresh
        const { data, error: selectError } = await supabase
          .from('jobs')
          .select(jobSelectOngoingAndTech())
          .eq('id', id)
          .single();
      
        if (selectError) {
          console.warn('⚠️ [db.jobs.update] Select error (non-critical):', {
            error: selectError,
            id
          });
          cacheInvalidate('job_counts_v1');
          if ((updates as { status?: string }).status !== undefined) {
            cacheInvalidate('completed_customers_map_v1');
          }
          return { data: null, error: null };
      }
      
        console.log('✅ [db.jobs.update] Success:', {
          id,
          updatedData: data
        });
        
        cacheInvalidate('job_counts_v1');
        if ((updates as { status?: string }).status !== undefined) {
          cacheInvalidate('completed_customers_map_v1');
        }
        return { data: data || null, error: null };
      } catch (err: any) {
        console.error('❌ [db.jobs.update] Exception:', {
          err,
          errorMessage: err?.message,
          errorStack: err?.stack,
          id,
          updates
        });
        return { 
          data: null, 
          error: {
            message: err?.message || 'Unknown error during update',
            details: err?.details || null,
            hint: err?.hint || null,
            code: err?.code || 'UNKNOWN_ERROR'
          } as any
        };
      }
    },
    
    async getByStatus(status: string) {
      const { data, error } = await supabase
        .from('jobs')
        .select(`${jobSelectOngoingAndTech()},customer:customers(${CUSTOMER_EMBED_FOR_ONGOING_ADMIN})`)
        .eq('status', status)
        .order('created_at', { ascending: false });
      
      return { data, error };
    },
    
    async getByTechnicianId(technicianId: string) {
      // Explicit columns + slim customer embed; fallback if DB is missing optional columns.
      const orFilter = `assigned_technician_id.eq.${technicianId},team_members.cs.["${technicianId}"]`;
      const slim = await supabase
        .from('jobs')
        .select(`${jobSelectOngoingAndTech()},customer:customers(${CUSTOMER_EMBED_FOR_TECH_JOBS})`)
        .or(orFilter)
        // Prefer recently touched rows so auto AMC / follow-up → ongoing → reassign is not dropped behind .limit(100) by old created_at.
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);

      let rows = slim.data || [];
      let err = slim.error;

      if (err) {
        if (import.meta.env.DEV) {
          console.warn('[db.jobs.getByTechnicianId] Slim select failed, using full select:', slim.error?.message);
        }
        const legacy = await supabase
          .from('jobs')
          .select(`${jobSelectOngoingAndTech()},customer:customers(${CUSTOMER_EMBED_FOR_ONGOING_ADMIN})`)
          .or(orFilter)
          .order('updated_at', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(100);
        rows = legacy.data || [];
        err = legacy.error;
      }

      if (err || !rows.length) {
        return { data: rows, error: err };
      }

      const { data: photoRows, error: photoErr } = await this.getPhotoFieldsForJobIds(rows.map((r: any) => r.id));
      if (photoErr || !photoRows?.length) {
        return { data: rows, error: null };
      }
      return { data: mergeJobPhotoFieldsIntoRows(rows, photoRows as Record<string, unknown>[]), error: null };
    },

    /**
     * Technician PWA dashboard: fetch only what the UI needs (not one .limit(100) scan).
     * Active + follow-up + today/yesterday completed + today's denied.
     */
    async getByTechnicianIdForDashboard(
      technicianId: string,
      options?: { activeOnly?: boolean }
    ) {
      const orFilter = `assigned_technician_id.eq.${technicianId},team_members.cs.["${technicianId}"]`;

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrowStart = new Date(todayStart);
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);

      const runSlice = async () => {
        const select = `${jobSelectOngoingAndTech()},customer:customers(${CUSTOMER_EMBED_FOR_TECH_JOBS_SLIM})`;
        const activeQuery = supabase
          .from('jobs')
          .select(select)
          .or(orFilter)
          .in('status', ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'])
          .order('updated_at', { ascending: false })
          .limit(40);

        const followUpQuery = supabase
          .from('jobs')
          .select(select)
          .or(orFilter)
          .eq('status', 'FOLLOW_UP')
          .order('updated_at', { ascending: false })
          .limit(20);

        const completedQuery = supabase
          .from('jobs')
          .select(select)
          .or(orFilter)
          .eq('status', 'COMPLETED')
          .gte('completed_at', yesterdayStart.toISOString())
          .lt('completed_at', tomorrowStart.toISOString())
          .order('completed_at', { ascending: false })
          .limit(50);

        const deniedQuery = supabase
          .from('jobs')
          .select(select)
          .or(orFilter)
          .eq('status', 'DENIED')
          .gte('denied_at', todayStart.toISOString())
          .lt('denied_at', tomorrowStart.toISOString())
          .order('denied_at', { ascending: false })
          .limit(15);

        if (options?.activeOnly) {
          const [activeRes, followUpRes] = await Promise.all([activeQuery, followUpQuery]);
          return [activeRes, followUpRes] as const;
        }
        const [activeRes, followUpRes, completedRes, deniedRes] = await Promise.all([
          activeQuery,
          followUpQuery,
          completedQuery,
          deniedQuery,
        ]);
        return [activeRes, followUpRes, completedRes, deniedRes] as const;
      };

      let resultSets = await runSlice();
      const firstPassError = resultSets.find((res) => res.error)?.error;
      if (firstPassError && isMissingVisitOrderColumnError(firstPassError)) {
        markVisitOrderColumnMissing();
        resultSets = await runSlice();
      }

      const byId = new Map<string, unknown>();
      let firstError: { message?: string } | null = null;
      for (const res of resultSets) {
        if (res.error && !firstError) firstError = res.error;
        for (const row of res.data || []) {
          const id = (row as { id?: string }).id;
          if (id) byId.set(id, row);
        }
      }

      if (byId.size === 0 && firstError) {
        return { data: [], error: firstError };
      }

      return { data: Array.from(byId.values()), error: null };
    },

    /** Low-egress technician job list. Prefer getByTechnicianIdForDashboard for the PWA. */
    async getByTechnicianIdSlim(technicianId: string) {
      const dashboard = await this.getByTechnicianIdForDashboard(technicianId);
      if (!dashboard.error && (dashboard.data?.length ?? 0) > 0) {
        return dashboard;
      }

      const orFilter = `assigned_technician_id.eq.${technicianId},team_members.cs.["${technicianId}"]`;
      const result = await supabase
        .from('jobs')
        .select(`${jobSelectOngoingAndTech()},customer:customers(${CUSTOMER_EMBED_FOR_TECH_JOBS_SLIM})`)
        .or(orFilter)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);

      if (!result.error) {
        return { data: result.data || [], error: null };
      }

      if (import.meta.env.DEV) {
        console.warn('[db.jobs.getByTechnicianIdSlim] Slim select failed, using legacy admin embed:', result.error?.message);
      }

      const legacy = await supabase
        .from('jobs')
        .select(`${jobSelectOngoingAndTech()},customer:customers(${CUSTOMER_EMBED_FOR_ONGOING_ADMIN})`)
        .or(orFilter)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);

      return { data: legacy.data || [], error: legacy.error };
    },
    
    // Legacy function - keeping for backward compatibility
    async getByTechnicianIdOld(technicianId: string) {
      const { data, error } = await supabase
        .from('jobs')
        .select(`
          *,
          service_address,
          service_location,
          customer:customers(
            id,
            customer_id,
            full_name,
            phone,
            alternate_phone,
            email,
            visible_address,
            address,
            location
          )
        `)
        .eq('assigned_technician_id', technicianId)
        .order('created_at', { ascending: false });
      
      return { data, error };
    },
    
    async delete(id: string) {
      if (!(await hasAdminCustomerAccess())) {
        return {
          data: null,
          error: { message: 'Only administrators can delete jobs.', code: 'FORBIDDEN' },
        };
      }

      const { error: rpcError } = await supabase.rpc('delete_job_admin', {
        p_job_id: id,
      });

      if (!rpcError) {
        cacheInvalidate('job_counts_v1');
        cacheInvalidate('completed_customers_map_v1');
        return { data: null, error: null };
      }

      const rpcMissing =
        rpcError.code === '42883' ||
        rpcError.code === 'PGRST202' ||
        /delete_job_admin/i.test(rpcError.message || '');

      if (!rpcMissing) {
        return { data: null, error: rpcError };
      }

      await supabase
        .from('reminders')
        .delete()
        .eq('entity_type', 'job')
        .eq('entity_id', id);

      const { error } = await supabase.from('jobs').delete().eq('id', id);
      if (!error) {
        cacheInvalidate('job_counts_v1');
        cacheInvalidate('completed_customers_map_v1');
      }
      return { data: null, error };
    },

    // Get job counts by status (for stats without loading all data)
    async getCounts() {
      try {
        // Get today's date range (start and end of today) for today-specific counts
        // Use local timezone date, then convert to UTC for database comparison
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth();
        const day = today.getDate();

        const dayKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const countsCacheKey = `job_counts_v1:${dayKey}`;
        const cached = cacheGet<{
          ongoing: number;
          followup: number;
          denied: number;
          completed: number;
        }>(countsCacheKey);
        if (cached) return { data: cached, error: null };
        
        // Create date objects in local timezone (start and end of today)
        // new Date(year, month, day, hour, min, sec) creates a date at that LOCAL time
        // When converted to ISO string, it automatically converts to UTC
        const localStartOfDay = new Date(year, month, day, 0, 0, 0, 0);
        const localStartOfNextDay = new Date(year, month, day + 1, 0, 0, 0, 0);
        
        // The Date objects already represent the correct moment in time
        // When converted to ISO string, they will be in UTC
        const todayStart = localStartOfDay.toISOString();
        const todayStartNextDay = localStartOfNextDay.toISOString();

        // Fast path: a single SECURITY INVOKER RPC computes all four counts in
        // one round-trip (vs four separate count queries). The client passes the
        // same UTC day bounds, so results are identical to the fallback below.
        // Falls back transparently if the function isn't present yet.
        if (!adminJobCountsRpcMissing) {
          const rpc = await supabase.rpc('get_admin_job_counts', {
            p_today_start: todayStart,
            p_today_next: todayStartNextDay,
          } as any);
          if (!rpc.error && rpc.data) {
            const row: any = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
            if (row) {
              const countsData = {
                ongoing: Number(row.ongoing) || 0,
                followup: Number(row.followup) || 0,
                denied: Number(row.denied) || 0,
                completed: Number(row.completed) || 0,
              };
              cacheSet(countsCacheKey, countsData, 25_000);
              return { data: countsData, error: null };
            }
          } else if (rpc.error) {
            // PGRST202 = function not found in schema cache. Stop trying for this
            // session so we don't pay a failed round-trip on every refresh.
            const code = (rpc.error as any)?.code;
            if (code === 'PGRST202' || code === '42883') {
              adminJobCountsRpcMissing = true;
            }
          }
        }

        // Count jobs in parallel for better performance
        const [ongoingResult, followupResult, deniedResult, completedResult] = await Promise.all([
          // Ongoing: ALL current jobs with status PENDING, ASSIGNED, EN_ROUTE, or IN_PROGRESS
          supabase
          .from('jobs')
          .select('id', { count: 'exact', head: true })
            .in('status', ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS']),
          // Followup: ALL jobs with status FOLLOW_UP or RESCHEDULED
          supabase
            .from('jobs')
            .select('id', { count: 'exact', head: true })
            .in('status', ['FOLLOW_UP', 'RESCHEDULED']),
          // Denied: Only TODAY's jobs with status DENIED or CANCELLED (using denied_at field)
          supabase
            .from('jobs')
            .select('id', { count: 'exact', head: true })
            .in('status', ['DENIED', 'CANCELLED'])
            .gte('denied_at', todayStart)
            .lt('denied_at', todayStartNextDay),
          // Completed: Only TODAY's jobs with status COMPLETED (using completed_at OR end_time field)
          // Check both completed_at and end_time fields - use whichever is set
          // Format: (completed_at >= start AND completed_at < nextDay) OR (end_time >= start AND end_time < nextDay)
          supabase
            .from('jobs')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'COMPLETED')
            .or(`and(completed_at.gte.${todayStart},completed_at.lt.${todayStartNextDay}),and(end_time.gte.${todayStart},end_time.lt.${todayStartNextDay})`)
        ]);

        const countsData = {
          ongoing: ongoingResult.count || 0,
          followup: followupResult.count || 0,
          denied: deniedResult.count || 0,
          completed: completedResult.count || 0,
        };
        const err = ongoingResult.error || followupResult.error || deniedResult.error || completedResult.error;
        if (!err) cacheSet(countsCacheKey, countsData, 25_000);

        return {
          data: countsData,
          error: err,
        };
      } catch (error) {
        console.error('Error in getCounts:', error);
        return {
          data: { ongoing: 0, followup: 0, denied: 0, completed: 0 },
          error: error instanceof Error ? error : new Error('Unknown error')
        };
      }
    },

    // Get jobs by status with pagination
    async getByStatusPaginated(
      statuses: string[],
      page: number = 1,
      pageSize: number = 20,
      dateFilter?: string | { startDate: string; endDate: string },
      listFilters?: {
        completedByUserId?: string;
        /** DB values for `in('service_sub_type', …)` — include casing/legacy aliases. */
        serviceSubTypeIn?: string[];
        /** `lead_source` values for jsonb `requirements` contains (see adminUtils). */
        leadRequirementsContainVariants?: string[];
      }
    ) {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      
      let query = supabase
        .from('jobs')
        .select(`
          *,
          customer:customers(
            id,
            customer_id,
            full_name,
            phone,
            email,
            alternate_phone,
            visible_address,
            address,
            location,
            service_type,
            brand,
            model,
            installation_date,
            warranty_expiry,
            status,
            customer_since,
            last_service_date,
            notes,
            preferred_time_slot,
            preferred_language,
            has_prefilter,
            has_google_review,
            customer_tier,
            raw_water_tds,
            created_at,
            updated_at
          )
        `, { count: 'exact' });

      // If date filter is provided, filter by date based on status
      if (dateFilter) {
        const hasRangeObject = typeof dateFilter === 'object' && !!dateFilter.startDate && !!dateFilter.endDate;
        const singleDate = typeof dateFilter === 'string' ? dateFilter : undefined;
        const rangeStartDate = hasRangeObject ? dateFilter.startDate : undefined;
        const rangeEndDate = hasRangeObject ? dateFilter.endDate : undefined;
        
        if (statuses.includes('DENIED')) {
          // Filter DENIED jobs by denied_at date
          // Filter: DENIED jobs with denied_at in date range, OR CANCELLED jobs (show all cancelled regardless of date)
          if (statuses.includes('CANCELLED')) {
            if (singleDate) {
              const { startISO, nextISO } = jobLocalDayBounds(singleDate);
              query = query.or(`and(status.eq.DENIED,denied_at.gte.${startISO},denied_at.lt.${nextISO}),status.eq.CANCELLED`);
            } else {
              query = query.in('status', statuses);
            }
          } else {
            // Only DENIED jobs, filter by date
            // Use start of next day with lt (less than) for reliability
            if (singleDate) {
              const { startISO, nextISO } = jobLocalDayBounds(singleDate);
              query = query
                .eq('status', 'DENIED')
                .gte('denied_at', startISO)
                .lt('denied_at', nextISO);
            } else {
              query = query.eq('status', 'DENIED');
            }
          }
        } else if (statuses.includes('COMPLETED')) {
          // Filter COMPLETED jobs by completed_at or end_time date
          // Some jobs might have end_time set but not completed_at (or vice versa)
          // Filter by date portion in local timezone (what user sees)
          let startISO: string | null = null;
          let nextDayISO: string | null = null;

          if (singleDate) {
            const bounds = jobLocalDayBounds(singleDate);
            startISO = bounds.startISO;
            nextDayISO = bounds.nextISO;
          } else if (rangeStartDate && rangeEndDate) {
            const startBounds = jobLocalDayBounds(rangeStartDate);
            const endBounds = jobLocalDayBounds(rangeEndDate);
            startISO = startBounds.startISO;
            nextDayISO = endBounds.nextISO;
          }
          
          // Debug logging in development
          if (import.meta.env.DEV && dateFilter && startISO && nextDayISO) {
            console.log('Completed jobs date filter:', {
              dateFilter,
              startISO,
              nextDayISO,
              timezoneOffset: new Date().getTimezoneOffset()
            });
          }
          
          // Check both completed_at and end_time using OR condition
          // PostgREST OR syntax: condition1,condition2
          // We want jobs where either completed_at OR end_time is in the date range
          // Use .lt() with start of next day to ensure we capture all jobs within the day
          // Simplified: Just check if either field is in the date range (nulls will be excluded by .gte/.lt)
          if (startISO && nextDayISO) {
            query = query
              .eq('status', 'COMPLETED')
              .or(`and(completed_at.gte.${startISO},completed_at.lt.${nextDayISO}),and(end_time.gte.${startISO},end_time.lt.${nextDayISO})`);
          } else {
            query = query.eq('status', 'COMPLETED');
          }
        } else {
          // No date filter for this status, use normal status filter
          query = query.in('status', statuses);
        }
      } else {
        // No date filter, use normal status filter
        query = query.in('status', statuses);
      }

      query = applyAdminCompletedListFilters(query, listFilters);

      const completedOnly = statuses.length === 1 && statuses[0] === 'COMPLETED';
      const deniedCancelledList =
        statuses.includes('DENIED') && statuses.includes('CANCELLED');
      if (completedOnly) {
        query = query
          .order('completed_at', { ascending: false, nullsFirst: false })
          .order('end_time', { ascending: false, nullsFirst: false });
      } else if (deniedCancelledList) {
        query = query
          .order('denied_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const { data, error, count } = await query.range(from, to);

      return { 
        data: data || [], 
        error, 
        count: count || 0,
        page,
        pageSize,
        totalPages: count ? Math.ceil(count / pageSize) : 0
      };
    },

    /**
     * Slim paginated jobs list (low-egress).
     * - Avoids `jobs.*` (which includes photo arrays / large payload fields)
     * - Avoids customer `address/location/notes` JSON
     * Use this for list views like Admin COMPLETED/CANCELLED where full detail isn't needed.
     */
    async getByStatusPaginatedSlim(
      statuses: string[],
      page: number = 1,
      pageSize: number = 20,
      dateFilter?: string | { startDate: string; endDate: string },
      opts?: {
        includePhotoFields?: boolean;
        completedByUserId?: string;
        serviceSubTypeIn?: string[];
        leadRequirementsContainVariants?: string[];
        /** When true, drop `requirements` jsonb from rows (admin “minimal” list; details on demand). */
        omitRequirements?: boolean;
        /** Prefer Postgres `estimated` count for faster pagination metadata (slight variance vs `exact` on huge tables). */
        countMode?: 'exact' | 'estimated' | 'planned';
      }
    ) {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const isCompletedOnly = statuses.length === 1 && statuses[0] === 'COMPLETED';
      const needsDenialCols = statuses.includes('DENIED') || statuses.includes('CANCELLED');
      const countPref = opts?.countMode ?? 'estimated';

      const jobColList: string[] = [
        'id',
        'job_number',
        'customer_id',
        'status',
        'priority',
        'service_type',
        'service_sub_type',
        'service_brand',
        'scheduled_date',
        'scheduled_time_slot',
        'created_at',
        'updated_at',
        'completed_at',
        'end_time',
        'assigned_technician_id',
        'completed_by',
        'payment_amount',
        'actual_cost',
        'estimated_cost',
        'lead_cost',
        'parts_cost_total',
        'payment_method',
        'service_address',
        'service_location',
        'assigned_by',
        'assigned_date',
        'completion_notes',
      ];

      if (!isCompletedOnly) {
        jobColList.push(
          'team_members',
          'follow_up_date',
          'follow_up_time',
          'follow_up_notes',
          'follow_up_scheduled_by',
          'follow_up_scheduled_at'
        );
      }
      if (needsDenialCols) {
        jobColList.push('denied_at', 'denial_reason');
      }
      if (!isCompletedOnly || !opts?.omitRequirements) {
        jobColList.push('description');
      }
      if (!opts?.omitRequirements) {
        jobColList.push('requirements');
      }
      if (opts?.includePhotoFields) {
        jobColList.push('before_photos', 'after_photos', 'images');
      }
      // Completed list: photos via enrichJobsWithAfterPhotosIfNeeded / loadCompletedJobDetails (not paginated rows).
      const jobCols = jobColList.join(',');

      const customerColsSlim = [
        'id',
        'customer_id',
        'full_name',
        'phone',
        'alternate_phone',
        'email',
        'visible_address',
        'service_type',
        'brand',
        'model',
        'last_service_date',
        'has_prefilter',
        'has_google_review',
        'customer_tier',
        'raw_water_tds',
      ];
      const customerColsFat = [
        ...customerColsSlim,
        'address',
        'location',
        'notes',
        'installation_date',
        'warranty_expiry',
        'status',
        'customer_since',
        'preferred_time_slot',
        'preferred_language',
        'created_at',
        'updated_at',
      ];
      const customerCols = (opts?.includePhotoFields ? customerColsFat : customerColsSlim).join(',');

      let query = supabase
        .from('jobs')
        .select(`${jobCols},customer:customers(${customerCols})`, { count: countPref });

      if (dateFilter) {
        const hasRangeObject = typeof dateFilter === 'object' && !!(dateFilter as any).startDate && !!(dateFilter as any).endDate;
        const singleDate = typeof dateFilter === 'string' ? dateFilter : undefined;
        const rangeStartDate = hasRangeObject ? (dateFilter as any).startDate : undefined;
        const rangeEndDate = hasRangeObject ? (dateFilter as any).endDate : undefined;

        if (statuses.includes('DENIED')) {
          if (statuses.includes('CANCELLED')) {
            if (singleDate) {
              const { startISO, nextISO } = jobLocalDayBounds(singleDate);
              query = query.or(`and(status.eq.DENIED,denied_at.gte.${startISO},denied_at.lt.${nextISO}),status.eq.CANCELLED`);
            } else {
              query = query.in('status', statuses);
            }
          } else {
            if (singleDate) {
              const { startISO, nextISO } = jobLocalDayBounds(singleDate);
              query = query.eq('status', 'DENIED').gte('denied_at', startISO).lt('denied_at', nextISO);
            } else {
              query = query.eq('status', 'DENIED');
            }
          }
        } else if (statuses.includes('COMPLETED')) {
          let startISO: string | null = null;
          let nextDayISO: string | null = null;

          if (singleDate) {
            const bounds = jobLocalDayBounds(singleDate);
            startISO = bounds.startISO;
            nextDayISO = bounds.nextISO;
          } else if (rangeStartDate && rangeEndDate) {
            const startBounds = jobLocalDayBounds(rangeStartDate);
            const endBounds = jobLocalDayBounds(rangeEndDate);
            startISO = startBounds.startISO;
            nextDayISO = endBounds.nextISO;
          }

          if (startISO && nextDayISO) {
            query = query
              .eq('status', 'COMPLETED')
              .or(`and(completed_at.gte.${startISO},completed_at.lt.${nextDayISO}),and(end_time.gte.${startISO},end_time.lt.${nextDayISO})`);
          } else {
            query = query.eq('status', 'COMPLETED');
          }
        } else {
          query = query.in('status', statuses);
        }
      } else {
        query = query.in('status', statuses);
      }

      query = applyAdminCompletedListFilters(query, {
        completedByUserId: opts?.completedByUserId,
        serviceSubTypeIn: opts?.serviceSubTypeIn,
        leadRequirementsContainVariants: opts?.leadRequirementsContainVariants,
      });

      const deniedCancelledList =
        statuses.includes('DENIED') && statuses.includes('CANCELLED');
      if (isCompletedOnly) {
        query = query
          .order('completed_at', { ascending: false, nullsFirst: false })
          .order('end_time', { ascending: false, nullsFirst: false });
      } else if (deniedCancelledList) {
        query = query
          .order('denied_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const { data, error, count } = await query.range(from, to);

      return {
        data: data || [],
        error,
        count: count || 0,
        page,
        pageSize,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      };
    },

    /** Minimal fetch for follow-up glow: only jobs with follow_up_date today or tomorrow (local date). Returns id, status, follow_up_date only. */
    async getFollowUpForGlow() {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
      const { data, error } = await supabase
        .from('jobs')
        .select('id, status, follow_up_date')
        .in('status', ['FOLLOW_UP', 'RESCHEDULED'])
        .in('follow_up_date', [todayStr, tomorrowStr])
        .limit(200);
      return { data: data || [], error };
    },

    /**
     * Promote follow-up jobs whose follow_up_date is today or earlier to ongoing (PENDING).
     * Mirrors manual "Move to ongoing" — clears follow-up fields and assignment.
     */
    async promoteDueFollowUpsToOngoing(asOfDate?: string) {
      const { getLocalTodayYmd, buildPromoteFollowUpJobPatch } = await import('@/lib/followUpToOngoing');
      const today = asOfDate || getLocalTodayYmd();

      const { data, error } = await supabase
        .from('jobs')
        .select('id, follow_up_date, follow_up_time, requirements')
        .in('status', ['FOLLOW_UP', 'RESCHEDULED'])
        .not('follow_up_date', 'is', null)
        .lte('follow_up_date', today)
        .limit(100);

      if (error) return { promoted: 0, jobIds: [] as string[], error };
      if (!data?.length) return { promoted: 0, jobIds: [] as string[], error: null };

      const jobIds: string[] = [];
      for (const row of data) {
        const patch = buildPromoteFollowUpJobPatch(row);
        if (!patch) continue;
        const { error: updateError } = await supabase.from('jobs').update(patch).eq('id', row.id);
        if (!updateError) jobIds.push(row.id);
      }

      if (jobIds.length > 0) {
        cacheInvalidate('job_counts_v1');
      }

      return { promoted: jobIds.length, jobIds, error: null };
    },

    /** Analytics only: selective columns. Omit `limit` to fetch every job (paginated). Pass `limit` for capped on-demand reports. */
    async getForAnalytics(limit?: number) {
      const cols = ANALYTICS_JOB_COLUMNS;

      if (limit != null && limit > 0) {
        const { data, error } = await supabase
          .from('jobs')
          .select(cols)
          .order('created_at', { ascending: false })
          .limit(limit);
        return { data: data || [], error };
      }

      return fetchAnalyticsPages((from, to) =>
        supabase
          .from('jobs')
          .select(cols)
          .order('created_at', { ascending: false })
          .range(from, to)
      );
    },

    /**
     * Analytics in date range: fetches only jobs in range (DB-side filter). Much less egress than getForAnalytics + JS filter.
     * - Completed jobs: completion date (end_time or completed_at) in [startDate, endDate]
     * - Other jobs: created_at in [startDate, endDate]
     */
    async getForAnalyticsInRange(startDate: Date, endDate: Date) {
      const cols = ANALYTICS_JOB_COLUMNS;
      const startISO = startDate.toISOString();
      const endISO = endDate.toISOString();
      const completedFilter = buildCompletedJobsDateOrFilter(startISO, endISO);

      const [completedRes, otherRes] = await Promise.all([
        fetchAnalyticsPages((from, to) =>
          supabase
            .from('jobs')
            .select(cols)
            .eq('status', 'COMPLETED')
            .or(completedFilter)
            .order('created_at', { ascending: false })
            .range(from, to)
        ),
        fetchAnalyticsPages((from, to) =>
          supabase
            .from('jobs')
            .select(cols)
            .neq('status', 'COMPLETED')
            .gte('created_at', startISO)
            .lte('created_at', endISO)
            .order('created_at', { ascending: false })
            .range(from, to)
        ),
      ]);

      if (completedRes.error) return { data: [], error: completedRes.error };
      if (otherRes.error) return { data: [], error: otherRes.error };

      const completed = completedRes.data || [];
      const other = otherRes.data || [];
      const combined = [...completed, ...other].sort((a: any, b: any) => {
        const aAt = a.created_at || '';
        const bAt = b.created_at || '';
        return bAt.localeCompare(aAt);
      });
      return { data: combined, error: null };
    },

    async getCompletedJobsForTrendDrilldown(startDate: Date, endDate: Date) {
      const startISO = startDate.toISOString();
      const endISO = endDate.toISOString();
      const completedFilter = buildCompletedJobsDateOrFilter(startISO, endISO);

      return fetchAnalyticsPages((from, to) =>
        supabase
          .from('jobs')
          .select(TREND_DRILLDOWN_JOB_COLUMNS)
          .eq('status', 'COMPLETED')
          .or(completedFilter)
          .order('end_time', { ascending: false, nullsFirst: false })
          .order('completed_at', { ascending: false })
          .range(from, to)
      );
    },

    async getCompletedJobsForLeadBreakdownInRange(startDate: Date, endDate: Date) {
      const startISO = startDate.toISOString();
      const endISO = endDate.toISOString();
      const completedFilter = buildCompletedJobsDateOrFilter(startISO, endISO);

      return fetchAnalyticsPages((from, to) =>
        supabase
          .from('jobs')
          .select(LEAD_BREAKDOWN_JOB_COLUMNS)
          .eq('status', 'COMPLETED')
          .or(completedFilter)
          .order('created_at', { ascending: false })
          .range(from, to)
      );
    },

    /** All completed jobs for lead-source breakdown (all-time analytics). */
    async getCompletedJobsForLeadBreakdown() {
      return fetchAnalyticsPages((from, to) =>
        supabase
          .from('jobs')
          .select(LEAD_BREAKDOWN_JOB_COLUMNS)
          .eq('status', 'COMPLETED')
          .order('created_at', { ascending: false })
          .range(from, to)
      );
    },

    /**
     * Completed jobs for billing stats — same completion-date filter as Analytics (end_time, else completed_at).
     */
    async getCompletedJobsForBillingInRange(startDate: Date, endDate: Date) {
      const startISO = startDate.toISOString();
      const endISO = endDate.toISOString();
      const completedFilter = buildCompletedJobsDateOrFilter(startISO, endISO);

      return fetchAnalyticsPages((from, to) =>
        supabase
          .from('jobs')
          .select(`
            id,
            job_number,
            requirements,
            payment_amount,
            actual_cost,
            payment_method,
            status,
            assigned_technician_id,
            lead_cost,
            parts_cost_total,
            completed_at,
            end_time,
            technician:technicians(
              id,
              full_name,
              employee_id
            ),
            customer:customers(
              id,
              customer_id,
              full_name
            )
          `)
          .eq('status', 'COMPLETED')
          .or(completedFilter)
          .order('created_at', { ascending: false })
          .range(from, to)
      );
    },

    /**
     * Same date logic as `getForAnalyticsInRange`, but only columns needed for Direct/Website conversion attribution (smaller egress).
     */
    async getForConversionAnalyticsInRange(startDate: Date, endDate: Date, limit: number = 15000) {
      const cols = ANALYTICS_CONVERSION_JOB_COLUMNS;
      const startISO = startDate.toISOString();
      const endISO = endDate.toISOString();
      const lim = Math.min(Math.max(1, limit), 15000);

      const [completedRes, otherRes] = await Promise.all([
        supabase
          .from('jobs')
          .select(cols)
          .eq('status', 'COMPLETED')
          .or(buildCompletedJobsDateOrFilter(startISO, endISO))
          .order('created_at', { ascending: false })
          .limit(lim),
        supabase
          .from('jobs')
          .select(cols)
          .neq('status', 'COMPLETED')
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .order('created_at', { ascending: false })
          .limit(lim)
      ]);

      if (completedRes.error) return { data: [], error: completedRes.error };
      if (otherRes.error) return { data: [], error: otherRes.error };

      const completed = completedRes.data || [];
      const other = otherRes.data || [];
      const combined = [...completed, ...other].sort((a: any, b: any) => {
        const aAt = a.created_at || '';
        const bAt = b.created_at || '';
        return bAt.localeCompare(aAt);
      });
      return { data: combined, error: null };
    },

    /**
     * Jobs strictly before `beforeDate` for attribution (first-touch before period). No payment columns — minimal egress.
     * Merge client-side with `getForConversionAnalyticsInRange` by job `id`.
     */
    async getPriorJobsForConversionSlim(customerIds: string[], beforeDate: Date) {
      const cols = [
        'id',
        'customer_id',
        'status',
        'created_at',
        'completed_at',
        'end_time',
        'lead_source',
        'assigned_by',
        'assigned_technician_id',
        'service_sub_type',
      ].join(', ');
      const unique = [...new Set((customerIds || []).filter(Boolean))];
      if (unique.length === 0) return { data: [], error: null };

      const beforeISO = beforeDate.toISOString();
      const chunkSize = 100;
      const chunks: string[][] = [];
      for (let i = 0; i < unique.length; i += chunkSize) {
        chunks.push(unique.slice(i, i + chunkSize));
      }
      const byId = new Map<string, Record<string, unknown>>();
      const chunkResults = await Promise.all(
        chunks.map((chunk) =>
          supabase.from('jobs').select(cols).in('customer_id', chunk).lt('created_at', beforeISO)
        )
      );
      for (const { data, error } of chunkResults) {
        if (error) return { data: [], error };
        for (const row of data || []) {
          const r = row as Record<string, unknown>;
          const id = r.id as string | undefined;
          if (id) byId.set(id, r);
        }
      }
      return { data: [...byId.values()], error: null };
    },

    /**
     * Recent jobs with conversion-only columns (all-time conversion report). Much smaller than `getForAnalytics`.
     */
    async getForConversionAnalyticsRecent(limit: number = 5000) {
      const cols = ANALYTICS_CONVERSION_JOB_COLUMNS;
      const { data, error } = await supabase
        .from('jobs')
        .select(cols)
        .order('created_at', { ascending: false })
        .limit(Math.min(Math.max(1, limit), 15000));
      return { data: data || [], error };
    },

    /**
     * Slim per-job rows for repeat-vs-new customer analysis within a date range.
     * Only the columns needed to bucket customers by month and sum revenue (minimal egress).
     */
    async getCustomerActivityInRange(startDate: Date, endDate: Date) {
      const cols = 'customer_id, created_at, status, payment_amount, actual_cost';
      const startISO = startDate.toISOString();
      const endISO = endDate.toISOString();
      const { data, error } = await supabase
        .from('jobs')
        .select(cols)
        .gte('created_at', startISO)
        .lte('created_at', endISO)
        .not('customer_id', 'is', null)
        .order('created_at', { ascending: true });
      return { data: data || [], error };
    },

    /**
     * Returns the subset of `customerIds` that had at least one job strictly before `beforeDate`.
     * Selects only customer_id (chunked) for minimal egress.
     */
    async getReturningCustomerIds(
      customerIds: string[],
      beforeDate: Date
    ): Promise<{ data: string[]; error: any }> {
      const unique = [...new Set((customerIds || []).filter(Boolean))];
      if (unique.length === 0) return { data: [], error: null };

      const beforeISO = beforeDate.toISOString();
      const chunkSize = 100;
      const chunks: string[][] = [];
      for (let i = 0; i < unique.length; i += chunkSize) {
        chunks.push(unique.slice(i, i + chunkSize));
      }
      const returning = new Set<string>();
      const chunkResults = await Promise.all(
        chunks.map((chunk) =>
          supabase.from('jobs').select('customer_id').in('customer_id', chunk).lt('created_at', beforeISO)
        )
      );
      for (const { data, error } of chunkResults) {
        if (error) return { data: [], error };
        for (const row of data || []) {
          const cid = (row as Record<string, unknown>).customer_id as string | undefined;
          if (cid) returning.add(cid);
        }
      }
      return { data: [...returning], error: null };
    },

    /**
     * All-time slim customer activity (recent N jobs) for repeat-vs-new trends. Minimal columns.
     */
    async getCustomerActivitySlimRecent(limit: number = 8000) {
      const cols = 'customer_id, created_at, status, payment_amount, actual_cost';
      const { data, error } = await supabase
        .from('jobs')
        .select(cols)
        .not('customer_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(Math.min(Math.max(1, limit), 15000));
      return { data: data || [], error };
    },

    /**
     * Jobs created in range only (minimal columns). Used for return-complaints so we don't need full getForAnalytics.
     */
    async getJobsCreatedInRange(startDate: Date, endDate: Date) {
      const cols = 'id,customer_id,status,created_at,service_sub_type,assigned_technician_id,end_time,completed_at,job_number';
      const startISO = startDate.toISOString();
      const endISO = endDate.toISOString();
      const { data, error } = await supabase
        .from('jobs')
        .select(cols)
        .gte('created_at', startISO)
        .lte('created_at', endISO)
        .order('created_at', { ascending: false });
      return { data: data || [], error };
    },

    /**
     * Job locations for heat map: id, created_at, service_location, and customer address (for area/one-word fallback).
     * Optional date range (created_at). Limit 3000. Use service_location lat/lng when present; else geocode address.area.
     */
    async getJobLocationsForHeatmap(startDate?: Date, endDate?: Date) {
      const select = 'id,created_at,service_location,customer:customers(address)';
      let query = supabase
        .from('jobs')
        .select(select)
        .order('created_at', { ascending: false })
        .limit(3000);
      if (startDate) {
        query = query.gte('created_at', startDate.toISOString());
      }
      if (endDate) {
        query = query.lte('created_at', endDate.toISOString());
      }
      const { data, error } = await query;
      return { data: data || [], error };
    },

    /**
     * Jobs in range (or all) with customer location and TDS for Analytics "Top locations".
     * Same date logic as getForAnalyticsInRange when startDate/endDate provided; when omitted, returns up to 5000 jobs (no date filter).
     */
    async getJobsWithCustomerLocationInRange(startDate?: Date, endDate?: Date) {
      const cols = 'id,customer_id,status,created_at,completed_at,end_time,service_sub_type,payment_amount,actual_cost,job_number';
      const select = `${cols},customer:customers(visible_address,raw_water_tds,address)`;
      const limit = 5000;

      if (startDate && endDate) {
        const startISO = startDate.toISOString();
        const endISO = endDate.toISOString();
        const [completedRes, otherRes] = await Promise.all([
          supabase
            .from('jobs')
            .select(select)
            .eq('status', 'COMPLETED')
            .or(`and(end_time.gte.${startISO},end_time.lte.${endISO}),and(end_time.is.null,completed_at.gte.${startISO},completed_at.lte.${endISO})`)
            .order('created_at', { ascending: false })
            .limit(limit),
          supabase
            .from('jobs')
            .select(select)
            .neq('status', 'COMPLETED')
            .gte('created_at', startISO)
            .lte('created_at', endISO)
            .order('created_at', { ascending: false })
            .limit(limit)
        ]);
        if (completedRes.error) return { data: [], error: completedRes.error };
        if (otherRes.error) return { data: [], error: otherRes.error };
        const completed = completedRes.data || [];
        const other = otherRes.data || [];
        const combined = [...completed, ...other].sort((a: { created_at?: string | null }, b: { created_at?: string | null }) => {
          const aAt = a.created_at || '';
          const bAt = b.created_at || '';
          return bAt.localeCompare(aAt);
        });
        return { data: combined, error: null };
      }

      const { data, error } = await supabase
        .from('jobs')
        .select(select)
        .order('created_at', { ascending: false })
        .limit(limit);
      return { data: data || [], error };
    },

    /**
     * Jobs in range (or all) with customer/job brand for Analytics "Top brands".
     * Same date logic as getForAnalyticsInRange when startDate/endDate provided; when omitted, returns up to 5000 jobs.
     */
    async getJobsWithCustomerBrandInRange(startDate?: Date, endDate?: Date) {
      const cols = 'id,customer_id,status,created_at,completed_at,end_time,service_sub_type,payment_amount,actual_cost,brand,job_number';
      const select = `${cols},customer:customers(brand)`;
      const limit = 5000;

      if (startDate && endDate) {
        const startISO = startDate.toISOString();
        const endISO = endDate.toISOString();
        const [completedRes, otherRes] = await Promise.all([
          supabase
            .from('jobs')
            .select(select)
            .eq('status', 'COMPLETED')
            .or(`and(end_time.gte.${startISO},end_time.lte.${endISO}),and(end_time.is.null,completed_at.gte.${startISO},completed_at.lte.${endISO})`)
            .order('created_at', { ascending: false })
            .limit(limit),
          supabase
            .from('jobs')
            .select(select)
            .neq('status', 'COMPLETED')
            .gte('created_at', startISO)
            .lte('created_at', endISO)
            .order('created_at', { ascending: false })
            .limit(limit)
        ]);
        if (completedRes.error) return { data: [], error: completedRes.error };
        if (otherRes.error) return { data: [], error: otherRes.error };
        const completed = completedRes.data || [];
        const other = otherRes.data || [];
        const combined = [...completed, ...other].sort((a: { created_at?: string | null }, b: { created_at?: string | null }) => {
          const aAt = a.created_at || '';
          const bAt = b.created_at || '';
          return bAt.localeCompare(aAt);
        });
        return { data: combined, error: null };
      }

      const { data, error } = await supabase
        .from('jobs')
        .select(select)
        .order('created_at', { ascending: false })
        .limit(limit);
      return { data: data || [], error };
    },

    /**
     * Completed jobs only, minimal columns. For return-complaints lookup (find previous completed job per customer). Lower egress than getForAnalytics.
     */
    async getCompletedJobsForReturnComplaintLookup(limit: number = 5000) {
      const cols = 'id,customer_id,assigned_technician_id,end_time,completed_at';
      const { data, error } = await supabase
        .from('jobs')
        .select(cols)
        .eq('status', 'COMPLETED')
        .order('end_time', { ascending: false })
        .limit(limit);
      return { data: data || [], error };
    },

    /** Completed jobs for filter dropdown options (not paginated). */
    async getCompletedJobsFilterSource(
      dateFilter?: string | { startDate: string; endDate: string },
      limit: number = 5000
    ) {
      let query = supabase
        .from('jobs')
        .select('id,requirements,service_sub_type,completed_by,completed_at,end_time')
        .eq('status', 'COMPLETED')
        .order('completed_at', { ascending: false, nullsFirst: false })
        .order('end_time', { ascending: false, nullsFirst: false })
        .limit(limit);

      if (dateFilter) {
        let startISO: string | null = null;
        let nextDayISO: string | null = null;
        if (typeof dateFilter === 'string') {
          const bounds = jobLocalDayBounds(dateFilter);
          startISO = bounds.startISO;
          nextDayISO = bounds.nextISO;
        } else if (dateFilter.startDate && dateFilter.endDate) {
          const startBounds = jobLocalDayBounds(dateFilter.startDate);
          const endBounds = jobLocalDayBounds(dateFilter.endDate);
          startISO = startBounds.startISO;
          nextDayISO = endBounds.nextISO;
        }
        if (startISO && nextDayISO) {
          query = query.or(`and(completed_at.gte.${startISO},completed_at.lt.${nextDayISO}),and(end_time.gte.${startISO},end_time.lt.${nextDayISO})`);
        }
      }

      const { data, error } = await query;
      return { data: data || [], error };
    },

    // Get ongoing jobs (PENDING, ASSIGNED, IN_PROGRESS). Limit 100 to cap egress if count grows.
    async getOngoing(limit: number = 100) {
      const run = async () => {
        const ongoingSelect = `${jobSelectOngoingAndTech()},customer:customers(${CUSTOMER_EMBED_FOR_ONGOING_ADMIN})`;
        return supabase
          .from('jobs')
          .select(ongoingSelect)
          .in('status', ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'])
          .order('created_at', { ascending: false })
          .limit(limit);
      };

      let { data: rows, error: err } = await run();
      if (err && isMissingVisitOrderColumnError(err)) {
        markVisitOrderColumnMissing();
        ({ data: rows, error: err } = await run());
      }

      if (err || !rows?.length) {
        return { data: rows || [], error: err };
      }

      const { data: photoRows, error: photoErr } = await this.getPhotoFieldsForJobIds(rows.map((r: any) => r.id));
      if (photoErr || !photoRows?.length) {
        return { data: rows, error: null };
      }
      return { data: mergeJobPhotoFieldsIntoRows(rows, photoRows as Record<string, unknown>[]), error: null };
    }
  },
  
  // Technician operations
  technicians: {
    async create(technician: Database['public']['Tables']['technicians']['Insert']) {
      const { data, error } = await supabase
        .from('technicians')
        .insert(technician as Record<string, unknown>)
        .select(TECHNICIAN_ROW_COLUMNS)
        .single();

      return { data, error };
    },

    async getById(id: string) {
      const { data, error } = await supabase
        .from('technicians')
        .select(TECHNICIAN_ROW_COLUMNS)
        .eq('id', id)
        .single();

      return { data, error };
    },

    /**
     * Admin-only single-row fetch including `salary` (returned via SECURITY DEFINER RPC).
     * For tech self lookup or non-salary admin paths, use `getById` instead.
     */
    async getByIdForAdmin(id: string) {
      const { data, error } = await supabase.rpc('get_technician_for_admin', { p_id: id } as any);
      if (error) return { data: null, error };
      const rows = (data ?? []) as unknown[];
      const row = Array.isArray(rows) ? (rows[0] ?? null) : (rows as unknown);
      return { data: row, error: null };
    },

    /**
     * Admin list including `salary` — uses `get_technicians_for_admin` SECURITY DEFINER RPC.
     * @param activeRosterOnly When true, excludes INACTIVE. When false or omitted, returns everyone (Settings, analytics, salary name lookup, duplicate checks).
     */
    async getAll(limit?: number, options?: { activeRosterOnly?: boolean }) {
      const activeOnly = options?.activeRosterOnly === true;
      const { data, error } = await supabase.rpc('get_technicians_for_admin');
      if (error) return { data: null, error };

      const raw = (data ?? []) as unknown[];
      let rows: any[] = Array.isArray(raw) ? raw.slice() : [];
      if (activeOnly) {
        rows = rows.filter((t: any) => {
          const status = t?.account_status;
          return status == null || status === 'ACTIVE' || status === 'SUSPENDED';
        });
      }
      rows.sort((a: any, b: any) => {
        const aTime = a?.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b?.created_at ? new Date(b.created_at).getTime() : 0;
        return bTime - aTime;
      });
      if (limit && limit > 0) {
        rows = rows.slice(0, limit);
      }
      return { data: rows, error: null };
    },

    /** Admin list without live GPS blob — use `getById` / `reload` / measure-distance refresh for `current_location`. */
    async getAllForDashboard(limit?: number, options?: { activeRosterOnly?: boolean }) {
      const activeOnly = options?.activeRosterOnly !== false;
      const { data, error } = await supabase.rpc('get_technicians_for_admin');
      if (error) return { data: null, error };

      const raw = (data ?? []) as unknown[];
      let rows: any[] = Array.isArray(raw) ? raw.slice() : [];
      if (activeOnly) {
        rows = rows.filter((t: any) => {
          const status = t?.account_status;
          return status == null || status === 'ACTIVE' || status === 'SUSPENDED';
        });
      }
      rows.sort((a: any, b: any) => {
        const aTime = a?.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b?.created_at ? new Date(b.created_at).getTime() : 0;
        return bTime - aTime;
      });
      if (limit && limit > 0) {
        rows = rows.slice(0, limit);
      }
      // Strip live GPS blob to mirror previous TECHNICIAN_DASHBOARD_COLUMNS shape.
      rows = rows.map((t: any) => {
        if (!t || typeof t !== 'object') return t;
        const { current_location: _ignore, ...rest } = t;
        return rest;
      });
      return { data: rows, error: null };
    },

    /** Analytics-only roster: id, name, salary fields — no phone/GPS/photo. Falls back to getAllForDashboard. */
    async getAllForAnalytics(limit?: number, options?: { activeRosterOnly?: boolean }) {
      const activeOnly = options?.activeRosterOnly !== false;
      const { data, error } = await supabase.rpc('get_technicians_for_analytics');
      if (error) {
        if (isRpcNotFoundError(error) || /not authorized/i.test(error.message || '')) {
          return db.technicians.getAllForDashboard(limit, options);
        }
        return { data: null, error };
      }

      let rows: any[] = Array.isArray(data) ? data.slice() : [];
      if (activeOnly) {
        rows = rows.filter((t: any) => {
          const status = t?.account_status;
          return status == null || status === 'ACTIVE' || status === 'SUSPENDED';
        });
      }
      rows.sort((a: any, b: any) => {
        const aTime = a?.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b?.created_at ? new Date(b.created_at).getTime() : 0;
        return bTime - aTime;
      });
      if (limit && limit > 0) {
        rows = rows.slice(0, limit);
      }
      return { data: rows, error: null };
    },

    /**
     * Slim list for dropdowns.
     * @param activeRosterOnly When true (default), excludes INACTIVE. Set false for payments/reports that must list former technicians.
     */
    async getList(limit?: number, options?: { activeRosterOnly?: boolean }) {
      const activeOnly = options?.activeRosterOnly !== false;
      let query = supabase
        .from('technicians')
        .select('id, full_name, phone, employee_id, status, account_status')
        .order('created_at', { ascending: false });
      if (activeOnly) {
        query = query.or(TECHNICIAN_ROSTER_ACTIVE_OR);
      }
      if (limit && limit > 0) {
        query = query.limit(limit);
      }
      const { data, error } = await query;
      return { data, error };
    },

    /** Technician PWA: peer roster without GPS/salary (RLS-safe RPC). */
    async getRosterForTechnicianApp() {
      const { data, error } = await supabase.rpc('get_technician_roster_for_app');
      if (error && isRpcNotFoundError(error)) {
        if (import.meta.env.DEV) {
          console.warn(
            '[technicians] get_technician_roster_for_app missing — run scripts/patch-technician-roster-rpc.sql in Supabase'
          );
        }
        return { data: [] as Record<string, unknown>[], error: null };
      }
      return { data, error };
    },
    
    async getAvailable() {
      const { data, error } = await supabase.rpc('get_technicians_for_admin');
      if (error) return { data: null, error };

      const raw = (data ?? []) as unknown[];
      const rows: any[] = Array.isArray(raw) ? raw.slice() : [];
      const filtered = rows.filter((t: any) => {
        if (t?.status !== 'AVAILABLE') return false;
        const status = t?.account_status;
        return status == null || status === 'ACTIVE' || status === 'SUSPENDED';
      });
      filtered.sort((a: any, b: any) => {
        const aTime = a?.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b?.created_at ? new Date(b.created_at).getTime() : 0;
        return bTime - aTime;
      });
      return { data: filtered, error: null };
    },

    async update(id: string, updates: Database['public']['Tables']['technicians']['Update']) {
      const { data, error } = await supabase
        .from('technicians')
        .update(updates as Record<string, unknown>)
        .eq('id', id)
        .select(TECHNICIAN_ROW_COLUMNS);

      if (error) {
        return { data: null, error };
      }

      return { data: data?.[0] || null, error: null };
    },
    
    async delete(id: string) {
      const { error } = await supabase
        .from('technicians')
        .delete()
        .eq('id', id);
      
      return { data: null, error };
    }
  },

  // Job Assignment Request operations
  jobAssignmentRequests: {
    async create(request: Database['public']['Tables']['job_assignment_requests']['Insert']) {
      const { data, error } = await supabase
        .from('job_assignment_requests')
        .insert(request)
        .select()
        .single();
      
      return { data, error };
    },

    async createMultiple(requests: Database['public']['Tables']['job_assignment_requests']['Insert'][]) {
      const { data, error } = await supabase
        .from('job_assignment_requests')
        .insert(requests)
        .select();
      
      return { data, error };
    },

    async getById(id: string) {
      const { data, error } = await supabase
        .from('job_assignment_requests')
        .select(`
          ${JOB_ASSIGNMENT_REQUEST_ROW},
          job:jobs(
            id,
            job_number,
            service_type,
            service_sub_type,
            brand,
            model,
            scheduled_date,
            scheduled_time_slot,
            description,
            estimated_cost,
            priority,
            status,
            customer:customers(
              id,
              customer_id,
              full_name,
              phone,
              email,
              address,
              location
            )
          ),
          technician:technicians(
            id,
            full_name,
            phone,
            email,
            employee_id,
            status
          )
        `)
        .eq('id', id)
        .single();
      
      return { data, error };
    },

    async getByJobId(jobId: string) {
      const { data, error } = await supabase
        .from('job_assignment_requests')
        .select(`
          ${JOB_ASSIGNMENT_REQUEST_ROW},
          technician:technicians(
            id,
            full_name,
            phone,
            email,
            employee_id,
            status
          )
        `)
        .eq('job_id', jobId)
        .order('created_at', { ascending: false });
      
      return { data, error };
    },

    async getByTechnicianId(technicianId: string) {
      const { data, error } = await supabase
        .from('job_assignment_requests')
        .select(`
          ${JOB_ASSIGNMENT_REQUEST_ROW},
          job:jobs(
            id,
            job_number,
            service_type,
            service_sub_type,
            brand,
            model,
            scheduled_date,
            scheduled_time_slot,
            description,
            estimated_cost,
            priority,
            status,
            customer:customers(
              id,
              customer_id,
              full_name,
              phone,
              email,
              address,
              location
            )
          )
        `)
        .eq('technician_id', technicianId)
        .order('created_at', { ascending: false });
      
      return { data, error };
    },

    async getPendingByTechnicianId(technicianId: string) {
      const { data, error } = await supabase
        .from('job_assignment_requests')
        .select(`
          ${JOB_ASSIGNMENT_REQUEST_ROW},
          job:jobs(
            id,
            job_number,
            service_type,
            service_sub_type,
            brand,
            model,
            scheduled_date,
            scheduled_time_slot,
            description,
            estimated_cost,
            priority,
            status,
            service_address,
            service_location,
            customer:customers(
              id,
              customer_id,
              full_name,
              phone,
              email,
              visible_address,
              address,
              location
            )
          )
        `)
        .eq('technician_id', technicianId)
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });
      
      return { data, error };
    },

    async update(id: string, updates: Database['public']['Tables']['job_assignment_requests']['Update']) {
      const { data, error } = await supabase
        .from('job_assignment_requests')
        .update(updates)
        .eq('id', id)
        .select();
      
      if (error) {
        return { data: null, error };
      }
      
      // Return the first (and should be only) updated row
      return { data: data?.[0] || null, error: null };
    },

    async respondToRequest(requestId: string, status: 'ACCEPTED' | 'REJECTED', responseNotes?: string) {
      // First check if the request is still pending
      const { data: currentRequest, error: fetchError } = await supabase
        .from('job_assignment_requests')
        .select('status, job_id')
        .eq('id', requestId)
        .single();

      if (fetchError) {
        return { data: null, error: fetchError };
      }

      if (currentRequest.status !== 'PENDING') {
        return { 
          data: null, 
          error: { 
            message: 'This assignment request is no longer available. It may have been accepted by another technician.',
            code: 'ALREADY_PROCESSED'
          } 
        };
      }

      const { data, error } = await supabase
        .from('job_assignment_requests')
        .update({
          status,
          responded_at: new Date().toISOString(),
          response_notes: responseNotes
        })
        .eq('id', requestId)
        .eq('status', 'PENDING') // Only update if still pending
        .select();
      
      if (error) {
        return { data: null, error };
      }

      // If no rows were updated, it means the request was already processed
      if (!data || data.length === 0) {
        return { 
          data: null, 
          error: { 
            message: 'This assignment request is no longer available. It may have been accepted by another technician.',
            code: 'ALREADY_PROCESSED'
          } 
        };
      }
      
      return { data: data[0], error: null };
    },

    async delete(id: string) {
      const { error } = await supabase
        .from('job_assignment_requests')
        .delete()
        .eq('id', id);
      
      return { data: null, error };
    },

    async deleteByJobId(jobId: string) {
      const { error } = await supabase
        .from('job_assignment_requests')
        .delete()
        .eq('job_id', jobId);
      
      return { data: null, error };
    }
  },

  // Common QR Codes operations (for payment QR codes shared by all technicians)
  commonQrCodes: {
    async create(qrCode: {
      name: string;
      qr_code_url: string;
      upi_id?: string;
      payee_name?: string;
      phone?: string;
      dynamic_upi_enabled?: boolean;
    }) {
      const { data, error } = await supabase
        .from('common_qr_codes')
        .insert({
          name: qrCode.name,
          qr_code_url: qrCode.qr_code_url,
          upi_id: qrCode.upi_id ?? '',
          payee_name: qrCode.payee_name ?? '',
          phone: qrCode.phone ?? '',
          dynamic_upi_enabled: qrCode.dynamic_upi_enabled === true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      
      return { data, error };
    },
    
    async getAll() {
      const colsWithPhone =
        'id, name, qr_code_url, upi_id, payee_name, phone, dynamic_upi_enabled, created_at, updated_at';
      const colsNoPhone =
        'id, name, qr_code_url, upi_id, payee_name, dynamic_upi_enabled, created_at, updated_at';
      let { data, error } = await supabase
        .from('common_qr_codes')
        .select(colsWithPhone)
        .order('created_at', { ascending: false })
        .limit(50);

      // phone column added later — fall back if migration not applied yet
      if (error && /phone/i.test(String(error.message || error.code || ''))) {
        ({ data, error } = await supabase
          .from('common_qr_codes')
          .select(colsNoPhone)
          .order('created_at', { ascending: false })
          .limit(50));
      }

      return { data, error };
    },

    /** Fetch only names (minimal egress) for dropdowns */
    async getNames() {
      const { data, error } = await supabase
        .from('common_qr_codes')
        .select('name')
        .order('created_at', { ascending: false });
      return { data, error };
    },
    
    async update(
      id: string,
      updates: {
        name?: string;
        qr_code_url?: string;
        upi_id?: string;
        payee_name?: string;
        phone?: string;
        dynamic_upi_enabled?: boolean;
      }
    ) {
      const { data, error } = await supabase
        .from('common_qr_codes')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();
      
      return { data, error };
    },
    
    async delete(id: string) {
      const { error } = await supabase
        .from('common_qr_codes')
        .delete()
        .eq('id', id);
      
      return { data: null, error };
    }
  },

  // Technician Common QR (non-payment): QR shown below payment QR on technician app
  technicianCommonQr: {
    async create(qrCode: { name: string; qr_code_url: string }) {
      const { data, error } = await supabase
        .from('technician_common_qr')
        .insert({
          name: qrCode.name,
          qr_code_url: qrCode.qr_code_url,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      return { data, error };
    },
    async getAll() {
      const { data, error } = await supabase
        .from('technician_common_qr')
        .select('id, name, qr_code_url, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(50);
      return { data, error };
    },
    /** Settings list / assign checkboxes — names only (no image URL egress). */
    async getNames() {
      const { data, error } = await supabase
        .from('technician_common_qr')
        .select('id, name')
        .order('created_at', { ascending: false })
        .limit(50);
      return { data, error };
    },
    async getById(id: string) {
      const { data, error } = await supabase
        .from('technician_common_qr')
        .select('id, name, qr_code_url, created_at, updated_at')
        .eq('id', id)
        .single();
      return { data, error };
    },
    async update(id: string, updates: { name?: string; qr_code_url?: string }) {
      const { data, error } = await supabase
        .from('technician_common_qr')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();
      return { data, error };
    },
    async delete(id: string) {
      const { error } = await supabase
        .from('technician_common_qr')
        .delete()
        .eq('id', id);
      return { data: null, error };
    }
  },

  // Product QR Codes operations (for product verification QR codes)
  productQrCodes: {
    async create(qrCode: { name: string; qr_code_url: string; product_image_url?: string; product_name?: string; product_description?: string; product_mrp?: string }) {
      const { data, error } = await supabase
        .from('product_qr_codes')
        .insert({
          name: qrCode.name,
          qr_code_url: qrCode.qr_code_url,
          product_image_url: qrCode.product_image_url || null,
          product_name: qrCode.product_name || null,
          product_description: qrCode.product_description || null,
          product_mrp: qrCode.product_mrp || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      
      return { data, error };
    },
    
    async getAll() {
      const { data, error } = await supabase
        .from('product_qr_codes')
        .select('id, name, qr_code_url, product_image_url, product_name, product_description, product_mrp, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(50);
      
      return { data, error };
    },

    /** Settings list — names only (no image / product detail egress). */
    async getNames() {
      const { data, error } = await supabase
        .from('product_qr_codes')
        .select('id, name')
        .order('created_at', { ascending: false })
        .limit(50);

      return { data, error };
    },
    
    async getById(id: string) {
      const { data, error } = await supabase
        .from('product_qr_codes')
        .select(PRODUCT_QR_ROW_COLUMNS)
        .eq('id', id)
        .single();
      
      return { data, error };
    },
    
    async update(id: string, updates: { name?: string; qr_code_url?: string; product_image_url?: string; product_name?: string; product_description?: string; product_mrp?: string }) {
      const { data, error } = await supabase
        .from('product_qr_codes')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();
      
      return { data, error };
    },
    
    async delete(id: string) {
      const { error } = await supabase
        .from('product_qr_codes')
        .delete()
        .eq('id', id);
      
      return { data: null, error };
    }
  },
  
  // Tax Invoices operations
  taxInvoices: {
    async create(invoice: any) {
      const { data, error } = await supabase
        .from('tax_invoices')
        .insert({
          invoice_number: invoice.invoice_number,
          invoice_date: invoice.invoice_date,
          invoice_type: invoice.invoice_type,
          customer_id: invoice.customer_id || null,
          customer_name: invoice.customer_name,
          customer_address: invoice.customer_address,
          customer_phone: invoice.customer_phone,
          customer_email: invoice.customer_email,
          customer_gstin: invoice.customer_gstin,
          company_info: invoice.company_info,
          items: invoice.items,
          place_of_supply: invoice.place_of_supply?.trim() || null,
          place_of_supply_code: invoice.place_of_supply_code
            ? String(invoice.place_of_supply_code).padStart(2, '0').slice(-2)
            : null,
          is_intra_state: Boolean(invoice.is_intra_state),
          reverse_charge: invoice.reverse_charge || false,
          e_way_bill_no: invoice.e_way_bill_no,
          transport_mode: invoice.transport_mode,
          vehicle_no: invoice.vehicle_no,
          subtotal: invoice.subtotal,
          total_discount: invoice.total_discount || 0,
          service_charge: invoice.service_charge || 0,
          total_tax: invoice.total_tax,
          cgst: invoice.cgst || 0,
          sgst: invoice.sgst || 0,
          igst: invoice.igst || 0,
          round_off: invoice.round_off || 0,
          total_amount: invoice.total_amount,
          gst_breakup: invoice.gst_breakup,
          invoice_details: invoice.invoice_details,
          bank_details: invoice.bank_details,
          notes: invoice.notes || [],
          terms: invoice.terms,
          validity_note: invoice.validity_note,
          job_id: invoice.job_id || null,
          service_type: invoice.service_type
        })
        .select()
        .single();
      
      return { data, error };
    },

    /** Slim query for next preview invoice number — one row, invoice_number only. */
    async getLatestInvoiceNumberForPrefix(prefix: string) {
      const { data, error } = await supabase
        .from('tax_invoices')
        .select('invoice_number')
        .like('invoice_number', `${prefix}-%`)
        .order('created_at', { ascending: false })
        .limit(1);

      return { data: data?.[0]?.invoice_number ?? null, error };
    },
    
    async getAll(limit: number = 100, offset: number = 0) {
      let query = supabase
        .from('tax_invoices')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });
      
      // Always apply range to avoid Supabase default limit (1000 rows)
      // Use a high limit if limit is 0 or very large
      const effectiveLimit = limit <= 0 ? 100000 : (limit > 100000 ? 100000 : limit);
      query = query.range(offset, offset + effectiveLimit - 1);
      
      const { data, error, count } = await query;
      
      return { data, error, count };
    },
    
    // Optimized method for filtered and paginated queries
    async getFilteredPaginated(filters: {
      invoiceType?: 'ALL' | 'B2B' | 'B2C';
      dateFilter?: 'all' | 'custom' | 'month' | 'year';
      startDate?: string;
      endDate?: string;
      selectedMonth?: number;
      selectedYear?: number;
      searchQuery?: string;
      page?: number;
      pageSize?: number;
    }) {
      const { invoiceType, dateFilter, startDate, endDate, selectedMonth, selectedYear, searchQuery, page = 1, pageSize = 20 } = filters;
      
      let query = supabase
        .from('tax_invoices')
        .select('id, invoice_number, invoice_date, invoice_type, customer_name, customer_phone, customer_email, customer_gstin, total_amount, cgst, sgst, igst, is_intra_state, created_at', { count: 'exact' })
        .order('invoice_date', { ascending: false });
      
      // Filter by invoice type
      if (invoiceType && invoiceType !== 'ALL') {
        query = query.eq('invoice_type', invoiceType);
      }
      
      // Filter by date
      if (dateFilter === 'custom' && startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query = query.gte('invoice_date', start.toISOString()).lte('invoice_date', end.toISOString());
      } else if (dateFilter === 'month' && selectedMonth && selectedYear) {
        const monthStart = new Date(selectedYear, selectedMonth - 1, 1);
        const monthEnd = new Date(selectedYear, selectedMonth, 0, 23, 59, 59, 999);
        query = query.gte('invoice_date', monthStart.toISOString()).lte('invoice_date', monthEnd.toISOString());
      } else if (dateFilter === 'year' && selectedYear) {
        const yearStart = new Date(selectedYear, 0, 1);
        const yearEnd = new Date(selectedYear, 11, 31, 23, 59, 59, 999);
        query = query.gte('invoice_date', yearStart.toISOString()).lte('invoice_date', yearEnd.toISOString());
      }
      
      // Filter by search query
      if (searchQuery && searchQuery.trim()) {
        const queryLower = searchQuery.toLowerCase();
        query = query.or(`invoice_number.ilike.%${queryLower}%,customer_name.ilike.%${queryLower}%,customer_phone.ilike.%${queryLower}%,customer_email.ilike.%${queryLower}%,customer_gstin.ilike.%${queryLower}%`);
      }
      
      // Apply pagination
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);
      
      const { data, error, count } = await query;
      
      return { data, error, count };
    },
    
    async getByInvoiceNumber(invoiceNumber: string) {
      const { data, error } = await supabase
        .from('tax_invoices')
        .select(TAX_INVOICE_ROW_COLUMNS)
        .eq('invoice_number', invoiceNumber)
        .single();
      
      return { data, error };
    },
    
    async getByCustomerId(customerId: string) {
      const { data, error } = await supabase
        .from('tax_invoices')
        .select(TAX_INVOICE_ROW_COLUMNS)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });
      
      return { data, error };
    },
    
    async getNextInvoiceNumber() {
      const { data, error } = await supabase.rpc('get_next_invoice_number');
      if (error) {
        const msg = (error.message || '').toLowerCase();
        const generic =
          msg.includes('admin access') || msg.includes('42501')
            ? 'You do not have permission to create invoices.'
            : 'Could not generate invoice number. Please try again or contact support.';
        return { data: null, error: { ...error, message: generic } };
      }
      return { data, error };
    },
    
    async update(id: string, updates: any) {
      const { data, error } = await supabase
        .from('tax_invoices')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();
      
      return { data, error };
    },
    
    async delete(id: string) {
      const { data, error } = await supabase
        .from('tax_invoices')
        .delete()
        .eq('id', id)
        .select('id');

      if (error) {
        return { data: null, error };
      }

      if (!data?.length) {
        return {
          data: null,
          error: {
            message:
              'Invoice was not deleted. Database permission may be blocking delete — run scripts/secure-tax-invoices-rls.sql in Supabase (admin login required).',
            code: 'DELETE_NOT_APPLIED',
          } as { message: string; code: string },
        };
      }

      return { data, error: null };
    },
    
    async checkInvoiceNumberExists(invoiceNumber: string, excludeId?: string) {
      let query = supabase
        .from('tax_invoices')
        .select('id')
        .eq('invoice_number', invoiceNumber);
      
      if (excludeId) {
        query = query.neq('id', excludeId);
      }
      
      const { data, error } = await query.single();
      return { exists: !!data && !error, error };
    }
  },

  // Technician Payments operations
  technicianPayments: {
    async getAll() {
      const { data, error } = await supabase
        .from('technician_payments')
        .select(`
          *,
          technician:technicians(
            id,
            full_name,
            phone,
            email,
            employee_id
          ),
          job:jobs(
            id,
            job_number,
            service_type,
            service_sub_type,
            payment_amount,
            actual_cost,
            status
          )
        `)
        .order('created_at', { ascending: false });
      
      return { data, error };
    },

    async getByTechnicianId(technicianId: string) {
      const { data, error } = await supabase
        .from('technician_payments')
        .select(`
          *,
          job:jobs(
            id,
            job_number,
            service_type,
            service_sub_type,
            payment_amount,
            actual_cost,
            status
          )
        `)
        .eq('technician_id', technicianId)
        .order('created_at', { ascending: false });
      
      return { data, error };
    },

    async update(id: string, updates: any) {
      const { data, error } = await supabase
        .from('technician_payments')
        .update(updates)
        .eq('id', id)
        .select();
      
      return { data: data?.[0] || null, error };
    },

    async getSummary() {
      // Get summary stats for all technicians
      const { data, error } = await supabase
        .rpc('get_technician_payment_summary');
      
      return { data, error };
    },

    async createPaymentsForCompletedJobs() {
      // Call the backfill function to create payment records for completed jobs
      const { data, error } = await supabase
        .rpc('backfill_technician_payments');
      
      return { data, error };
    }
  },

  // AMC Contracts operations
  amcContracts: {
    async create(amc: {
      customer_id: string;
      job_id?: string | null;
      start_date: string;
      end_date: string;
      years: number;
      includes_prefilter: boolean;
      additional_info?: string | null;
      service_period_months?: number | null;
      given_by_technician_id?: string | null;
      service_brand?: 'hydrogenro' | 'elevenro' | null;
    }) {
      const insertBase = {
        customer_id: amc.customer_id,
        job_id: amc.job_id || null,
        start_date: amc.start_date,
        end_date: amc.end_date,
        years: amc.years,
        includes_prefilter: amc.includes_prefilter,
        additional_info: amc.additional_info || null,
        service_period_months: amc.service_period_months ?? null,
        given_by_technician_id: amc.given_by_technician_id || null,
        status: 'ACTIVE' as const,
      };

      const withBrand = {
        ...insertBase,
        ...(amc.service_brand ? { service_brand: amc.service_brand } : {}),
      };

      const renewExistingActiveAmcs = async (exceptId: string | null = null) => {
        let query = supabase
          .from('amc_contracts')
          .select('id')
          .eq('customer_id', amc.customer_id)
          .eq('status', 'ACTIVE');

        if (exceptId) {
          query = query.neq('id', exceptId);
        }

        const { data: existingAMCs } = await query;

        if (!existingAMCs?.length) return;

        const today = new Date().toISOString().split('T')[0];
        for (const existingAMC of existingAMCs) {
          const { data: existing } = await supabase
            .from('amc_contracts')
            .select('end_date')
            .eq('id', existingAMC.id)
            .single();

          const newStatus = existing && existing.end_date >= today ? 'RENEWED' : 'EXPIRED';
          await supabase.from('amc_contracts').update({ status: newStatus }).eq('id', existingAMC.id);
        }
      };

      const buildUpdatePayload = (branded: typeof withBrand) => {
        const payload: Record<string, unknown> = { ...branded };
        if (!amc.job_id) {
          delete payload.job_id;
        }
        if (!amc.given_by_technician_id) {
          delete payload.given_by_technician_id;
        }
        return payload;
      };

      const buildFallbackUpdatePayload = (base: typeof insertBase) => {
        const payload: Record<string, unknown> = { ...base };
        if (!amc.job_id) {
          delete payload.job_id;
        }
        if (!amc.given_by_technician_id) {
          delete payload.given_by_technician_id;
        }
        return payload;
      };

      const updateExisting = async (existingId: string) => {
        await renewExistingActiveAmcs(existingId);

        let updateResult = await supabase
          .from('amc_contracts')
          .update(buildUpdatePayload(withBrand))
          .eq('id', existingId)
          .select()
          .single();

        if (
          updateResult.error &&
          amc.service_brand &&
          isMissingServiceBrandColumnError(updateResult.error)
        ) {
          updateResult = await supabase
            .from('amc_contracts')
            .update(buildFallbackUpdatePayload(insertBase))
            .eq('id', existingId)
            .select()
            .single();
        }

        return { data: updateResult.data, error: updateResult.error, updated: true as const };
      };

      if (amc.job_id) {
        const { data: existingForJob, error: jobLookupErr } = await supabase
          .from('amc_contracts')
          .select('id')
          .eq('job_id', amc.job_id)
          .eq('status', 'ACTIVE')
          .maybeSingle();

        if (jobLookupErr) {
          return { data: null, error: jobLookupErr };
        }

        if (existingForJob?.id) {
          return updateExisting(existingForJob.id);
        }
      }

      const agreementNumber = parseAmcAgreementNumberFromAdditionalInfo(amc.additional_info);
      if (agreementNumber) {
        const target = normalizeAmcAgreementNumber(agreementNumber);
        const { data: activeRows, error: activeErr } = await supabase
          .from('amc_contracts')
          .select('id, additional_info, created_at')
          .eq('customer_id', amc.customer_id)
          .eq('status', 'ACTIVE')
          .order('created_at', { ascending: false });

        if (activeErr) {
          return { data: null, error: activeErr };
        }

        const existingByNumber = (activeRows || []).find((row) => {
          const num = parseAmcAgreementNumberFromAdditionalInfo(row.additional_info);
          return num && normalizeAmcAgreementNumber(num) === target;
        });

        if (existingByNumber?.id) {
          return updateExisting(existingByNumber.id);
        }
      }

      const { data: activeForToday, error: todayLookupErr } = await supabase
        .from('amc_contracts')
        .select('id, created_at')
        .eq('customer_id', amc.customer_id)
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false });

      if (todayLookupErr) {
        return { data: null, error: todayLookupErr };
      }

      const todayIst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const createdTodayRow = (activeForToday || []).find(
        (row) => row.created_at && amcCreatedOnIstDay(row.created_at, todayIst)
      );

      if (createdTodayRow?.id) {
        return updateExisting(createdTodayRow.id);
      }

      await renewExistingActiveAmcs();

      let result = await supabase.from('amc_contracts').insert(withBrand).select().single();

      if (result.error && amc.service_brand && isMissingServiceBrandColumnError(result.error)) {
        result = await supabase.from('amc_contracts').insert(insertBase).select().single();
      }

      return { data: result.data, error: result.error, updated: false as const };
    },

    async getByCustomerId(customerId: string) {
      const { data, error } = await supabase
        .from('amc_contracts')
        .select(AMC_CONTRACT_ROW_COLUMNS)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });
      
      return { data, error };
    },

    async getActiveByCustomerId(customerId: string) {
      const { data, error } = await supabase
        .from('amc_contracts')
        .select(AMC_CONTRACT_ROW_COLUMNS)
        .eq('customer_id', customerId)
        .eq('status', 'ACTIVE')
        .single();

      return { data, error };
    },

    /**
     * Lean active-AMC probe (just dates). Uses limit(1) instead of single() so a
     * customer with no AMC returns `null` without an error round-trip/log.
     */
    async getActiveSlimByCustomerId(customerId: string) {
      const { data, error } = await supabase
        .from('amc_contracts')
        .select('id, start_date, end_date')
        .eq('customer_id', customerId)
        .eq('status', 'ACTIVE')
        .order('end_date', { ascending: false, nullsFirst: false })
        .limit(1);
      return { data: data && data.length > 0 ? data[0] : null, error };
    },

    /**
     * Paginated AMC list for the AMC view UI.
     * Auto-generation (`createAMCServiceJobs`) does NOT use this — it queries all ACTIVE
     * contracts itself so list pagination cannot shrink or skip auto-create.
     */
    async getAll(
      limit: number = 100,
      offset: number = 0,
      options?: {
        /** UI filter by end_date vs today (not amc_contracts.status). */
        endDateStatus?: 'ALL' | 'ACTIVE' | 'EXPIRED';
        search?: string;
        /** YYYY-MM-DD; defaults to local calendar date when status filter is used. */
        todayYmd?: string;
      }
    ) {
      const endDateStatus = options?.endDateStatus ?? 'ALL';
      const searchRaw = (options?.search || '').trim();
      const todayYmd =
        options?.todayYmd ||
        (() => {
          const d = new Date();
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        })();

      // Sanitize for PostgREST .or() / ilike (commas break or-lists).
      const search = searchRaw.replace(/[%_,.()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

      let customerIdFilter: string[] | null = null;
      let technicianIdFilter: string[] | null = null;

      if (search) {
        const pattern = `%${search}%`;
        const quoted = `"${pattern.replace(/"/g, '')}"`;
        const [{ data: matchedCustomers, error: customerSearchError }, { data: matchedTechs, error: techSearchError }] =
          await Promise.all([
            supabase
              .from('customers')
              .select('id')
              .or(
                [
                  `full_name.ilike.${quoted}`,
                  `phone.ilike.${quoted}`,
                  `brand.ilike.${quoted}`,
                  `model.ilike.${quoted}`,
                  `visible_address.ilike.${quoted}`,
                  `customer_id.ilike.${quoted}`,
                ].join(',')
              )
              .limit(400),
            supabase.from('technicians').select('id').ilike('full_name', pattern).limit(50),
          ]);

        if (customerSearchError) {
          return { data: null, error: customerSearchError, count: 0 };
        }
        if (techSearchError) {
          return { data: null, error: techSearchError, count: 0 };
        }

        customerIdFilter = (matchedCustomers || []).map((c: { id: string }) => c.id);
        technicianIdFilter = (matchedTechs || []).map((t: { id: string }) => t.id);

        if (customerIdFilter.length === 0 && technicianIdFilter.length === 0) {
          return { data: [], error: null, count: 0 };
        }
      }

      let query = supabase
        .from('amc_contracts')
        .select(
          `${AMC_CONTRACT_ROW_COLUMNS},customers(id, full_name, phone, email, customer_id, service_type, brand, model, last_service_date, visible_address, address)`,
          { count: 'exact' }
        )
        .order('created_at', { ascending: false });

      if (endDateStatus === 'ACTIVE') {
        query = query.gte('end_date', todayYmd);
      } else if (endDateStatus === 'EXPIRED') {
        query = query.lt('end_date', todayYmd);
      }

      if (customerIdFilter || technicianIdFilter) {
        const parts: string[] = [];
        if (customerIdFilter && customerIdFilter.length > 0) {
          parts.push(`customer_id.in.(${customerIdFilter.join(',')})`);
        }
        if (technicianIdFilter && technicianIdFilter.length > 0) {
          parts.push(`given_by_technician_id.in.(${technicianIdFilter.join(',')})`);
        }
        query = query.or(parts.join(','));
      }

      if (limit > 0 && limit < 100000) {
        query = query.range(offset, offset + limit - 1);
      } else {
        query = query.range(offset, offset + 99999);
      }

      const { data, error, count } = await query;
      return { data, error, count: count ?? 0 };
    },

    async getById(id: string) {
      const { data, error } = await supabase
        .from('amc_contracts')
        .select(`${AMC_CONTRACT_ROW_COLUMNS},customers(id, full_name, phone, email, customer_id, service_type, brand, model, last_service_date, visible_address, address)`)
        .eq('id', id)
        .single();
      
      return { data, error };
    },

    async update(id: string, updates: {
      start_date?: string;
      end_date?: string;
      years?: number;
      includes_prefilter?: boolean;
      additional_info?: string | null;
      service_period_months?: number | null;
      given_by_technician_id?: string | null;
      status?: 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'RENEWED';
    }) {
      const { data, error } = await supabase
        .from('amc_contracts')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      return { data, error };
    },

    async delete(id: string) {
      const { error } = await supabase
        .from('amc_contracts')
        .delete()
        .eq('id', id);
      
      return { error };
    },

    async getExpiringSoon(days: number = 30) {
      const today = new Date();
      const futureDate = new Date();
      futureDate.setDate(today.getDate() + days);
      
      const { data, error } = await supabase
        .from('amc_contracts')
        .select(`${AMC_CONTRACT_ROW_COLUMNS},customers(full_name, phone, email, customer_id)`)
        .eq('status', 'ACTIVE')
        .gte('end_date', today.toISOString().split('T')[0])
        .lte('end_date', futureDate.toISOString().split('T')[0])
        .order('end_date', { ascending: true });
      
      return { data, error };
    },

    async createAMCServiceJobs(options?: { dryRun?: boolean; force?: boolean }) {
      // Independent of AMC view pagination: always scans all ACTIVE contracts still in force.
      const dryRun = options?.dryRun === true;
      // force: manual "Run now" button bypasses the 6-hour throttle WITHOUT touching the
      // shared throttle timer, so automatic background runs keep their own 6-hour schedule.
      const force = options?.force === true;
      const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;
      if (dryRun) console.log('🔵 [DRY RUN] AMC service job creation preview...');
      else if (isDev) console.log('🔵 Starting AMC service job creation...');

      const {
        computeAmcAutoCreateDue,
        computeAmcPreExpiryAutoCreate,
        formatAmcDateEnIN,
        getDefaultAmcServicePeriodMonths,
        markAmcJobCreationRun,
        shouldRunAmcJobCreationNow,
        toDateOnly,
        withAmcJobCreationLock,
        AMC_REMINDER_DAYS_BEFORE,
      } = await import('@/lib/amcAutoJobSchedule');

      if (!dryRun && !force) {
        if (!shouldRunAmcJobCreationNow()) {
          if (isDev) console.log('ℹ️ AMC job creation skipped (throttled, last run < 6h ago)');
          return { data: [], error: null, created: 0 };
        }
      }

      const runCreation = async () => {

      // Batch IN clauses to avoid URL/query limits (~200–300 IDs per request)
      const BATCH_SIZE = 200;
      const chunk = <T>(arr: T[], size: number): T[][] => {
        const out: T[][] = [];
        for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
      };

      // Helper function to generate job number (unique enough for multi-row creates)
      const generateJobNumber = (serviceType: string) => {
        const prefix = serviceType === 'RO' ? 'RO' : 'WS';
        const timestamp = Date.now().toString().slice(-8);
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        return `${prefix}${timestamp}${random}`;
      };

      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        if (isDev) console.warn('AMC job creation: not authenticated', authError);
        return { data: null, error: authError || new Error('Not authenticated'), created: 0 };
      }

      const { getLocalCalendarDateYmd } = await import('@/lib/pendingPaymentReminder');
      const todayStr = getLocalCalendarDateYmd();

      // Only contracts still in force: ACTIVE and not past end_date (avoids jobs if status was never flipped to EXPIRED)
      const { data: activeAMCsRaw, error: amcError } = await supabase
        .from('amc_contracts')
        .select(AMC_CONTRACT_ROW_COLUMNS)
        .eq('status', 'ACTIVE')
        .gte('end_date', todayStr);

      if (amcError) {
        console.error('❌ Error fetching AMC contracts:', amcError);
        return { data: null, error: amcError, created: 0 };
      }

      if (!activeAMCsRaw || activeAMCsRaw.length === 0) {
        if (isDev) console.log('ℹ️ No active AMC contracts found');
        return { data: [], error: null, created: 0 };
      }

      const amcCustomerIds = [...new Set(activeAMCsRaw.map(amc => amc.customer_id).filter(Boolean))] as string[];

      // Fetch customers in batches (avoids large IN clauses when AMCs are 1000+)
      const customerIdChunks = chunk(amcCustomerIds, BATCH_SIZE);
      let customersData: any[] = [];
      for (const ids of customerIdChunks) {
        const { data, error: customersError } = await supabase
          .from('customers')
          .select('id, customer_id, full_name, phone, email, address, location, service_type, brand, model, last_service_date')
          .in('id', ids);
        if (customersError) {
          console.error('❌ Error fetching customers:', customersError);
          return { data: null, error: customersError, created: 0 };
        }
        customersData = customersData.concat(data || []);
      }

      // Combine AMC contracts with customer data
      const activeAMCs = activeAMCsRaw.map(amc => ({
        ...amc,
        customers: customersData?.find(c => c.id === amc.customer_id) || null
      }));

      const defaultPeriodMonths = getDefaultAmcServicePeriodMonths();

      // Last completed job per customer — any service type (repair, AMC, install, etc.)
      const customerIds = [...new Set(activeAMCs.map(amc => amc.customer_id).filter(Boolean))] as string[];
      const lastServiceMap = new Map<string, string>();
      const jobChunks = chunk(customerIds, BATCH_SIZE);
      for (const ids of jobChunks) {
        const { data: lastJobs, error: jobsError } = await supabase
          .from('jobs')
          .select('customer_id, completed_at, service_sub_type')
          .in('customer_id', ids)
          .eq('status', 'COMPLETED')
          .not('completed_at', 'is', null)
          .order('completed_at', { ascending: false });
        if (!jobsError && lastJobs) {
          lastJobs.forEach((job: any) => {
            if (!lastServiceMap.has(job.customer_id)) {
              lastServiceMap.set(job.customer_id, job.completed_at);
            }
          });
        }
      }

      // Existing AMC service jobs (batched) — skip creating if customer already has one open
      const existingAMCCustomers = new Set<string>();
      for (const ids of jobChunks) {
        const { data: existingAMCJobs } = await supabase
          .from('jobs')
          .select('customer_id')
          .in('customer_id', ids)
          .eq('service_sub_type', 'AMC Service')
          .in('status', ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS', 'FOLLOW_UP', 'RESCHEDULED']);
        (existingAMCJobs || []).forEach((job: any) => existingAMCCustomers.add(job.customer_id));
      }

      // Preview for dry run: list of each active AMC and whether a job would be created
      type PreviewItem = {
        customer_id: string;
        customer_name: string;
        reference_date: string | null;
        period_months: number;
        next_due: string | null;
        would_create: boolean;
        skip_reason?: string;
      };
      const preview: PreviewItem[] = [];

      const jobsToCreate: any[] = [];
      let createdCount = 0;

      for (const amc of activeAMCs) {
        const customer = amc.customers as any;
        if (!customer) {
          console.log('⚠️ AMC has no customer data:', amc.id);
          preview.push({
            customer_id: amc.customer_id || '',
            customer_name: 'Unknown',
            reference_date: null,
            period_months: 0,
            next_due: null,
            would_create: false,
            skip_reason: 'No customer data'
          });
          continue;
        }

        if (isDev) console.log(`\n🔍 Processing customer: ${customer.customer_id || customer.id}`);

        // Skip if already has an AMC service job in PENDING, IN_PROGRESS, FOLLOW_UP, or RESCHEDULED (no duplicate)
        if (existingAMCCustomers.has(customer.id)) {
          if (isDev) console.log(`  ⏭️ Skipping - already has AMC service job (pending / in progress / follow-up)`);
          preview.push({
            customer_id: customer.customer_id || customer.id,
            customer_name: customer.full_name || 'Unknown',
            reference_date: null,
            period_months: 0,
            next_due: null,
            would_create: false,
            skip_reason: 'Already has open AMC service job'
          });
          continue;
        }

        // Service period: contract value or app default; 0 = no auto
        const periodMonths = amc.service_period_months != null ? amc.service_period_months : defaultPeriodMonths;
        if (periodMonths <= 0) {
          if (isDev) console.log(`  ⏭️ Skipping - no auto (service_period_months=${amc.service_period_months}, default=${defaultPeriodMonths})`);
          preview.push({
            customer_id: customer.customer_id || customer.id,
            customer_name: customer.full_name || 'Unknown',
            reference_date: null,
            period_months: periodMonths,
            next_due: null,
            would_create: false,
            skip_reason: 'No auto (service period is 0 or not set)'
          });
          continue;
        }

        // Reference: last completed job (any service), else customer last_service_date, else AMC start
        const lastServiceDateRaw =
          lastServiceMap.get(customer.id) || customer.last_service_date || amc.start_date;
        if (isDev) {
          console.log(
            `  📅 Last service raw:`,
            lastServiceDateRaw,
            `(any completed job / customer.last_service_date / amc.start_date)`
          );
        }

        const referenceDateStr = toDateOnly(
          lastServiceDateRaw != null ? String(lastServiceDateRaw) : null
        );
        if (!referenceDateStr) {
          if (isDev) console.log(`  ⏭️ Skipping - no reference date`);
          preview.push({
            customer_id: customer.customer_id || customer.id,
            customer_name: customer.full_name || 'Unknown',
            reference_date: null,
            period_months: periodMonths,
            next_due: null,
            would_create: false,
            skip_reason: 'No reference date (last service or AMC start)'
          });
          continue;
        }

        const { nextDue: nextDueStr, reminderStart: reminderStartStr, shouldCreate: regularDue } =
          computeAmcAutoCreateDue(referenceDateStr, periodMonths, todayStr);
        const endDateStr = toDateOnly(amc.end_date);
        const formattedLastServiceDate = formatAmcDateEnIN(referenceDateStr);

        let createReason: 'regular' | 'pre_expiry' | null = null;
        let preExpiryWindowStart: string | null = null;

        if (regularDue) {
          createReason = 'regular';
        } else if (endDateStr && nextDueStr > endDateStr) {
          const preExpiry = computeAmcPreExpiryAutoCreate(endDateStr, todayStr);
          preExpiryWindowStart = preExpiry.preExpiryWindowStart;
          if (preExpiry.shouldCreate) {
            createReason = 'pre_expiry';
          }
        }

        if (isDev) {
          console.log(
            `  📅 Reference: ${referenceDateStr}, period: ${periodMonths}mo, next due: ${nextDueStr}, AMC ends: ${endDateStr ?? 'n/a'}, regular: ${regularDue}, pre-expiry: ${createReason === 'pre_expiry'}`
          );
        }

        if (!createReason) {
          const skipReason =
            endDateStr && nextDueStr > endDateStr && preExpiryWindowStart
              ? `Next service (${nextDueStr}) is after AMC ends (${endDateStr}); pre-expiry window starts ${preExpiryWindowStart}`
              : `Not yet within ${AMC_REMINDER_DAYS_BEFORE}-day window (next due ${nextDueStr}, window starts ${reminderStartStr})`;
          if (isDev) console.log(`  ❌ Skipping - ${skipReason}`);
          preview.push({
            customer_id: customer.customer_id || customer.id,
            customer_name: customer.full_name || 'Unknown',
            reference_date: referenceDateStr,
            period_months: periodMonths,
            next_due: nextDueStr,
            would_create: false,
            skip_reason: skipReason,
          });
          continue;
        }

        preview.push({
          customer_id: customer.customer_id || customer.id,
          customer_name: customer.full_name || 'Unknown',
          reference_date: referenceDateStr,
          period_months: periodMonths,
          next_due: createReason === 'pre_expiry' ? endDateStr : nextDueStr,
          would_create: true,
          skip_reason: createReason === 'pre_expiry' ? 'Pre-expiry (AMC ending soon)' : undefined,
        });

        {
          if (isDev) console.log(`  ✅ Will create ${createReason} job for ${customer.customer_id || customer.id}`);
          // AMC Service is always RO (not softener). Customer may be RO_SOFTENER with
          // comma-separated brand/model — take the RO slot only.
          const { readCustomerEquipmentSlot } = await import('@/lib/equipment-suggestions');
          const roEquipment = readCustomerEquipmentSlot(customer, 'RO');
          const serviceType = 'RO' as const;
          const jobNumber = generateJobNumber(serviceType);

          const scheduledDateStr = getLocalCalendarDateYmd();

          const formattedEndDate = endDateStr ? formatAmcDateEnIN(endDateStr) : '';
          const description =
            createReason === 'pre_expiry'
              ? `AMC Service - Final visit before AMC contract ends on ${formattedEndDate}. Last service was on ${formattedLastServiceDate}. The next scheduled service (${formatAmcDateEnIN(nextDueStr)}) would fall after the AMC end date, so this job was auto-created in the last ${AMC_REMINDER_DAYS_BEFORE} days before expiry.`
              : `AMC Service - Scheduled maintenance service. Last service was on ${formattedLastServiceDate}. Due on ${formatAmcDateEnIN(nextDueStr)}.`;

          const jobData = {
            job_number: jobNumber,
            customer_id: customer.id,
            service_type: serviceType,
            service_sub_type: 'AMC Service',
            service_site: 'primary',
            brand: roEquipment.brand || 'Not Specified',
            model: roEquipment.model || 'Not Specified',
            scheduled_date: scheduledDateStr,
            scheduled_time_slot: 'MORNING',
            estimated_duration: 120,
            // NOT NULL jsonb columns — never pass null from sparse customer rows
            service_address: customer.address && typeof customer.address === 'object' ? customer.address : {},
            service_location: customer.location && typeof customer.location === 'object' ? customer.location : {},
            status: 'PENDING',
            priority: createReason === 'pre_expiry' ? 'HIGH' : 'MEDIUM',
            description: description || 'AMC Service',
            requirements: [
              {
                amc_contract_id: amc.id,
                auto_created: true,
                service_due: true,
                amc_service: true,
                pre_expiry: createReason === 'pre_expiry',
                amc_expires_on: endDateStr ?? undefined,
                lead_source: 'Direct call',
              },
            ],
            estimated_cost: 0,
            payment_status: 'PENDING',
          };

          jobsToCreate.push(jobData);
        }
      }

      if (isDev) console.log(`\n📦 Total jobs to create: ${jobsToCreate.length}`);

      if (dryRun) {
        if (isDev) console.log('ℹ️ [DRY RUN] No jobs inserted. Preview:', preview);
        return { data: null, error: null, created: 0, preview };
      }

      // Insert one-by-one so a single bad row cannot block the rest of the due set
      // (batch insert is all-or-nothing in Postgres).
      if (jobsToCreate.length > 0) {
        if (isDev) console.log(`💾 Creating ${jobsToCreate.length} jobs (per-row)...`);
        const createdJobsData: any[] = [];
        const insertErrors: { job_number?: string; customer_id?: string; message: string }[] = [];

        for (const jobData of jobsToCreate) {
          let attempt = jobData;
          let lastError: any = null;
          for (let retry = 0; retry < 3; retry++) {
            const { data: created, error: createError } = await supabase
              .from('jobs')
              .insert(attempt)
              .select('id,job_number,customer_id,status,service_sub_type,created_at')
              .single();
            if (!createError && created) {
              createdJobsData.push(created);
              lastError = null;
              break;
            }
            lastError = createError;
            const msg = String(createError?.message || '');
            // Rare job_number unique collision — regenerate and retry
            if (/job_number|duplicate key|unique/i.test(msg)) {
              attempt = {
                ...attempt,
                job_number: generateJobNumber(String(attempt.service_type || 'RO')),
              };
              continue;
            }
            break;
          }
          if (lastError) {
            console.error('❌ Error creating AMC job:', attempt.job_number, lastError);
            insertErrors.push({
              job_number: attempt.job_number,
              customer_id: attempt.customer_id,
              message: String(lastError.message || lastError),
            });
          }
        }

        createdCount = createdJobsData.length;
        if (isDev) {
          console.log(`✅ Created ${createdCount}/${jobsToCreate.length} AMC service jobs`);
          if (insertErrors.length) console.warn('AMC insert errors:', insertErrors);
        }
        if (createdCount > 0) {
          cacheInvalidate('job_counts_v1');
        }
        if (createdCount === 0 && insertErrors.length > 0) {
          return {
            data: null,
            error: new Error(insertErrors.map((e) => e.message).join('; ')),
            created: 0,
            insertErrors,
          };
        }
        return {
          data: createdJobsData,
          error: null,
          created: createdCount,
          insertErrors: insertErrors.length ? insertErrors : undefined,
        };
      }

      if (isDev) console.log('ℹ️ No jobs to create');
      return { data: [], error: null, created: 0 };
      };

      if (dryRun) {
        return runCreation();
      }

      return withAmcJobCreationLock(async () => {
        // Re-check inside lock so parallel dashboard loads don't both pass the throttle.
        if (!force && !shouldRunAmcJobCreationNow()) {
          if (isDev) console.log('ℹ️ AMC job creation skipped (throttled, last run < 6h ago)');
          return { data: [], error: null, created: 0 };
        }
        if (!force) {
          markAmcJobCreationRun();
        }
        const result = await runCreation();
        // Manual button bypasses the throttle check but still updates the timer so a
        // refresh right after doesn't immediately re-run background auto-generation.
        if (force) {
          markAmcJobCreationRun();
        }
        return result;
      });
    }
  },

  // Technician expenses operations
  technicianExpenses: {
    /** technicianId optional. startDate/endDate in YYYY-MM-DD for analytics (DB-side filter, less egress). */
    async getAll(technicianId?: string, startDate?: string, endDate?: string, options?: AnalyticsQueryOpts) {
      const cols = options?.forAnalytics ? ANALYTICS_TECHNICIAN_EXPENSE_COLUMNS : TECHNICIAN_EXPENSE_ROW_COLUMNS;
      const buildQuery = () => {
        let query = supabase
          .from('technician_expenses')
          .select(cols)
          .order('expense_date', { ascending: false });
        if (technicianId) query = query.eq('technician_id', technicianId);
        if (startDate) query = query.gte('expense_date', startDate);
        if (endDate) query = query.lte('expense_date', endDate);
        return query;
      };

      if (options?.forAnalytics) {
        return fetchAnalyticsPages((from, to) => buildQuery().range(from, to));
      }

      const { data, error } = await buildQuery();
      return { data, error };
    },

    async create(expense: any) {
      const { data, error } = await supabase
        .from('technician_expenses')
        .insert(expense)
        .select()
        .single();
      
      return { data, error };
    },

    async update(id: string, updates: any) {
      const { data, error } = await supabase
        .from('technician_expenses')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      return { data, error };
    },

    async delete(id: string) {
      const { error } = await supabase
        .from('technician_expenses')
        .delete()
        .eq('id', id);
      
      return { error };
    }
  },

  // Technician advances operations
  technicianAdvances: {
    /** technicianId optional. startDate/endDate in YYYY-MM-DD for analytics (DB-side filter, less egress). */
    async getAll(technicianId?: string, startDate?: string, endDate?: string, options?: AnalyticsQueryOpts) {
      const cols = options?.forAnalytics ? ANALYTICS_TECHNICIAN_ADVANCE_COLUMNS : TECHNICIAN_ADVANCE_ROW_COLUMNS;
      const buildQuery = () => {
        let query = supabase
          .from('technician_advances')
          .select(cols)
          .order('advance_date', { ascending: false });
        if (technicianId) query = query.eq('technician_id', technicianId);
        if (startDate) query = query.gte('advance_date', startDate);
        if (endDate) query = query.lte('advance_date', endDate);
        return query;
      };

      if (options?.forAnalytics) {
        return fetchAnalyticsPages((from, to) => buildQuery().range(from, to));
      }

      const { data, error } = await buildQuery();
      return { data, error };
    },

    async create(advance: any) {
      const { data, error } = await supabase
        .from('technician_advances')
        .insert(advance)
        .select()
        .single();
      
      return { data, error };
    },

    async update(id: string, updates: any) {
      const { data, error } = await supabase
        .from('technician_advances')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      return { data, error };
    },

    async delete(id: string) {
      const { error } = await supabase
        .from('technician_advances')
        .delete()
        .eq('id', id);
      
      return { error };
    }
  },

  // Technician extra commissions operations
  technicianExtraCommissions: {
    /** technicianId optional. startDate/endDate in YYYY-MM-DD for analytics (DB-side filter, less egress). */
    async getAll(technicianId?: string, startDate?: string, endDate?: string, options?: AnalyticsQueryOpts) {
      const cols = options?.forAnalytics
        ? ANALYTICS_EXTRA_COMMISSION_COLUMNS
        : 'id, technician_id, commission_date, amount, description, payment_method, payment_reference, notes, created_at';
      const buildQuery = () => {
        let query = supabase
          .from('technician_extra_commissions')
          .select(cols)
          .order('commission_date', { ascending: false });
        if (technicianId) query = query.eq('technician_id', technicianId);
        if (startDate) query = query.gte('commission_date', startDate);
        if (endDate) query = query.lte('commission_date', endDate);
        return query;
      };

      if (options?.forAnalytics) {
        return fetchAnalyticsPages((from, to) => buildQuery().range(from, to));
      }

      const { data, error } = await buildQuery();
      return { data, error };
    },

    async create(commission: any) {
      const { data, error } = await supabase
        .from('technician_extra_commissions')
        .insert(commission)
        .select()
        .single();
      
      return { data, error };
    },

    async update(id: string, updates: any) {
      const { data, error } = await supabase
        .from('technician_extra_commissions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      return { data, error };
    },

    async delete(id: string) {
      const { error } = await supabase
        .from('technician_extra_commissions')
        .delete()
        .eq('id', id);
      
      return { error };
    }
  },

  // Technician holidays operations
  technicianHolidays: {
    async getAll(technicianId?: string, startDate?: string, endDate?: string) {
      let query = supabase
        .from('technician_holidays')
        .select('id,technician_id,holiday_date,is_manual,reason,notes,added_by,created_at,updated_at')
        .order('holiday_date', { ascending: false });
      
      if (technicianId) {
        query = query.eq('technician_id', technicianId);
      }
      
      if (startDate) {
        query = query.gte('holiday_date', startDate);
      }
      
      if (endDate) {
        query = query.lte('holiday_date', endDate);
      }
      
      const { data, error } = await query;
      return { data, error };
    },

    async create(holiday: any) {
      const { data, error } = await supabase
        .from('technician_holidays')
        .insert(holiday)
        .select()
        .single();
      
      return { data, error };
    },

    async update(id: string, updates: any) {
      const { data, error } = await supabase
        .from('technician_holidays')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      return { data, error };
    },

    async delete(id: string) {
      const { error } = await supabase
        .from('technician_holidays')
        .delete()
        .eq('id', id);
      
      return { error };
    }
  },

  // Business expenses operations
  businessExpenses: {
    async getAll(startDate?: string, endDate?: string, options?: AnalyticsQueryOpts) {
      const cols = options?.forAnalytics
        ? ANALYTICS_BUSINESS_EXPENSE_COLUMNS
        : 'id,amount,description,expense_date,category,receipt_url,notes,added_by,created_at,updated_at';
      const buildQuery = () => {
        let query = supabase
          .from('business_expenses')
          .select(cols)
          .order('expense_date', { ascending: false });
        if (startDate) query = query.gte('expense_date', startDate);
        if (endDate) query = query.lte('expense_date', endDate);
        return query;
      };

      if (options?.forAnalytics) {
        return fetchAnalyticsPages((from, to) => buildQuery().range(from, to));
      }

      const { data, error } = await buildQuery();
      return { data, error };
    },

    async create(expense: any) {
      const { data, error } = await supabase
        .from('business_expenses')
        .insert(expense)
        .select()
        .single();
      
      return { data, error };
    },

    async update(id: string, updates: any) {
      const { data, error } = await supabase
        .from('business_expenses')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      return { data, error };
    },

    async delete(id: string) {
      const { error } = await supabase
        .from('business_expenses')
        .delete()
        .eq('id', id);
      
      return { error };
    }
  },

  // Other expenses operations (same pattern as business expenses)
  otherExpenses: {
    async getAll(startDate?: string, endDate?: string, options?: AnalyticsQueryOpts) {
      const cols = options?.forAnalytics
        ? ANALYTICS_OTHER_EXPENSE_COLUMNS
        : 'id,amount,description,expense_date,category,receipt_url,notes,added_by,created_at,updated_at';
      const buildQuery = () => {
        let query = supabase
          .from('other_expenses')
          .select(cols)
          .order('expense_date', { ascending: false });
        if (startDate) query = query.gte('expense_date', startDate);
        if (endDate) query = query.lte('expense_date', endDate);
        return query;
      };

      if (options?.forAnalytics) {
        return fetchAnalyticsPages((from, to) => buildQuery().range(from, to));
      }

      const { data, error } = await buildQuery();
      return { data, error };
    },
    async create(expense: any) {
      const { data, error } = await supabase
        .from('other_expenses')
        .insert(expense)
        .select()
        .single();
      return { data, error };
    },
    async update(id: string, updates: any) {
      const { data, error } = await supabase
        .from('other_expenses')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      return { data, error };
    },
    async delete(id: string) {
      const { error } = await supabase
        .from('other_expenses')
        .delete()
        .eq('id', id);
      return { error };
    }
  },

  // Stats operations
  stats: {
    async getBillingByCustomer() {
      const { data, error } = await supabase
        .from('jobs')
        .select(`
          customer_id,
          customer:customers(
            id,
            customer_id,
            full_name,
            phone
          ),
          payment_amount,
          actual_cost,
          status
        `)
        .eq('status', 'COMPLETED')
        .not('payment_amount', 'is', null)
        .order('created_at', { ascending: false });
      
      if (error) return { data: null, error };
      
      // Group by customer
      const customerTotals: Record<string, any> = {};
      data?.forEach((job: any) => {
        const customerId = job.customer_id;
        const amount = job.payment_amount || job.actual_cost || 0;
        
        if (!customerTotals[customerId]) {
          customerTotals[customerId] = {
            customer: job.customer,
            totalAmount: 0,
            jobCount: 0
          };
        }
        
        customerTotals[customerId].totalAmount += amount;
        customerTotals[customerId].jobCount += 1;
      });
      
      return { data: Object.values(customerTotals), error: null };
    },

    async getBillingByDate(date: string) {
      // Get jobs completed on a specific date
      // Parse date string (format: YYYY-MM-DD) and create date range in local timezone
      const [year, month, day] = date.split('-').map(Number);
      const localStartOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
      const localStartOfNextDay = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
      
      // Use Date objects directly - they automatically convert to UTC when calling toISOString()
      const startDate = localStartOfDay;
      const endDate = localStartOfNextDay;
      
      const { data, error } = await supabase
        .from('jobs')
        .select(`
          id,
          job_number,
          requirements,
          payment_amount,
          actual_cost,
          payment_method,
          status,
          assigned_technician_id,
          completed_at,
          end_time,
          technician:technicians(
            id,
            full_name,
            employee_id
          ),
          customer:customers(
            id,
            customer_id,
            full_name
          )
        `)
        .eq('status', 'COMPLETED')
        .or(buildCompletedJobsDateOrFilter(startDate.toISOString(), endDate.toISOString()));
      
      return { data, error };
    },

    async getBillingByQRCode(date?: string) {
      // Get jobs with QR code information from requirements
      let query = supabase
        .from('jobs')
        .select(`
          id,
          job_number,
          requirements,
          payment_amount,
          actual_cost,
          status,
          completed_at,
          end_time,
          customer:customers(
            id,
            customer_id,
            full_name
          )
        `)
        .eq('status', 'COMPLETED');
      
      // Filter by completion date if provided (end_time, else completed_at)
      if (date) {
        const [year, month, day] = date.split('-').map(Number);
        const localStartOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
        const localEndOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
        query = query.or(
          buildCompletedJobsDateOrFilter(
            localStartOfDay.toISOString(),
            localEndOfDay.toISOString()
          )
        );
      }
      
      const { data, error } = await query;
      
      if (error) return { data: null, error };
      
      // Extract QR codes from requirements
      const qrCodeTotals: Record<string, any> = {};
      data?.forEach((job: any) => {
        try {
          const requirements = typeof job.requirements === 'string' 
            ? JSON.parse(job.requirements) 
            : job.requirements || [];
          
          const qrPhotos = requirements.find((r: any) => r?.qr_photos);
          const qrCodeName = qrPhotos?.qr_photos?.selected_qr_code_name;
          
          if (qrCodeName) {
            const amount = job.payment_amount || job.actual_cost || 0;
            
            if (!qrCodeTotals[qrCodeName]) {
              qrCodeTotals[qrCodeName] = {
                qrCodeName,
                totalAmount: 0,
                jobCount: 0,
                jobs: []
              };
            }
            
            qrCodeTotals[qrCodeName].totalAmount += amount;
            qrCodeTotals[qrCodeName].jobCount += 1;
            qrCodeTotals[qrCodeName].jobs.push({
              jobNumber: job.job_number,
              amount,
              customer: job.customer
            });
          }
        } catch (e) {
          // Skip jobs with invalid requirements
        }
      });
      
      return { data: Object.values(qrCodeTotals), error: null };
    },

    async getAnalytics() {
      // Get comprehensive analytics
      const [jobsResult, techniciansResult, paymentsResult] = await Promise.all([
        supabase
          .from('jobs')
          .select('status, payment_amount, actual_cost, assigned_technician_id, created_at, denied_at, completed_at'),
        supabase
          .from('technicians')
          .select('id, full_name, performance'),
        supabase
          .from('technician_payments')
          .select('technician_id, commission_amount, payment_status')
      ]);
      
      if (jobsResult.error) return { data: null, error: jobsResult.error };
      
      const jobs = jobsResult.data || [];
      const technicians = techniciansResult.data || [];
      const payments = paymentsResult.data || [];
      
      // Calculate stats
      const totalJobs = jobs.length;
      const completedJobs = jobs.filter(j => j.status === 'COMPLETED').length;
      const deniedJobs = jobs.filter(j => j.status === 'DENIED' || j.status === 'CANCELLED').length;
      const pendingJobs = jobs.filter(j => j.status === 'PENDING').length;
      const assignedJobs = jobs.filter(j => j.status === 'ASSIGNED').length;
      const inProgressJobs = jobs.filter(j => j.status === 'IN_PROGRESS').length;
      
      // Calculate total billing
      const completedJobsWithPayment = jobs.filter(j => 
        j.status === 'COMPLETED' && (j.payment_amount || j.actual_cost)
      );
      const totalBilling = completedJobsWithPayment.reduce((sum, j) => 
        sum + (j.payment_amount || j.actual_cost || 0), 0
      );
      const averageBill = completedJobsWithPayment.length > 0
        ? totalBilling / completedJobsWithPayment.length
        : 0;
      
      // Technician stats
      const technicianStats = technicians.map(tech => {
        const techJobs = jobs.filter(j => j.assigned_technician_id === tech.id);
        const techCompleted = techJobs.filter(j => j.status === 'COMPLETED').length;
        const techPayments = payments.filter(p => p.technician_id === tech.id);
        const totalEarnings = techPayments
          .filter(p => p.payment_status === 'PAID')
          .reduce((sum, p) => sum + (p.commission_amount || 0), 0);
        const pendingEarnings = techPayments
          .filter(p => p.payment_status === 'PENDING')
          .reduce((sum, p) => sum + (p.commission_amount || 0), 0);
        
        return {
          id: tech.id,
          name: tech.full_name,
          totalJobs: techJobs.length,
          completedJobs: techCompleted,
          totalEarnings,
          pendingEarnings
        };
      });
      
      return {
        data: {
          totalJobs,
          completedJobs,
          deniedJobs,
          pendingJobs,
          assignedJobs,
          inProgressJobs,
          totalBilling,
          averageBill,
          technicianStats,
          completionRate: totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0,
          denialRate: totalJobs > 0 ? (deniedJobs / totalJobs) * 100 : 0
        },
        error: null
      };
    }
  },

  // Calling page — server-paginated list (see scripts/add-calling-page-rpc.sql)
  calling: {
    async getPage(params: {
      page: number;
      limit: number;
      search?: string;
      serviceFilter?: string;
      serviceHistoryFilter?: string;
      serviceSubTypeFilter?: string;
      showRecentlyContacted?: boolean;
      recentContactDays?: number;
      statusFilter?: string;
      prefilterFilter?: string;
      /** Used only when RPC is missing — reports rows loaded during full-table fallback. */
      onFallbackProgress?: (loaded: number) => void;
    }): Promise<{
      data: CallingPageRpcResult | null;
      error: unknown;
      mode: 'rpc' | 'fallback';
    }> {
      const page = Math.max(1, params.page);
      const limit = Math.max(1, Math.min(params.limit, 100));
      const offset = (page - 1) * limit;

      const rpcArgs = {
        p_limit: limit,
        p_offset: offset,
        p_search: params.search?.trim() || null,
        p_service_filter: params.serviceFilter ?? 'all',
        p_service_history: params.serviceHistoryFilter ?? 'all',
        p_service_sub_type: params.serviceSubTypeFilter ?? 'all',
        p_show_recently_contacted: params.showRecentlyContacted === true,
        p_recent_contact_days: params.recentContactDays ?? 7,
        p_status_filter: params.statusFilter ?? 'all',
        p_prefilter_filter: params.prefilterFilter ?? 'all',
      };

      const { data, error } = await supabase.rpc('get_calling_page', rpcArgs);
      if (!error && data) {
        const result = data as CallingPageRpcResult;
        if (result.rows?.length) {
          result.rows = await enrichCallingPageRowsWithContactMeta(result.rows);
        }
        return { data: result, error: null, mode: 'rpc' };
      }
      if (error && !isCallingRpcNotFoundError(error)) {
        return { data: null, error, mode: 'rpc' };
      }

      const fallback = await getCallingPageFallback(params, page, limit);
      if (fallback?.rows?.length) {
        fallback.rows = await enrichCallingPageRowsWithContactMeta(fallback.rows);
      }
      return { data: fallback, error: fallback ? null : new Error('Fallback load failed'), mode: 'fallback' };
    },
  },

  // Call History operations
  callHistory: {
    async create(callData: {
      customer_id: string;
      contact_type: 'CALL' | 'WHATSAPP' | 'SMS' | 'EMAIL';
      phone_number?: string;
      message_sent?: string;
      status?: string;
      notes?: string;
    }) {
      const { data, error } = await supabase
        .from('call_history')
        .insert({
          customer_id: callData.customer_id,
          contact_type: callData.contact_type,
          phone_number: callData.phone_number,
          message_sent: callData.message_sent,
          status: callData.status || 'COMPLETED',
          notes: callData.notes
        })
        .select()
        .single();
      
      return { data, error };
    },

    async getByCustomerId(customerId: string) {
      const { data, error } = await supabase
        .from('call_history')
        .select(CALL_HISTORY_ROW_COLUMNS)
        .eq('customer_id', customerId)
        .order('contacted_at', { ascending: false });
      
      return { data, error };
    },

    async getRecent(days: number = 7) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const { data, error } = await supabase
        .from('call_history')
        .select(CALL_HISTORY_ROW_COLUMNS)
        .gte('contacted_at', cutoffDate.toISOString())
        .order('contacted_at', { ascending: false });
      
      return { data, error };
    },

    async getAll() {
      const { data, error } = await supabase
        .from('call_history')
        .select(CALL_HISTORY_ROW_COLUMNS)
        .order('contacted_at', { ascending: false });
      
      return { data, error };
    }
  },

  // Admin Todos operations
  adminTodos: {
    async getAll() {
      const { data, error } = await supabase
        .from('admin_todos')
        .select('id, text, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      
      return { data, error };
    },

    async create(todoData: { text: string }) {
      const { data, error } = await supabase
        .from('admin_todos')
        .insert({ text: todoData.text })
        .select()
        .single();
      
      return { data, error };
    },

    async delete(id: string) {
      const { error } = await supabase
        .from('admin_todos')
        .delete()
        .eq('id', id);
      
      return { error };
    }
  },

  // Named running-total trackers (e.g. "Cash flow"): set a starting amount, then add/subtract.
  amountTrackers: {
    async getAll() {
      const { data, error } = await supabase
        .from('amount_trackers')
        .select('id, name, amount, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(200);

      return { data, error };
    },

    async create(input: { name: string; amount?: number }) {
      const { data, error } = await supabase
        .from('amount_trackers')
        .insert({ name: input.name, amount: input.amount ?? 0 })
        .select('id, name, amount, created_at, updated_at')
        .single();

      return { data, error };
    },

    async rename(id: string, name: string) {
      const { data, error } = await supabase
        .from('amount_trackers')
        .update({ name })
        .eq('id', id)
        .select('id, name, amount, created_at, updated_at')
        .single();

      return { data, error };
    },

    // Atomic add/subtract via RPC so concurrent edits never lose an update.
    async adjust(id: string, delta: number) {
      const { data, error } = await supabase.rpc('adjust_amount_tracker', {
        p_id: id,
        p_delta: delta,
      } as any);

      return { data, error };
    },

    async delete(id: string) {
      const { error } = await supabase
        .from('amount_trackers')
        .delete()
        .eq('id', id);

      return { error };
    }
  },

  // Document drafts (Quotation / Tax Invoice / Bill / AMC / Letterhead generators).
  // Server-side so saved drafts follow the admin across devices. Shared across admins,
  // matching the permissive RLS used by the rest of the admin data layer.
  documentDrafts: {
    // Freeform jsonb table — use an untyped builder so the loose snapshot payload
    // doesn't fight the generated row types.
    _table() {
      return (supabase as any).from('document_drafts');
    },

    /** List drafts of a kind, newest-first. Returns metadata only (no snapshot) to keep egress low. */
    async list(kind: string, limit: number = 50) {
      const { data, error } = await this._table()
        .select('id, label, updated_at')
        .eq('kind', kind)
        .order('updated_at', { ascending: false })
        .limit(limit);
      return { data, error };
    },

    /**
     * Letterhead list with the document type + brand pulled from JSON subfields
     * (so the dropdown can show its badges without fetching full snapshots,
     * which may embed base64 images).
     */
    async listLetterhead(limit: number = 50) {
      const { data, error } = await this._table()
        .select('id, label, updated_at, documentType:snapshot->>documentType, brand:snapshot->>brand')
        .eq('kind', 'letterhead')
        .order('updated_at', { ascending: false })
        .limit(limit);
      return { data, error };
    },

    /** Load the full snapshot for a single draft. */
    async load(kind: string, id: string) {
      const { data, error } = await this._table()
        .select('id, label, snapshot, updated_at')
        .eq('kind', kind)
        .eq('id', id)
        .maybeSingle();
      return { data, error };
    },

    /** Create a new draft (id generated server-side) or update an existing one when `id` is passed. */
    async save(kind: string, snapshot: unknown, options?: { id?: string; label?: string }) {
      const label = (options?.label || 'Untitled').slice(0, 200);
      if (options?.id) {
        const { data, error } = await this._table()
          .update({ label, snapshot })
          .eq('kind', kind)
          .eq('id', options.id)
          .select('id')
          .maybeSingle();
        // Row may have been deleted elsewhere; fall back to insert so the save still succeeds.
        if (!error && data?.id) return { data, error: null };
      }
      const { data, error } = await this._table()
        .insert({ kind, label, snapshot })
        .select('id')
        .single();
      return { data, error };
    },

    async remove(kind: string, id: string) {
      const { error } = await this._table()
        .delete()
        .eq('kind', kind)
        .eq('id', id);
      return { error };
    },
  },

  // Inventory operations
  inventory: {
    async getAll() {
      // Only select needed fields to reduce egress
      const withFull = await supabase
        .from('inventory')
        .select('id, product_name, full_name, code, price, quantity, created_at, updated_at')
        .order('created_at', { ascending: false });
      if (!withFull.error) {
        return { data: withFull.data, error: null };
      }
      const msg = String(withFull.error.message || '');
      if (msg.includes('full_name') || msg.includes('column')) {
        const fallback = await supabase
          .from('inventory')
          .select('id, product_name, code, price, quantity, created_at, updated_at')
          .order('created_at', { ascending: false });
        return {
          data: (fallback.data || []).map((r: any) => ({ ...r, full_name: null })),
          error: fallback.error,
        };
      }
      return { data: withFull.data, error: withFull.error };
    },

    /** In-stock rows only — for Add Parts main-fallback picker (much smaller than getAll). */
    async getAvailableSlim() {
      const { data, error } = await supabase
        .from('inventory')
        .select('id, product_name, full_name, code, price, quantity')
        .gt('quantity', 0)
        .order('product_name', { ascending: true });
      return { data, error };
    },

    /** Name/code only — pickers, where-is, typeahead (same fuzzy UX, less egress than getAll). */
    async getCatalogSlim() {
      const withFull = await supabase
        .from('inventory')
        .select('id, product_name, full_name, code')
        .order('product_name', { ascending: true });
      if (!withFull.error) {
        return { data: withFull.data || [], error: null };
      }
      // Fallback before full_name migration is applied
      const msg = String(withFull.error.message || '');
      if (msg.includes('full_name') || msg.includes('column')) {
        const fallback = await supabase
          .from('inventory')
          .select('id, product_name, code')
          .order('product_name', { ascending: true });
        return {
          data: (fallback.data || []).map((r: any) => ({ ...r, full_name: null })),
          error: fallback.error,
        };
      }
      return { data: [], error: withFull.error };
    },

    /** Batch qty+price for specific ids (bundle shortfall checks). */
    async getQtyPriceByIds(ids: string[]) {
      const unique = [...new Set(ids.filter(Boolean))];
      if (unique.length === 0) return { data: [] as Array<{ id: string; quantity: number; price: number | null }>, error: null };
      const { data, error } = await supabase
        .from('inventory')
        .select('id, quantity, price')
        .in('id', unique);
      return { data: data || [], error };
    },

    async getById(id: string) {
      const { data, error } = await supabase
        .from('inventory')
        .select('id, product_name, full_name, code, price, quantity')
        .eq('id', id)
        .single();
      
      return { data, error };
    },

    async create(item: {
      product_name: string;
      full_name?: string | null;
      code?: string;
      price: number;
      quantity: number;
    }) {
      const { data, error } = await supabase
        .from('inventory')
        .insert({
          product_name: item.product_name,
          full_name: item.full_name?.trim() || null,
          code: item.code || null,
          price: item.price,
          quantity: item.quantity
        })
        .select()
        .single();
      
      return { data, error };
    },

    async update(id: string, updates: {
      product_name?: string;
      full_name?: string | null;
      code?: string;
      price?: number;
      quantity?: number;
    }) {
      const payload = { ...updates };
      if ('full_name' in payload) {
        payload.full_name = payload.full_name?.trim() || null;
      }
      const { data, error } = await supabase
        .from('inventory')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      
      return { data, error };
    },

    /** Decrement main inventory via SECURITY DEFINER RPC (technicians lack direct UPDATE). */
    async decrementForJob(inventoryId: string, qty: number) {
      const { data, error } = await supabase.rpc('decrement_main_inventory_for_job', {
        p_inventory_id: inventoryId,
        p_qty: qty,
      });
      return { data, error };
    },

    /** Restore main inventory when removing part(s) from a job. */
    async incrementForJob(inventoryId: string, qty: number) {
      const { data, error } = await supabase.rpc('increment_main_inventory_for_job', {
        p_inventory_id: inventoryId,
        p_qty: qty,
      });
      return { data, error };
    },

    /** Batch update main stock quantities — no returning rows (low egress). */
    async bulkUpdateQuantities(updates: Array<{ id: string; quantity: number }>) {
      if (updates.length === 0) return { error: null };
      // Partial upsert fails (400): inventory requires product_name/price on insert.
      const PARALLEL_CHUNK = 25;
      for (let i = 0; i < updates.length; i += PARALLEL_CHUNK) {
        const chunk = updates.slice(i, i + PARALLEL_CHUNK);
        const results = await Promise.all(
          chunk.map(({ id, quantity }) =>
            supabase.from('inventory').update({ quantity }).eq('id', id)
          )
        );
        const failed = results.find((r) => r.error);
        if (failed?.error) return { error: failed.error };
      }
      return { error: null };
    },

    async delete(id: string) {
      const { error } = await supabase
        .from('inventory')
        .delete()
        .eq('id', id);
      
      return { error };
    },

    async getSummary() {
      const { data, error } = await supabase
        .from('inventory')
        .select('id, product_name, code, price, quantity');
      
      if (error) return { data: null, error };
      
      const totalItems = data?.length || 0;
      const totalValue = data?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || 0;
      const lowStockItems = data?.filter(item => item.quantity <= 5).length || 0;
      
      return {
        data: {
          totalItems,
          totalValue,
          lowStockItems,
          items: data || []
        },
        error: null
      };
    }
  },

  // Inventory Bundles (predefined part sets for quick add to jobs)
  inventoryBundles: {
    async getAll() {
      const { data, error } = await supabase
        .from('inventory_bundles')
        .select('id, name, description')
        .order('name', { ascending: true });
      return { data: data || [], error };
    },

    async getByIdWithItems(id: string) {
      const { data: bundle, error: bundleError } = await supabase
        .from('inventory_bundles')
        .select('id, name, description')
        .eq('id', id)
        .single();
      if (bundleError || !bundle) return { data: null, error: bundleError };
      const { data: items, error: itemsError } = await supabase
        .from('inventory_bundle_items')
        .select(`
          inventory_id,
          quantity,
          inventory:inventory(id, product_name, code, price)
        `)
        .eq('bundle_id', id);
      if (itemsError) return { data: null, error: itemsError };
      return { data: { ...bundle, items: items || [] }, error: null };
    },

    async create(bundle: { name: string; description?: string }) {
      const { data, error } = await supabase
        .from('inventory_bundles')
        .insert({ name: bundle.name, description: bundle.description || null })
        .select()
        .single();
      return { data, error };
    },

    async update(id: string, updates: { name?: string; description?: string }) {
      const { data, error } = await supabase
        .from('inventory_bundles')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      return { data, error };
    },

    async delete(id: string) {
      const { error } = await supabase.from('inventory_bundles').delete().eq('id', id);
      return { error };
    },

    async setItems(bundleId: string, items: { inventory_id: string; quantity: number }[]) {
      const { error: delError } = await supabase.from('inventory_bundle_items').delete().eq('bundle_id', bundleId);
      if (delError) return { error: delError };
      if (items.length === 0) return { error: null };
      const rows = items.map(({ inventory_id, quantity }) => ({ bundle_id: bundleId, inventory_id, quantity }));
      const { error: insertError } = await supabase.from('inventory_bundle_items').insert(rows);
      return { error: insertError };
    },

    async getItems(bundleId: string) {
      const { data, error } = await supabase
        .from('inventory_bundle_items')
        .select(`
          id,
          bundle_id,
          inventory_id,
          quantity,
          inventory:inventory(id, product_name, code, price)
        `)
        .eq('bundle_id', bundleId);
      return { data: data || [], error };
    }
  },

  // Warehouse places → boxes (stackable) → items (location ledger)
  storagePlaces: {
    async getAll() {
      const { data, error } = await supabase
        .from('storage_places')
        .select('id, name, sort_order, created_at, updated_at')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      return { data: data || [], error };
    },

    async create(place: { name: string; sort_order?: number }) {
      const { data, error } = await supabase
        .from('storage_places')
        .insert({
          name: place.name,
          sort_order: place.sort_order ?? 0,
        })
        .select('id, name, sort_order, created_at, updated_at')
        .single();
      return { data, error };
    },

    async update(id: string, updates: { name?: string; sort_order?: number }) {
      const { data, error } = await supabase
        .from('storage_places')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('id, name, sort_order, created_at, updated_at')
        .single();
      return { data, error };
    },

    async delete(id: string) {
      const { error } = await supabase.from('storage_places').delete().eq('id', id);
      return { error };
    },
  },

  storageBlocks: {
    async getByPlace(placeId: string) {
      const { data, error } = await supabase
        .from('storage_blocks')
        .select('id, place_id, name, notes, sort_order, parent_block_id, created_at, updated_at')
        .eq('place_id', placeId)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      return { data: data || [], error };
    },

    /**
     * One round-trip for the Locations map: boxes + items (+ inventory labels).
     * Same UX as parallel getByPlace + storageBlockItems.getByPlace.
     */
    async getMapByPlace(placeId: string) {
      const { data, error } = await supabase
        .from('storage_blocks')
        .select(`
          id,
          place_id,
          name,
          notes,
          sort_order,
          parent_block_id,
          created_at,
          updated_at,
          items:storage_block_items(
            id,
            block_id,
            inventory_id,
            quantity,
            inventory:inventory(id, product_name, code)
          )
        `)
        .eq('place_id', placeId)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) return { blocks: [], items: [], error };
      const rows = data || [];
      const blocks = rows.map(({ items: _items, ...block }) => block);
      const items = rows.flatMap((row) => {
        const embedded = Array.isArray(row.items) ? row.items : [];
        return embedded;
      });
      return { blocks, items, error: null };
    },

    async getAllSlim() {
      const { data, error } = await supabase
        .from('storage_blocks')
        .select('id, place_id, name, parent_block_id')
        .order('name', { ascending: true });
      return { data: data || [], error };
    },

    async create(block: {
      place_id: string;
      name: string;
      notes?: string;
      sort_order?: number;
      parent_block_id?: string | null;
    }) {
      const { data, error } = await supabase
        .from('storage_blocks')
        .insert({
          place_id: block.place_id,
          name: block.name,
          notes: block.notes || null,
          sort_order: block.sort_order ?? 0,
          parent_block_id: block.parent_block_id ?? null,
        })
        .select('id, place_id, name, notes, sort_order, parent_block_id, created_at, updated_at')
        .single();
      return { data, error };
    },

    async update(
      id: string,
      updates: {
        name?: string;
        notes?: string | null;
        sort_order?: number;
        parent_block_id?: string | null;
        place_id?: string;
      }
    ) {
      const { data, error } = await supabase
        .from('storage_blocks')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('id, place_id, name, notes, sort_order, parent_block_id, created_at, updated_at')
        .single();
      return { data, error };
    },

    async delete(id: string) {
      const { error } = await supabase.from('storage_blocks').delete().eq('id', id);
      return { error };
    },
  },

  storageBlockItems: {
    async getByBlock(blockId: string) {
      const { data, error } = await supabase
        .from('storage_block_items')
        .select(`
          id,
          block_id,
          inventory_id,
          quantity,
          inventory:inventory(id, product_name, code)
        `)
        .eq('block_id', blockId)
        .order('created_at', { ascending: true });
      return { data: data || [], error };
    },

    /** Slim item rows for all boxes in a place (for map summaries / refresh). */
    async getByPlace(placeId: string) {
      const { data, error } = await supabase
        .from('storage_block_items')
        .select(`
          id,
          block_id,
          inventory_id,
          quantity,
          inventory:inventory(id, product_name, code),
          block:storage_blocks!inner(place_id)
        `)
        .eq('block.place_id', placeId);
      if (error) return { data: [], error };
      // Drop nested block filter helper from row shape (map only needs item fields).
      const items = (data || []).map(({ block: _block, ...item }) => item);
      return { data: items, error: null };
    },

    /** Find where a product sits (for global where-is search). */
    async findByInventoryIds(inventoryIds: string[]) {
      const unique = [...new Set(inventoryIds.filter(Boolean))];
      if (unique.length === 0) return { data: [], error: null };
      const { data, error } = await supabase
        .from('storage_block_items')
        .select(`
          id,
          block_id,
          inventory_id,
          quantity,
          inventory:inventory(id, product_name, code),
          block:storage_blocks(id, name, place_id, parent_block_id, place:storage_places(id, name))
        `)
        .in('inventory_id', unique);
      return { data: data || [], error };
    },

    async upsert(blockId: string, inventoryId: string, quantity: number) {
      const { data, error } = await supabase
        .from('storage_block_items')
        .upsert(
          {
            block_id: blockId,
            inventory_id: inventoryId,
            quantity,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'block_id,inventory_id' }
        )
        .select(`
          id,
          block_id,
          inventory_id,
          quantity,
          inventory:inventory(id, product_name, code)
        `)
        .single();
      return { data, error };
    },

    async updateQuantity(id: string, quantity: number) {
      const { data, error } = await supabase
        .from('storage_block_items')
        .update({ quantity, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select(`
          id,
          block_id,
          inventory_id,
          quantity,
          inventory:inventory(id, product_name, code)
        `)
        .single();
      return { data, error };
    },

    async delete(id: string) {
      const { error } = await supabase.from('storage_block_items').delete().eq('id', id);
      return { error };
    },
  },

  // Technician Inventory operations
  technicianInventory: {
    async getAll() {
      // Only select needed fields to reduce egress
      const { data, error } = await supabase
        .from('technician_inventory')
        .select(`
          id,
          technician_id,
          inventory_id,
          quantity,
          created_at,
          updated_at,
          technician:technicians(id, full_name, employee_id),
          inventory:inventory(id, product_name, code)
        `)
        .order('created_at', { ascending: false });
      
      return { data, error };
    },

    async getByTechnician(technicianId: string) {
      // Only select needed fields to reduce egress
      const { data, error } = await supabase
        .from('technician_inventory')
        .select(`
          id,
          technician_id,
          inventory_id,
          quantity,
          created_at,
          updated_at,
          technician:technicians(id, full_name, employee_id),
          inventory:inventory(id, product_name, code)
        `)
        .eq('technician_id', technicianId)
        .order('created_at', { ascending: false });
      
      return { data, error };
    },

    /** Slim bag load for Add Parts — includes price, no technician join. */
    async getByTechnicianForParts(technicianId: string) {
      const { data, error } = await supabase
        .from('technician_inventory')
        .select(`
          id,
          technician_id,
          inventory_id,
          quantity,
          inventory:inventory(id, product_name, code, price)
        `)
        .eq('technician_id', technicianId)
        .order('quantity', { ascending: false });
      return { data, error };
    },

    async getByInventory(inventoryId: string) {
      const { data, error } = await supabase
        .from('technician_inventory')
        .select(`
          *,
          technician:technicians(id, full_name, employee_id),
          inventory:inventory(id, product_name, code, price)
        `)
        .eq('inventory_id', inventoryId)
        .order('created_at', { ascending: false });
      
      return { data, error };
    },

    async getById(id: string) {
      const { data, error } = await supabase
        .from('technician_inventory')
        .select(`
          *,
          technician:technicians(id, full_name, employee_id),
          inventory:inventory(id, product_name, code, price)
        `)
        .eq('id', id)
        .single();
      
      return { data, error };
    },

    async create(item: { technician_id: string; inventory_id: string; quantity: number; notes?: string }) {
      const { data, error } = await supabase
        .from('technician_inventory')
        .insert({
          technician_id: item.technician_id,
          inventory_id: item.inventory_id,
          quantity: item.quantity,
          notes: item.notes || null
        })
        .select(`
          *,
          technician:technicians(id, full_name, employee_id),
          inventory:inventory(id, product_name, code, price)
        `)
        .single();
      
      return { data, error };
    },

    async update(id: string, updates: { quantity?: number }) {
      const { data, error } = await supabase
        .from('technician_inventory')
        .update(updates)
        .eq('id', id)
        .select(`
          *,
          technician:technicians(id, full_name, employee_id),
          inventory:inventory(id, product_name, code, price)
        `)
        .single();
      
      return { data, error };
    },

    /** Qty-only update for Add Parts mutations (no joins). */
    async updateQuantity(id: string, quantity: number) {
      const { error } = await supabase
        .from('technician_inventory')
        .update({ quantity })
        .eq('id', id);
      return { error };
    },

    async delete(id: string) {
      const { error } = await supabase
        .from('technician_inventory')
        .delete()
        .eq('id', id);
      
      return { error };
    },

    async upsert(item: { technician_id: string; inventory_id: string; quantity: number }) {
      // Upsert: insert or update if technician_id + inventory_id combination exists
      const { data, error } = await supabase
        .from('technician_inventory')
        .upsert({
          technician_id: item.technician_id,
          inventory_id: item.inventory_id,
          quantity: item.quantity
        }, {
          onConflict: 'technician_id,inventory_id'
        })
        .select(`
          *,
          technician:technicians(id, full_name, employee_id),
          inventory:inventory(id, product_name, code, price)
        `)
        .single();
      
      return { data, error };
    },

    /** Minimal rows for assign flows — no joins (low egress). */
    async getAssignmentKeys(technicianIds: string[], inventoryIds: string[]) {
      if (technicianIds.length === 0 || inventoryIds.length === 0) {
        return { data: [] as Array<{ id: string; technician_id: string; inventory_id: string; quantity: number }>, error: null };
      }
      const IN_CHUNK = 150;
      const rows: Array<{ id: string; technician_id: string; inventory_id: string; quantity: number }> = [];
      for (let i = 0; i < inventoryIds.length; i += IN_CHUNK) {
        const invChunk = inventoryIds.slice(i, i + IN_CHUNK);
        const { data, error } = await supabase
          .from('technician_inventory')
          .select('id, technician_id, inventory_id, quantity')
          .in('technician_id', technicianIds)
          .in('inventory_id', invChunk);
        if (error) return { data: null, error };
        if (data?.length) rows.push(...data);
      }
      return { data: rows, error: null };
    },

    /** Top Up via SECURITY DEFINER RPC: move qty from main → technician_inventory (self or admin for p_technician_id). */
    async topUpFromMain(inventoryId: string, qty: number, technicianId?: string) {
      const { data, error } = await supabase.rpc('technician_top_up_used_item', {
        p_inventory_id: inventoryId,
        p_qty: qty,
        ...(technicianId ? { p_technician_id: technicianId } : {}),
      });
      return { data, error };
    },

    /** Batch upsert assignments — no returning rows (low egress). */
    async bulkUpsertAssignments(
      items: Array<{ technician_id: string; inventory_id: string; quantity: number }>
    ) {
      if (items.length === 0) return { error: null };
      const UPSERT_CHUNK = 500;
      for (let i = 0; i < items.length; i += UPSERT_CHUNK) {
        const chunk = items.slice(i, i + UPSERT_CHUNK);
        const { error } = await supabase
          .from('technician_inventory')
          .upsert(chunk, { onConflict: 'technician_id,inventory_id' });
        if (error) return { error };
      }
      return { error: null };
    },
  },

  // Job Parts Used operations
  jobPartsUsed: {
    async getByJob(jobId: string) {
      const withFull = await supabase
        .from('job_parts_used')
        .select(`
          id,
          job_id,
          technician_id,
          inventory_id,
          custom_name,
          quantity_used,
          price_at_time_of_use,
          source,
          inventory:inventory(id, product_name, full_name, code)
        `)
        .eq('job_id', jobId)
        .order('created_at', { ascending: false });
      if (!withFull.error) {
        return { data: withFull.data, error: null };
      }
      const msg = String(withFull.error.message || '');
      if (msg.includes('full_name') || msg.includes('column')) {
        const fallback = await supabase
          .from('job_parts_used')
          .select(`
            id,
            job_id,
            technician_id,
            inventory_id,
            custom_name,
            quantity_used,
            price_at_time_of_use,
            source,
            inventory:inventory(id, product_name, code)
          `)
          .eq('job_id', jobId)
          .order('created_at', { ascending: false });
        return { data: fallback.data, error: fallback.error };
      }
      return { data: withFull.data, error: withFull.error };
    },

    async getByTechnician(technicianId: string) {
      const { data, error } = await supabase
        .from('job_parts_used')
        .select(`
          id,
          job_id,
          technician_id,
          inventory_id,
          custom_name,
          quantity_used,
          created_at,
          inventory:inventory(id, product_name, full_name, code),
          job:jobs(
            completed_at,
            end_time,
            requirements,
            job_number,
            customer:customers(full_name)
          )
        `)
        .eq('technician_id', technicianId)
        .order('created_at', { ascending: false });
      
      return { data, error };
    },

    /**
     * Spare parts logged (job_parts_used) within a date range, joined with inventory
     * info — for on-demand Spare Parts analytics. Pass null dates for "all time".
     */
    async getUsedInRange(startDate?: string | null, endDate?: string | null) {
      let query = supabase
        .from('job_parts_used')
        .select(
          'id, job_id, technician_id, inventory_id, custom_name, quantity_used, price_at_time_of_use, created_at, inventory:inventory(id, product_name, code, price)'
        )
        .order('created_at', { ascending: false });
      if (startDate) query = query.gte('created_at', startDate);
      if (endDate) query = query.lte('created_at', endDate);
      const { data, error } = await query;
      return { data: data || [], error };
    },

    /** Fetch parts used for given job IDs with stored price_at_time_of_use (for analytics spare parts cost) */
    async getWithPriceByJobIds(jobIds: string[]) {
      if (!jobIds?.length) return { data: [] as any[], error: null };
      const { data, error } = await supabase
        .from('job_parts_used')
        .select('id, job_id, quantity_used, price_at_time_of_use, inventory:inventory(id, price)')
        .in('job_id', jobIds);
      return { data: data || [], error };
    },

    async create(part: { job_id: string; technician_id: string; inventory_id?: string | null; custom_name?: string | null; quantity_used: number; price_at_time_of_use?: number; source?: 'technician' | 'main' | 'custom' }) {
      // Custom (one-off) parts have no inventory row; they always carry their own price.
      const isCustom = part.source === 'custom' || !part.inventory_id;
      const source = isCustom ? 'custom' : part.source === 'main' ? 'main' : 'technician';
      // If price not provided, fetch it from inventory (only possible for catalog parts).
      let priceToStore = part.price_at_time_of_use;
      if ((priceToStore === undefined || priceToStore === null) && part.inventory_id) {
        const { data: invData } = await supabase
          .from('inventory')
          .select('price')
          .eq('id', part.inventory_id)
          .single();
        priceToStore = invData?.price ? Number(invData.price) : 0;
      }
      if (priceToStore === undefined || priceToStore === null) priceToStore = 0;

      const { data, error } = await supabase
        .from('job_parts_used')
        .insert({
          job_id: part.job_id,
          technician_id: part.technician_id,
          inventory_id: part.inventory_id ?? null,
          custom_name: isCustom ? (part.custom_name ?? null) : null,
          quantity_used: part.quantity_used,
          price_at_time_of_use: priceToStore,
          source
        })
        .select(`
          id,
          job_id,
          technician_id,
          inventory_id,
          custom_name,
          quantity_used,
          price_at_time_of_use,
          source,
          created_at,
          inventory:inventory(id, product_name, code)
        `)
        .single();

      // UNIQUE(job_id, inventory_id, source): merge quantity when insert races or
      // a bundle lists the same part twice (same source).
      const isUniqueViolation =
        error &&
        (error.code === '23505' ||
          (typeof error.message === 'string' &&
            (error.message.includes('job_parts_used_job_inv_source_key') ||
              error.message.includes('job_parts_used_job_id_inventory_id_key') ||
              error.message.includes('duplicate key'))));
      if (isUniqueViolation) {
        const { data: existing, error: fetchErr } = await supabase
          .from('job_parts_used')
          .select('id, quantity_used')
          .eq('job_id', part.job_id)
          .eq('inventory_id', part.inventory_id)
          .eq('source', source)
          .maybeSingle();
        if (fetchErr || !existing) return { data: null, error: error };
        const mergedQty = Number(existing.quantity_used) + Number(part.quantity_used);
        return this.update(existing.id, { quantity_used: mergedQty });
      }

      return { data, error };
    },

    async update(id: string, updates: { quantity_used?: number; price_at_time_of_use?: number }) {
      const { data, error } = await supabase
        .from('job_parts_used')
        .update(updates)
        .eq('id', id)
        .select('id, quantity_used, inventory_id, source, custom_name, price_at_time_of_use')
        .single();
      
      return { data, error };
    },

    async delete(id: string) {
      // `.select()` so RLS blocking a delete is visible (otherwise PostgREST
      // returns no error when 0 rows match / 0 rows are deleted).
      const { data, error } = await supabase
        .from('job_parts_used')
        .delete()
        .eq('id', id)
        .select('id');

      if (error) return { error };
      if (!data?.length) {
        return {
          error: {
            message:
              'Part was not deleted. You may not have permission to remove this part, or it was already removed.',
          },
        };
      }
      return { error: null };
    },

    /** Write parts_cost_total from an already-known row set (no re-fetch). */
    async updatePartsCostTotal(jobId: string, total: number): Promise<{ error: any }> {
      const { error } = await supabase
        .from('jobs')
        .update({ parts_cost_total: total })
        .eq('id', jobId);
      return { error };
    },

    /** Recompute total parts cost for a job and update jobs.parts_cost_total. Call after create/update/delete of job_parts_used. */
    async recalculateAndUpdateJobPartsCost(jobId: string): Promise<{ error: any }> {
      const { data: rows, error: fetchError } = await this.getWithPriceByJobIds([jobId]);
      if (fetchError) return { error: fetchError };
      const total = (rows || []).reduce((sum: number, row: any) => {
        const qty = Number(row.quantity_used) || 0;
        const invPrice = (row as any).inventory?.price;
        const price = row.price_at_time_of_use !== null && row.price_at_time_of_use !== undefined
          ? Number(row.price_at_time_of_use)
          : (invPrice != null ? Number(invPrice) : 0);
        return sum + qty * price;
      }, 0);
      return this.updatePartsCostTotal(jobId, total);
    }
  },

  // Structured product/part warranties (admin-managed). Requires scripts/add-warranties.sql.
  warranties: {
    /** A customer's warranties (newest-first) with their covered items. */
    async getByCustomer(customerId: string) {
      const { data, error } = await supabase
        .from('warranties')
        .select(`
          id,
          customer_id,
          job_id,
          start_date,
          end_date,
          default_months,
          notes,
          created_at,
          items:warranty_items(
            id,
            warranty_id,
            category,
            label,
            inventory_id,
            job_part_id,
            months,
            duration_days,
            start_date,
            end_date,
            covered,
            notes
          )
        `)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });
      return { data: data || [], error };
    },

    /**
     * Create a warranty header plus its items in one call. Items are inserted after
     * the header; if item insert fails the header is rolled back (deleted) so we never
     * leave an empty warranty behind.
     */
    async create(
      warranty: {
        customer_id: string;
        job_id?: string | null;
        start_date: string;
        end_date: string;
        default_months: number;
        notes?: string | null;
      },
      items: Array<{
        category: string;
        label: string;
        inventory_id?: string | null;
        job_part_id?: string | null;
        months: number;
        duration_days?: number;
        start_date: string;
        end_date: string;
        covered?: boolean;
        notes?: string | null;
      }>
    ) {
      const { data: header, error: headerErr } = await supabase
        .from('warranties')
        .insert({
          customer_id: warranty.customer_id,
          job_id: warranty.job_id ?? null,
          start_date: warranty.start_date,
          end_date: warranty.end_date,
          default_months: warranty.default_months,
          notes: warranty.notes ?? null,
        })
        .select('id')
        .single();
      if (headerErr || !header) return { data: null, error: headerErr };

      if (items.length > 0) {
        const rows = items.map((it) => ({
          warranty_id: header.id,
          category: it.category,
          label: it.label,
          inventory_id: it.inventory_id ?? null,
          job_part_id: it.job_part_id ?? null,
          months: it.months,
          duration_days: it.duration_days ?? it.months * 30,
          start_date: it.start_date,
          end_date: it.end_date,
          covered: it.covered ?? true,
          notes: it.notes ?? null,
        }));
        const { error: itemsErr } = await supabase.from('warranty_items').insert(rows);
        if (itemsErr) {
          await supabase.from('warranties').delete().eq('id', header.id);
          return { data: null, error: itemsErr };
        }
      }
      return { data: header, error: null };
    },

    async updateHeader(
      id: string,
      updates: { start_date?: string; end_date?: string; default_months?: number; notes?: string | null }
    ) {
      const { data, error } = await supabase
        .from('warranties')
        .update(updates)
        .eq('id', id)
        .select('id')
        .single();
      return { data, error };
    },

    /**
     * Full edit of an existing warranty: update the header and REPLACE all items
     * (delete existing rows, insert the provided set). Simpler and race-free vs diffing.
     */
    async update(
      id: string,
      header: { start_date: string; end_date: string; default_months: number; notes?: string | null },
      items: Array<{
        category: string;
        label: string;
        inventory_id?: string | null;
        job_part_id?: string | null;
        months: number;
        duration_days?: number;
        start_date: string;
        end_date: string;
        covered?: boolean;
        notes?: string | null;
      }>
    ) {
      const { error: headerErr } = await supabase
        .from('warranties')
        .update({
          start_date: header.start_date,
          end_date: header.end_date,
          default_months: header.default_months,
          notes: header.notes ?? null,
        })
        .eq('id', id);
      if (headerErr) return { error: headerErr };

      const { error: delErr } = await supabase.from('warranty_items').delete().eq('warranty_id', id);
      if (delErr) return { error: delErr };

      if (items.length > 0) {
        const rows = items.map((it) => ({
          warranty_id: id,
          category: it.category,
          label: it.label,
          inventory_id: it.inventory_id ?? null,
          job_part_id: it.job_part_id ?? null,
          months: it.months,
          duration_days: it.duration_days ?? it.months * 30,
          start_date: it.start_date,
          end_date: it.end_date,
          covered: it.covered ?? true,
          notes: it.notes ?? null,
        }));
        const { error: insErr } = await supabase.from('warranty_items').insert(rows);
        if (insErr) return { error: insErr };
      }
      return { error: null };
    },

    async delete(id: string) {
      const { error } = await supabase.from('warranties').delete().eq('id', id);
      return { error };
    },

    async deleteItem(itemId: string) {
      const { error } = await supabase.from('warranty_items').delete().eq('id', itemId);
      return { error };
    },

    /** Admin-side preview of the public lookup (same RPC the Netlify function calls). */
    async lookupByPhone(phone: string) {
      const { data, error } = await supabase.rpc('get_warranties_by_phone', { p_phone: phone });
      return { data, error };
    },
  },

  reminders: {
    async create(row: {
      entity_type: 'customer' | 'job' | 'general';
      entity_id?: string | null;
      title: string;
      notes?: string | null;
      reminder_at: string;
      created_by?: string | null;
      interval_type?: 'days' | 'months' | null;
      interval_value?: number | null;
      service_status?: ServiceReminderStatus | null;
      last_contacted_at?: string | null;
      status_note?: string | null;
    }) {
      const { data, error } = await supabase
        .from('reminders')
        .insert({
          entity_type: row.entity_type,
          entity_id: row.entity_id ?? null,
          title: row.title,
          notes: row.notes ?? null,
          reminder_at: row.reminder_at,
          created_by: row.created_by ?? null,
          interval_type: row.interval_type ?? null,
          interval_value: row.interval_value ?? null,
          ...(row.service_status !== undefined ? { service_status: row.service_status } : {}),
          ...(row.last_contacted_at !== undefined ? { last_contacted_at: row.last_contacted_at } : {}),
          ...(row.status_note !== undefined ? { status_note: row.status_note } : {}),
        })
        .select()
        .single();
      return { data, error };
    },
    async getForTodayAndTomorrow() {
      // Use local date so "today" matches reminder_at stored as local date (e.g. from date picker)
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const tomorrowDate = new Date(now);
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      const tomorrow = `${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth() + 1).padStart(2, '0')}-${String(tomorrowDate.getDate()).padStart(2, '0')}`;
      const { data, error } = await supabase
        .from('reminders')
        .select(REMINDER_ROW_COLUMNS)
        .in('reminder_at', [today, tomorrow])
        .neq('title', PENDING_PAYMENT_REMINDER_TITLE)
        .is('completed_at', null)
        .order('reminder_at', { ascending: true })
        .order('created_at', { ascending: true });
      return { data: data || [], error };
    },
    async getAll(includeCompleted = false, limitCount = 1000) {
      let query = supabase
        .from('reminders')
        .select(REMINDER_ROW_COLUMNS)
        .neq('title', PENDING_PAYMENT_REMINDER_TITLE)
        .order('reminder_at', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(Math.min(limitCount, 2000));
      if (!includeCompleted) {
        query = query.is('completed_at', null);
      }
      const { data, error } = await query;
      return { data: data || [], error };
    },
    async getByEntity(entityType: 'customer' | 'job' | 'general', entityId: string | null, includeCompleted = false) {
      if (!entityId) return { data: [], error: null };
      let query = supabase
        .from('reminders')
        .select(REMINDER_ROW_COLUMNS)
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .neq('title', PENDING_PAYMENT_REMINDER_TITLE)
        .order('reminder_at', { ascending: true })
        .order('created_at', { ascending: false });
      if (!includeCompleted) {
        query = query.is('completed_at', null);
      }
      const { data, error } = await query;
      return { data: data || [], error };
    },

    /** Single reminder row for Settings deep-links (excludes pending-payment title). */
    async getById(id: string) {
      if (!id) return { data: null, error: null };
      const { data, error } = await supabase
        .from('reminders')
        .select(REMINDER_ROW_COLUMNS)
        .eq('id', id)
        .neq('title', PENDING_PAYMENT_REMINDER_TITLE)
        .maybeSingle();
      return { data: (data as Reminder | null) ?? null, error };
    },

    /**
     * Settings → Reminders list: server-paginated (page size ~20). Pending-payment
     * rows are excluded. Search matches title/notes, optional customer ids from
     * searchSlim, and entity_type=general when the query contains "general".
     */
    async getSettingsRemindersPaginated(opts: {
      page?: number;
      pageSize?: number;
      mode?: 'upcoming' | 'active' | 'completed_recent';
      upcomingDays?: number;
      completedDays?: number;
      search?: string;
      /** Pre-resolved customer UUIDs from searchSlim (caller supplies to avoid duplicate search). */
      customerIds?: string[];
    } = {}) {
      const page = Math.max(1, opts.page ?? 1);
      const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 50);
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const mode = opts.mode ?? 'upcoming';
      const upcomingDays = Math.max(1, opts.upcomingDays ?? 7);
      const completedDays = Math.max(1, opts.completedDays ?? 7);

      const now = new Date();
      const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const untilDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + upcomingDays);
      const untilYmd = `${untilDate.getFullYear()}-${String(untilDate.getMonth() + 1).padStart(2, '0')}-${String(untilDate.getDate()).padStart(2, '0')}`;
      const completedCutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - completedDays).toISOString();

      let query = supabase
        .from('reminders')
        .select(REMINDER_ROW_COLUMNS, { count: 'exact' })
        .neq('title', PENDING_PAYMENT_REMINDER_TITLE);

      if (mode === 'completed_recent') {
        query = query
          .not('completed_at', 'is', null)
          .gte('completed_at', completedCutoff)
          .order('completed_at', { ascending: false });
      } else {
        query = query.is('completed_at', null);
        if (mode === 'upcoming') {
          query = query.gte('reminder_at', todayYmd).lte('reminder_at', untilYmd);
        }
        query = query
          .order('reminder_at', { ascending: true })
          .order('created_at', { ascending: true });
      }

      const rawSearch = (opts.search || '').trim();
      if (rawSearch) {
        const escaped = escapeForLike(rawSearch).replace(/,/g, '');
        const orParts: string[] = [];
        if (escaped) {
          orParts.push(`title.ilike.%${escaped}%`, `notes.ilike.%${escaped}%`);
        }
        if (rawSearch.toLowerCase().includes('general')) {
          orParts.push('entity_type.eq.general');
        }
        const customerIds = (opts.customerIds || []).filter(Boolean).slice(0, 40);
        if (customerIds.length > 0) {
          orParts.push(`entity_id.in.(${customerIds.join(',')})`);
        }
        if (orParts.length > 0) {
          query = query.or(orParts.join(','));
        }
      }

      const { data, error, count } = await query.range(from, to);
      return {
        data: (data || []) as unknown as Reminder[],
        error,
        count: count ?? 0,
      };
    },
    async update(id: string, updates: {
      title?: string;
      notes?: string | null;
      reminder_at?: string;
      completed_at?: string | null;
      interval_type?: 'days' | 'months' | null;
      interval_value?: number | null;
      service_status?: ServiceReminderStatus | null;
      last_contacted_at?: string | null;
      status_note?: string | null;
    }) {
      const { data, error } = await supabase
        .from('reminders')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      return { data, error };
    },
    async delete(id: string) {
      const { error } = await supabase.from('reminders').delete().eq('id', id);
      return { error };
    },

    /**
     * Reminder tracker: all active (incomplete) reminders — one-time or recurring,
     * general or customer-linked — ordered due/overdue first. Server-side paginated
     * and status-filtered so egress stays flat as the list grows. Pending-payment
     * reminders are excluded (they are managed in their own section).
     *
     * Customer name/phone are NOT joined here (entity_id has no FK); the caller
     * batches a `customers` lookup for the returned page's customer reminders only.
     */
    async getActiveRemindersPaginated(opts: {
      page?: number;
      pageSize?: number;
      status?: ServiceReminderStatus | 'all';
      /** When set, match any of these statuses (overrides single `status`). */
      statuses?: ServiceReminderStatus[];
      dueOnly?: boolean;
      /** Upper bound (inclusive) on reminder_at, e.g. today+7 for a "this week" window. YYYY-MM-DD. */
      untilDate?: string;
      /** Only every-N-months reminders (6 / 12 month service cadence). */
      recurringOnly?: boolean;
    } = {}) {
      const page = Math.max(1, opts.page ?? 1);
      const pageSize = Math.min(Math.max(opts.pageSize ?? 15, 1), 50);
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let query = supabase
        .from('reminders')
        .select(REMINDER_TRACKER_COLUMNS, { count: 'exact' })
        .neq('title', PENDING_PAYMENT_REMINDER_TITLE)
        .is('completed_at', null);
      if (opts.recurringOnly) {
        query = query.eq('interval_type', 'months').gt('interval_value', 0);
      }
      if (opts.statuses?.length) {
        query = query.in('service_status', opts.statuses);
      } else if (opts.status && opts.status !== 'all') {
        query = query.eq('service_status', opts.status);
      }
      // `dueOnly` (<= today) and `untilDate` (<= given date) are both upper bounds; apply the tighter one.
      let upperBound: string | undefined = opts.untilDate;
      if (opts.dueOnly) {
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        upperBound = upperBound && upperBound < today ? upperBound : today;
      }
      if (upperBound) {
        query = query.lte('reminder_at', upperBound);
      }
      const { data, error, count } = await query
        .order('reminder_at', { ascending: true })
        .order('created_at', { ascending: true })
        .range(from, to);
      return { data: (data || []) as unknown as Reminder[], error, count: count ?? 0 };
    },

    /**
     * Reminder tracker search: find active customer reminders for a set of customer
     * ids (resolved by the caller via `customers.searchSlim`). Capped – search
     * result sets are small, so no pagination needed.
     */
    async getActiveByCustomerIds(customerIds: string[]) {
      if (!customerIds?.length) return { data: [] as Reminder[], error: null };
      const { data, error } = await supabase
        .from('reminders')
        .select(REMINDER_TRACKER_COLUMNS)
        .eq('entity_type', 'customer')
        .neq('title', PENDING_PAYMENT_REMINDER_TITLE)
        .is('completed_at', null)
        .in('entity_id', customerIds.slice(0, 200))
        .order('reminder_at', { ascending: true })
        .limit(200);
      return { data: (data || []) as unknown as Reminder[], error };
    },

    /**
     * Reminder tracker "Done today" view: reminders whose `completed_at` falls on
     * the local calendar today (e.g. cleared via the admin "Got it" popup). Lets
     * the user still call / create a job / reopen them. Pending-payment reminders
     * are excluded. Server-side paginated.
     */
    async getCompletedTodayPaginated(opts: { page?: number; pageSize?: number } = {}) {
      const page = Math.max(1, opts.page ?? 1);
      const pageSize = Math.min(Math.max(opts.pageSize ?? 15, 1), 50);
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
      const { data, error, count } = await supabase
        .from('reminders')
        .select(REMINDER_TRACKER_COLUMNS, { count: 'exact' })
        .neq('title', PENDING_PAYMENT_REMINDER_TITLE)
        .not('completed_at', 'is', null)
        .gte('completed_at', startOfToday)
        .lt('completed_at', startOfTomorrow)
        .order('completed_at', { ascending: false })
        .range(from, to);
      return { data: (data || []) as unknown as Reminder[], error, count: count ?? 0 };
    },

    /** Update the contact outcome for a recurring-service reminder (stamps last_contacted_at). */
    async updateServiceStatus(id: string, status: ServiceReminderStatus, statusNote?: string | null) {
      const updates: {
        service_status: ServiceReminderStatus;
        last_contacted_at: string;
        status_note?: string | null;
      } = {
        service_status: status,
        last_contacted_at: new Date().toISOString(),
      };
      if (statusNote !== undefined) updates.status_note = statusNote;
      const { data, error } = await supabase
        .from('reminders')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      return { data, error };
    },
  },

  /**
   * Admin header bell: three `head: true` count queries only (minimal egress). All buckets are **today only** (local calendar day).
   * - General reminders: incomplete, not pending-payment title, `reminder_at` = today.
   * - Customer pending payments: incomplete, pending-payment title, `reminder_at` = today.
   * - AMC contracts: `created_at` within today (local).
   */
  adminNotifications: {
    async getCounts(): Promise<{
      generalReminders: number;
      pendingCustomerPayments: number;
      recentAmcContracts: number;
      error?: string;
    }> {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      const startISO = startOfDay.toISOString();
      const endISO = endOfDay.toISOString();

      const [gr, pp, amc] = await Promise.all([
        supabase
          .from('reminders')
          .select('id', { count: 'exact', head: true })
          .is('completed_at', null)
          .eq('reminder_at', today)
          .neq('title', PENDING_PAYMENT_REMINDER_TITLE),
        supabase
          .from('reminders')
          .select('id', { count: 'exact', head: true })
          .is('completed_at', null)
          .eq('title', PENDING_PAYMENT_REMINDER_TITLE)
          .eq('reminder_at', today),
        supabase
          .from('amc_contracts')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', startISO)
          .lte('created_at', endISO),
      ]);

      const firstErr = gr.error || pp.error || amc.error;
      return {
        generalReminders: gr.count ?? 0,
        pendingCustomerPayments: pp.count ?? 0,
        recentAmcContracts: amc.count ?? 0,
        error: firstErr ? firstErr.message : undefined,
      };
    },
  },

  /**
   * Website booking funnel: record name + phone when user leaves mid-flow (anon insert).
   * Admin: slim `select` + dismiss update. Poll interval should stay ≥ 60s to limit egress.
   */
  bookingAbandonments: {
    async upsertFromPublicPage(row: {
      full_name: string;
      phone: string;
      phone_normalized: string;
      step_reached: number;
      bucket_date: string;
    }) {
      const { error } = await supabase.from('booking_abandonments').upsert(
        {
          full_name: row.full_name.trim(),
          phone: row.phone,
          phone_normalized: row.phone_normalized,
          step_reached: row.step_reached,
          bucket_date: row.bucket_date,
          dismissed_at: null,
        },
        { onConflict: 'phone_normalized,bucket_date' }
      );
      return { error };
    },

    /** For `pagehide` / tab close: browser may cancel ordinary fetch; keepalive improves delivery. */
    async upsertFromPublicPageKeepalive(row: {
      full_name: string;
      phone: string;
      phone_normalized: string;
      step_reached: number;
      bucket_date: string;
    }): Promise<{ ok: boolean }> {
      if (typeof fetch === 'undefined') return { ok: false };
      const key = buildTimeKey;
      const base = buildTimeUrl.replace(/\/$/, '');
      try {
        const res = await fetch(
          `${base}/rest/v1/booking_abandonments?on_conflict=phone_normalized,bucket_date`,
          {
            method: 'POST',
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates,return=minimal',
            },
            body: JSON.stringify([
              {
                full_name: row.full_name.trim(),
                phone: row.phone,
                phone_normalized: row.phone_normalized,
                step_reached: row.step_reached,
                bucket_date: row.bucket_date,
                dismissed_at: null,
              },
            ]),
            keepalive: true,
          }
        );
        return { ok: res.ok };
      } catch {
        return { ok: false };
      }
    },

    async listActivePending(limit = 12) {
      const lim = Math.min(Math.max(1, limit), 50);
      // Egress guard: only fetch recent rows (abandonments are only useful short-term).
      const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('booking_abandonments')
        .select('id,full_name,phone,step_reached,created_at')
        .is('dismissed_at', null)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(lim);
      return { data: data || [], error };
    },

    async dismiss(id: string) {
      const { error } = await supabase.from('booking_abandonments').delete().eq('id', id);
      return { error };
    },
  },

  /** Admin dashboard: live booking intent banner (writes go via booking-intent Netlify function). */
  websiteBookingIntent: {
    /** @deprecated Use pushWebsiteBookingIntent from @/lib/bookingIntent */
    async pushLive() {
      return {
        error: { message: 'Direct intent RPC disabled — use booking-intent function', code: 'INTENT_PROXY_REQUIRED' } as any,
      };
    },
    /** @deprecated Use markWebsiteBookingIntentBooked from @/lib/bookingIntent */
    async markBooked() {
      return { error: null };
    },
    async listActive(limit = 10) {
      const lim = Math.min(Math.max(1, limit), 20);
      // Egress guard: only fetch recent rows (live intent banner is only useful short-term).
      const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const INTENT_LIVE_COLUMNS =
        'id, full_name, phone, current_step, created_at, updated_at, site_key, booked_at, booked_job_number, dismissed_at, quarantined';
      const { data, error } = await supabase
        .from('website_booking_intent')
        .select(INTENT_LIVE_COLUMNS)
        .is('dismissed_at', null)
        .gte('updated_at', cutoff)
        .order('updated_at', { ascending: false })
        .limit(lim);
      if (error) {
        // Older DBs may lack booked_*/quarantined — fall back to core columns only.
        const { data: fallback, error: fallbackError } = await supabase
          .from('website_booking_intent')
          .select(
            'id, full_name, phone, current_step, created_at, updated_at, site_key, dismissed_at'
          )
          .is('dismissed_at', null)
          .gte('updated_at', cutoff)
          .order('updated_at', { ascending: false })
          .limit(lim);
        const rows = (fallback || []).filter(
          (row) => (row as { quarantined?: boolean }).quarantined !== true
        );
        return { data: rows, error: fallbackError };
      }
      const rows = (data || []).filter((row) => (row as { quarantined?: boolean }).quarantined !== true);
      return { data: rows, error };
    },
    /** Move row to website_booking_intent_archive, then delete from live table. */
    async dismiss(id: string) {
      const { data, error } = await supabase.rpc('archive_website_booking_intent', { p_id: id });
      return { data, error };
    },
  },

  /** Settings: Done booking archive (copies of live intents after Done). */
  websiteBookingIntentArchive: {
    async list(opts?: { limit?: number; offset?: number; search?: string }) {
      const lim = Math.min(Math.max(1, opts?.limit ?? 50), 100);
      const offset = Math.max(0, opts?.offset ?? 0);
      const ARCHIVE_COLUMNS =
        'id, source_id, full_name, phone, phone_normalized, site_key, current_step, intent_created_at, intent_updated_at, booked_at, booked_job_number, archived_at';
      let query = supabase
        .from('website_booking_intent_archive')
        .select(ARCHIVE_COLUMNS, { count: 'exact' })
        .order('archived_at', { ascending: false })
        .range(offset, offset + lim - 1);
      const q = opts?.search?.trim();
      if (q) {
        const escaped = q.replace(/[%_,]/g, '');
        if (escaped) {
          query = query.or(
            `full_name.ilike.%${escaped}%,phone.ilike.%${escaped}%,phone_normalized.ilike.%${escaped}%`
          );
        }
      }
      const { data, error, count } = await query;
      return { data: data || [], error, count: count ?? 0 };
    },
    async deleteForever(id: string) {
      const { error } = await supabase.from('website_booking_intent_archive').delete().eq('id', id);
      return { error };
    },
    async deleteForeverMany(ids: string[]) {
      if (!ids.length) return { error: null };
      const { error } = await supabase.from('website_booking_intent_archive').delete().in('id', ids);
      return { error };
    },
  },

  analyticsData: {
    /** Paginated fetch for analytics salary totals (Supabase returns max 1000 rows per request). */
    async getAllTechnicianPayments(opts?: { startISO?: string; endISO?: string }) {
      return fetchAnalyticsPages((from, to) => {
        let query = supabase
          .from('technician_payments')
          .select('technician_id, commission_amount, payment_status')
          .range(from, to);
        if (opts?.startISO) query = query.gte('created_at', opts.startISO);
        if (opts?.endISO) query = query.lte('created_at', opts.endISO);
        return query;
      });
    },
  },

  analyticsPaginated: {
    async getTopLocations(opts: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
      search?: string;
    }) {
      const { data, error } = await supabase.rpc('get_analytics_top_locations', {
        p_start: opts.startDate?.toISOString() ?? null,
        p_end: opts.endDate?.toISOString() ?? null,
        p_limit: opts.limit ?? 10,
        p_offset: opts.offset ?? 0,
        p_search: opts.search?.trim() || null,
      });
      return { data: data as { total: number; rows: unknown[] } | null, error };
    },
    async getTopBrands(opts: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
      search?: string;
    }) {
      const { data, error } = await supabase.rpc('get_analytics_top_brands', {
        p_start: opts.startDate?.toISOString() ?? null,
        p_end: opts.endDate?.toISOString() ?? null,
        p_limit: opts.limit ?? 10,
        p_offset: opts.offset ?? 0,
        p_search: opts.search?.trim() || null,
      });
      return { data: data as { total: number; rows: unknown[] } | null, error };
    },
    async getSparePartsUsage(opts: {
      startISO?: string | null;
      endISO?: string | null;
      limit?: number;
      offset?: number;
      search?: string;
    }) {
      const { data, error } = await supabase.rpc('get_analytics_spare_parts_usage', {
        p_start: opts.startISO ?? null,
        p_end: opts.endISO ?? null,
        p_limit: opts.limit ?? 10,
        p_offset: opts.offset ?? 0,
        p_search: opts.search?.trim() || null,
      });
      return {
        data: data as {
          total: number;
          summary: { distinct_parts: number; units_used: number; parts_value: number };
          rows: unknown[];
        } | null,
        error,
      };
    },
    /** Pre-aggregated CRM dashboard KPIs (admin-only RPC). Returns null when RPC not deployed. */
    async getDashboard(startDate?: Date, endDate?: Date) {
      const { data, error } = await supabase.rpc('get_analytics_dashboard', {
        p_start: startDate?.toISOString() ?? null,
        p_end: endDate?.toISOString() ?? null,
      });
      return { data, error };
    },
    /** Pre-aggregated expense totals (admin-only RPC). Returns null when RPC not deployed. */
    async getExpenseTotals(startDate?: string, endDate?: string) {
      const { data, error } = await supabase.rpc('get_analytics_expense_totals', {
        p_start_date: startDate ?? null,
        p_end_date: endDate ?? null,
      });
      return { data, error };
    },
    /** Per-technician payment + extra commission sums for Analytics salary block. */
    async getCommissionTotals(opts: {
      startISO?: string;
      endISO?: string;
      startDate?: string;
      endDate?: string;
    }) {
      const { data, error } = await supabase.rpc('get_analytics_commission_totals', {
        p_start: opts.startISO ?? null,
        p_end: opts.endISO ?? null,
        p_start_date: opts.startDate ?? null,
        p_end_date: opts.endDate ?? null,
      });
      return { data, error };
    },
    /** Calendar-month salary totals (Payments parity, admin-only RPC). */
    async getCalendarSalaryTotals(opts: {
      startISO: string;
      endISO: string;
      startDate: string;
      endDate: string;
    }) {
      const { data, error } = await supabase.rpc('get_analytics_calendar_salary_totals', {
        p_start: opts.startISO,
        p_end: opts.endISO,
        p_start_date: opts.startDate,
        p_end_date: opts.endDate,
      });
      return { data, error };
    },
    async getReturnComplaints(startDate?: Date, endDate?: Date) {
      const { data, error } = await supabase.rpc('get_analytics_return_complaints', {
        p_start: startDate?.toISOString() ?? null,
        p_end: endDate?.toISOString() ?? null,
      });
      return { data, error };
    },
    async getDirectWebsiteConversions(startDate?: Date, endDate?: Date) {
      const { data, error } = await supabase.rpc('get_analytics_direct_website_conversions', {
        p_start: startDate?.toISOString() ?? null,
        p_end: endDate?.toISOString() ?? null,
      });
      return { data, error };
    },
    async getRepeatVsNew(startDate?: Date, endDate?: Date) {
      const { data, error } = await supabase.rpc('get_analytics_repeat_vs_new', {
        p_start: startDate?.toISOString() ?? null,
        p_end: endDate?.toISOString() ?? null,
      });
      return { data, error };
    },
    async getMonthlyTrends(opts: {
      startDate?: Date | null;
      endDate?: Date | null;
      granularity?: 'month' | 'week' | 'day';
      serviceType?: string | null;
      serviceSubType?: string | null;
      equipmentBrand?: string | null;
      serviceBrand?: string | null;
      leadSourceKey?: string | null;
      technicianId?: string | null;
      paymentMethod?: string | null;
    }) {
      const { data, error } = await supabase.rpc('get_analytics_monthly_trends', {
        p_start: opts.startDate?.toISOString() ?? null,
        p_end: opts.endDate?.toISOString() ?? null,
        p_granularity: opts.granularity ?? 'month',
        p_service_type: opts.serviceType ?? null,
        p_service_sub_type: opts.serviceSubType ?? null,
        p_equipment_brand: opts.equipmentBrand ?? null,
        p_service_brand: opts.serviceBrand ?? null,
        p_lead_source_key: opts.leadSourceKey ?? null,
        p_technician_id: opts.technicianId ?? null,
        p_payment_method: opts.paymentMethod ?? null,
      });
      return { data, error };
    },
    async getTrendDashboard(opts: {
      startDate: Date;
      endDate: Date;
      granularity?: 'month' | 'week' | 'day';
      compareMode?: 'previous_period' | 'previous_year' | null;
      serviceType?: string | null;
      serviceSubType?: string | null;
      equipmentBrand?: string | null;
      serviceBrand?: string | null;
      leadSourceKey?: string | null;
      technicianId?: string | null;
      paymentMethod?: string | null;
    }) {
      const { data, error } = await supabase.rpc('get_analytics_trend_dashboard', {
        p_start: opts.startDate.toISOString(),
        p_end: opts.endDate.toISOString(),
        p_granularity: opts.granularity ?? 'month',
        p_compare_mode: opts.compareMode ?? null,
        p_service_type: opts.serviceType ?? null,
        p_service_sub_type: opts.serviceSubType ?? null,
        p_equipment_brand: opts.equipmentBrand ?? null,
        p_service_brand: opts.serviceBrand ?? null,
        p_lead_source_key: opts.leadSourceKey ?? null,
        p_technician_id: opts.technicianId ?? null,
        p_payment_method: opts.paymentMethod ?? null,
      });
      return { data, error };
    },
    async getTrendRangeCompare(opts: {
      aStart: Date;
      aEnd: Date;
      bStart: Date;
      bEnd: Date;
      granularity?: 'month' | 'week' | 'day';
      serviceType?: string | null;
      serviceSubType?: string | null;
      equipmentBrand?: string | null;
      serviceBrand?: string | null;
      leadSourceKey?: string | null;
      technicianId?: string | null;
      paymentMethod?: string | null;
    }) {
      const { data, error } = await supabase.rpc('get_analytics_trend_range_compare', {
        p_a_start: opts.aStart.toISOString(),
        p_a_end: opts.aEnd.toISOString(),
        p_b_start: opts.bStart.toISOString(),
        p_b_end: opts.bEnd.toISOString(),
        p_granularity: opts.granularity ?? 'month',
        p_service_type: opts.serviceType ?? null,
        p_service_sub_type: opts.serviceSubType ?? null,
        p_equipment_brand: opts.equipmentBrand ?? null,
        p_service_brand: opts.serviceBrand ?? null,
        p_lead_source_key: opts.leadSourceKey ?? null,
        p_technician_id: opts.technicianId ?? null,
        p_payment_method: opts.paymentMethod ?? null,
      });
      return { data, error };
    },
  },

  /** Admin Settings — sent email log (Hostinger SMTP + open pixel). Slim columns, head count. */
  sentEmailLogs: {
    async list(
      opts: {
        page?: number;
        pageSize?: number;
        includeCount?: boolean;
      } & SentEmailLogQueryFilters
    ) {
      const page = Math.max(1, opts.page ?? 1);
      const pageSize = Math.min(Math.max(1, opts.pageSize ?? 20), 25);
      const offset = (page - 1) * pageSize;
      const includeCount = opts.includeCount !== false;

      const rpcArgs = buildSentEmailLogRpcArgs({
        ...opts,
        limit: pageSize,
        offset,
      });

      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'get_sent_email_logs_page',
        rpcArgs
      );

      if (!rpcError && rpcData) {
        const result = rpcData as SentEmailLogsPageResult;
        return {
          data: result.rows || [],
          error: null,
          count: includeCount ? result.total ?? 0 : undefined,
          mode: 'rpc' as const,
        };
      }

      if (rpcError && !isSentEmailLogsRpcNotFoundError(rpcError)) {
        return { data: [], error: rpcError, count: 0, mode: 'rpc' as const };
      }

      const from = offset;
      const to = from + pageSize - 1;

      const dataQuery = applySentEmailLogFilters(
        supabase.from('sent_email_logs').select(SENT_EMAIL_LOG_LIST_COLUMNS).order('sent_at', {
          ascending: false,
        }),
        opts
      ).range(from, to);

      if (!includeCount) {
        const { data, error } = await dataQuery;
        return {
          data: data || [],
          error,
          count: undefined as number | undefined,
          mode: 'fallback' as const,
        };
      }

      const countQuery = applySentEmailLogFilters(
        supabase.from('sent_email_logs').select('id', { count: 'exact', head: true }),
        opts
      );

      const [{ data, error }, { count, error: countError }] = await Promise.all([
        dataQuery,
        countQuery,
      ]);

      return {
        data: data || [],
        error: error || countError,
        count: count ?? 0,
        mode: 'fallback' as const,
      };
    },

    async deleteById(id: string) {
      const { error: rpcError } = await supabase.rpc('delete_sent_email_logs', { p_id: id });
      if (!rpcError) return { error: null };
      const msg = rpcError.message || '';
      if (!/delete_sent_email_logs|PGRST202|42883|schema cache/i.test(msg)) {
        return { error: rpcError };
      }
      const { error } = await supabase.from('sent_email_logs').delete().eq('id', id);
      if (error && /permission denied/i.test(error.message || '')) {
        return {
          error: {
            ...error,
            message:
              'Delete not allowed. Run scripts/delete-sent-email-logs-rpc.sql in Supabase SQL editor.',
          },
        };
      }
      return { error };
    },

    async deleteMatching(opts: SentEmailLogQueryFilters) {
      const dateRange = resolveSentEmailLogDateRange(opts);
      const { error: rpcError } = await supabase.rpc('delete_sent_email_logs', {
        p_id: null,
        p_filter: opts.filter ?? 'all',
        p_brand: opts.brand ?? 'all',
        p_template_type: opts.templateType ?? 'all',
        p_search: opts.search ?? '',
        p_sent_from: dateRange.from ?? null,
        p_sent_to: dateRange.to ?? null,
      });
      if (!rpcError) return { error: null };
      const msg = rpcError.message || '';
      if (!/delete_sent_email_logs|PGRST202|42883|schema cache/i.test(msg)) {
        return { error: rpcError };
      }
      const { error } = await applySentEmailLogFilters(
        supabase.from('sent_email_logs').delete(),
        opts
      );
      if (error && /permission denied/i.test(error.message || '')) {
        return {
          error: {
            ...error,
            message:
              'Delete not allowed. Run scripts/delete-sent-email-logs-rpc.sql in Supabase SQL editor.',
          },
        };
      }
      return { error };
    },

    async countMatching(opts: SentEmailLogQueryFilters) {
      const { count, error } = await applySentEmailLogFilters(
        supabase.from('sent_email_logs').select('id', { count: 'exact', head: true }),
        opts
      );
      return { count: count ?? 0, error };
    },
  },
};

/** Calendar date in Asia/Kolkata (for dedupe bucket with `phone_normalized`). */
export function getBookingAbandonBucketDateIST(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

export const validatePincode = async (pincode: string): Promise<boolean> => {
  // This would typically check against your service area database
  // For now, we'll return true for demo purposes
  // You can implement actual pincode validation here
  return pincode.length === 6 && /^\d+$/.test(pincode);
};

export interface CustomerMergePreview {
  primary: {
    id: string;
    customer_id: string;
    full_name: string;
    phone: string;
    alternate_phone?: string | null;
    customer_since?: string | null;
    jobs_count: number;
    visible_address?: string | null;
    address?: { street?: string; area?: string; city?: string } | null;
    location?: unknown;
  };
  secondary: {
    id: string;
    customer_id: string;
    full_name: string;
    phone: string;
    alternate_phone?: string | null;
    customer_since?: string | null;
    jobs_count: number;
    visible_address?: string | null;
    address?: { street?: string; area?: string; city?: string } | null;
    location?: unknown;
  };
  counts: {
    jobs: number;
    amc_contracts: number;
    call_history: number;
    tax_invoices: number;
    reminders: number;
  };
}

export interface CustomerMergeResult {
  primary_customer_id: string;
  deleted_customer_id: string;
  jobs_moved: number;
  amc_contracts_moved: number;
  call_history_moved: number;
  tax_invoices_moved: number;
  reminders_moved: number;
}

function isRpcNotFoundError(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  if (e?.code === 'PGRST202') return true;
  const msg = typeof e?.message === 'string' ? e.message : '';
  return msg.includes('Could not find the function') || msg.includes('does not exist');
}

function mapFromCustomerIdRows(rows: { customer_id?: string | null }[] | null): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const row of rows || []) {
    if (row.customer_id) map[row.customer_id] = true;
  }
  return map;
}

/** Customer UUID → true if they have at least one COMPLETED job (returning / prior service). */
export async function fetchCustomerIdsWithCompletedJobsMap(): Promise<Record<string, boolean>> {
  const cacheKey = 'completed_customers_map_v1';
  const hit = cacheGet<Record<string, boolean>>(cacheKey);
  if (hit) return hit;

  // Prefer DISTINCT in Postgres (one row per customer) vs paginating every completed job.
  const { data: distinctRows, error: distinctError } = await supabase.rpc(
    'get_distinct_completed_customer_ids'
  );

  if (!distinctError && distinctRows) {
    const map = mapFromCustomerIdRows(distinctRows as { customer_id: string }[]);
    cacheSet(cacheKey, map, 120_000);
    return map;
  }

  if (distinctError && !isRpcNotFoundError(distinctError)) {
    console.warn('[fetchCustomerIdsWithCompletedJobsMap] distinct RPC failed:', distinctError);
  }

  // Calling page RPC: still one row per customer (more columns, less egress than full job scan).
  if (!distinctError || isRpcNotFoundError(distinctError)) {
    const { data: lastPerCustomer, error: lastError } = await supabase.rpc(
      'get_last_completed_job_per_customer'
    );
    if (!lastError && lastPerCustomer) {
      const map = mapFromCustomerIdRows(lastPerCustomer as { customer_id: string }[]);
      cacheSet(cacheKey, map, 120_000);
      return map;
    }
    if (lastError && !isRpcNotFoundError(lastError) && import.meta.env.DEV) {
      console.warn('[fetchCustomerIdsWithCompletedJobsMap] last-job RPC failed:', lastError);
    }
  }

  const map: Record<string, boolean> = {};
  const pageSize = 2500;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('jobs')
      .select('customer_id')
      .eq('status', 'COMPLETED')
      .not('customer_id', 'is', null)
      .range(from, from + pageSize - 1);

    if (error) {
      console.warn('[fetchCustomerIdsWithCompletedJobsMap] paginated fallback failed:', error);
      break;
    }
    if (!data?.length) break;

    Object.assign(map, mapFromCustomerIdRows(data as { customer_id: string | null }[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  cacheSet(cacheKey, map, 120_000);
  return map;
}
