import { supabase } from '@/lib/supabase';
import { broadcastTechnicianJobListRefresh } from '@/lib/technicianJobListSync';
import {
  getJobScheduledDateKey,
  routeSortKeyForJob,
} from '@/lib/adminRouteMeasureHelpers';
import {
  isMissingVisitOrderColumnError,
  markVisitOrderColumnMissing,
  omitVisitOrderFromSelect,
} from '@/lib/visit-order-columns';
import { getJobLocationLabelForWhatsApp } from '@/lib/customer-locations';
import type { Job } from '@/types';

export const VISIT_ORDER_STATUSES = new Set([
  'PENDING',
  'ASSIGNED',
  'EN_ROUTE',
  'IN_PROGRESS',
]);

/** Slim select for arrange dialog only — no service_location / photos / heavy embeds. */
const VISIT_ORDER_JOB_SELECT = [
  'id',
  'job_number',
  'status',
  'scheduled_date',
  'scheduled_time_slot',
  'visit_order',
  'requirements',
  'created_at',
  'assigned_technician_id',
  'service_site',
  'service_address',
  'customer:customers(full_name,visible_address,alternate_visible_address,alternate_address)',
].join(',');

const VISIT_ORDER_SIBLING_SELECT =
  'id,visit_order,scheduled_date,scheduled_time_slot,requirements,created_at,assigned_technician_id,status';

export function getJobVisitOrder(job: Job | Record<string, unknown> | null | undefined): number | null {
  if (!job) return null;
  const raw = (job as any).visit_order ?? (job as any).visitOrder;
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function localDateKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function compareJobsByVisitOrder(
  a: Job | Record<string, unknown>,
  b: Job | Record<string, unknown>
): number {
  const oa = getJobVisitOrder(a);
  const ob = getJobVisitOrder(b);
  const aHas = oa != null;
  const bHas = ob != null;
  if (aHas && bHas && oa !== ob) return oa! - ob!;
  if (aHas && !bHas) return -1;
  if (!aHas && bHas) return 1;

  const da = getJobScheduledDateKey(a) || '9999-12-31';
  const db = getJobScheduledDateKey(b) || '9999-12-31';
  if (da !== db) return da.localeCompare(db);
  return routeSortKeyForJob(a).localeCompare(routeSortKeyForJob(b));
}

export function sortJobsForVisitOrder<T extends Job | Record<string, unknown>>(jobs: T[]): T[] {
  return [...jobs].sort(compareJobsByVisitOrder);
}

export function visitOrderStopLabel(job: Job | Record<string, unknown>): string {
  const cust = (job as any)?.customer as any;
  const displayName = (cust?.full_name || cust?.fullName || 'Customer').trim() || 'Customer';
  const loc = getJobLocationLabelForWhatsApp(
    job as { service_site?: string; service_address?: any },
    cust
  )
    .replace(/[\s\u00a0\u2000-\u200B\uFEFF]+/g, ' ')
    .trim();
  const dateKey = getJobScheduledDateKey(job);
  const base = loc ? `${displayName} (${loc})` : displayName;
  return dateKey ? `${base} · ${dateKey}` : base;
}

export type VisitOrderJobRow = {
  id: string;
  job_number?: string;
  status?: string;
  scheduled_date?: string | null;
  scheduled_time_slot?: string | null;
  visit_order?: number | null;
  customer?: { full_name?: string; fullName?: string; visible_address?: string } | null;
  requirements?: unknown;
  created_at?: string;
  assigned_technician_id?: string | null;
};

/** Filter already-loaded admin jobs in memory (all open jobs for this tech). */
export function filterCachedJobsForVisitOrder(
  jobs: Array<Job | Record<string, unknown>>,
  technicianId: string
): VisitOrderJobRow[] {
  const rows = jobs.filter((j) => {
    const tid = (j as any).assigned_technician_id || (j as any).assignedTechnicianId;
    if (String(tid) !== String(technicianId)) return false;
    const st = String((j as any).status || '').toUpperCase();
    return VISIT_ORDER_STATUSES.has(st);
  }) as VisitOrderJobRow[];
  return sortJobsForVisitOrder(rows);
}

/** Load all open jobs for a technician (any scheduled day). Slim columns. */
export async function fetchTechnicianJobsForVisitOrder(
  technicianId: string
): Promise<{ data: VisitOrderJobRow[]; error: Error | null }> {
  const run = async (select: string) =>
    supabase
      .from('jobs')
      .select(select)
      .eq('assigned_technician_id', technicianId)
      .in('status', Array.from(VISIT_ORDER_STATUSES))
      .order('created_at', { ascending: false })
      .limit(40);

  let { data, error } = await run(VISIT_ORDER_JOB_SELECT);
  if (error && isMissingVisitOrderColumnError(error)) {
    markVisitOrderColumnMissing();
    ({ data, error } = await run(omitVisitOrderFromSelect(VISIT_ORDER_JOB_SELECT)));
  }

  if (error) {
    return { data: [], error: new Error(error.message) };
  }

  return { data: sortJobsForVisitOrder((data || []) as VisitOrderJobRow[]), error: null };
}

/** Persist 1-based visit_order for the given job ids (in order). No .select() on updates. */
export async function saveTechnicianVisitOrder(
  technicianId: string,
  orderedJobIds: string[]
): Promise<{ error: Error | null }> {
  const results = await Promise.all(
    orderedJobIds.map(async (jobId, index) => {
      const { error } = await supabase
        .from('jobs')
        .update({ visit_order: index + 1 } as any)
        .eq('id', jobId)
        .eq('assigned_technician_id', technicianId);
      return error;
    })
  );

  const firstError = results.find(Boolean);
  if (firstError) {
    if (isMissingVisitOrderColumnError(firstError)) {
      markVisitOrderColumnMissing();
      return {
        error: new Error(
          'Visit order column is missing. Run scripts/add-job-visit-order-column.sql in Supabase, then try again.'
        ),
      };
    }
    return { error: new Error(firstError.message) };
  }

  broadcastTechnicianJobListRefresh([technicianId]);
  return { error: null };
}

/**
 * Plan append position across all open jobs for this technician.
 * Backfills unordered siblings (by schedule) so numbering stays contiguous.
 */
export async function planVisitOrderAppend(
  technicianId: string,
  excludeJobId?: string | null
): Promise<{ nextOrder: number; backfillUpdates: Array<{ id: string; visit_order: number }> }> {
  const run = async (select: string) =>
    supabase
      .from('jobs')
      .select(select)
      .eq('assigned_technician_id', technicianId)
      .in('status', Array.from(VISIT_ORDER_STATUSES))
      .order('created_at', { ascending: false })
      .limit(40);

  let { data, error } = await run(VISIT_ORDER_SIBLING_SELECT);
  if (error && isMissingVisitOrderColumnError(error)) {
    markVisitOrderColumnMissing();
    return { nextOrder: 1, backfillUpdates: [] };
  }
  if (error) {
    console.warn('[visit_order] sibling load failed:', error.message);
    return { nextOrder: 1, backfillUpdates: [] };
  }

  const siblings = ((data || []) as VisitOrderJobRow[]).filter(
    (j) => !(excludeJobId && j.id === excludeJobId)
  );

  const withOrder = siblings
    .filter((j) => getJobVisitOrder(j) != null)
    .sort((a, b) => getJobVisitOrder(a)! - getJobVisitOrder(b)!);
  const withoutOrder = siblings
    .filter((j) => getJobVisitOrder(j) == null)
    .sort((a, b) => compareJobsByVisitOrder(a, b));

  let maxOrdered = 0;
  for (const j of withOrder) {
    maxOrdered = Math.max(maxOrdered, getJobVisitOrder(j)!);
  }

  const backfillUpdates = withoutOrder.map((j, i) => ({
    id: j.id,
    visit_order: maxOrdered + 1 + i,
  }));
  const nextOrder = maxOrdered + withoutOrder.length + 1;
  return { nextOrder, backfillUpdates };
}

/**
 * After assign/reassign/create: put this job at the next stop for the tech.
 * Returns the visit_order written, or null if skipped/failed.
 */
export async function appendJobToTechnicianVisitOrder(opts: {
  jobId: string;
  technicianId: string;
  /** @deprecated Visit order is per technician (all open jobs), not per day. */
  scheduledDate?: string | null;
}): Promise<number | null> {
  const { jobId, technicianId } = opts;
  if (!jobId || !technicianId) return null;

  try {
    const { nextOrder, backfillUpdates } = await planVisitOrderAppend(technicianId, jobId);

    const writes = [
      ...backfillUpdates.map((u) =>
        supabase
          .from('jobs')
          .update({ visit_order: u.visit_order } as any)
          .eq('id', u.id)
          .eq('assigned_technician_id', technicianId)
      ),
      supabase
        .from('jobs')
        .update({ visit_order: nextOrder } as any)
        .eq('id', jobId),
    ];

    const results = await Promise.all(writes);
    const firstErr = results.find((r) => r.error)?.error;
    if (firstErr) {
      if (isMissingVisitOrderColumnError(firstErr)) {
        markVisitOrderColumnMissing();
        return null;
      }
      console.warn('[visit_order] append failed:', firstErr.message);
      return null;
    }
    return nextOrder;
  } catch (e) {
    console.warn('[visit_order] append error:', e);
    return null;
  }
}

/** Clear visit_order when a job is unassigned (no .select()). */
export async function clearJobVisitOrder(jobId: string): Promise<void> {
  if (!jobId) return;
  const { error } = await supabase
    .from('jobs')
    .update({ visit_order: null } as any)
    .eq('id', jobId);
  if (error && isMissingVisitOrderColumnError(error)) {
    markVisitOrderColumnMissing();
  }
}

/** Asia/Kolkata calendar date as YYYY-MM-DD (en-CA). */
function visitOrderVisibleTodayIst(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function normalizeVisitOrderVisibleOn(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  // Postgres date / ISO timestamp → YYYY-MM-DD
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/** Per-technician: is visit-order UI enabled for this tech today (IST)? Default false. */
export async function getVisitOrderVisibleForTechnician(
  technicianId: string
): Promise<boolean> {
  if (!technicianId) return false;
  try {
    const { data, error } = await supabase
      .from('technicians')
      .select('visit_order_visible, visit_order_visible_on')
      .eq('id', technicianId)
      .maybeSingle();
    if (error) {
      // Column not migrated yet — treat as off.
      if (/visit_order_visible/i.test(error.message)) return false;
      console.warn('[visit_order] visibility read failed:', error.message);
      return false;
    }
    const row = data as {
      visit_order_visible?: boolean;
      visit_order_visible_on?: string | null;
    } | null;
    if (row?.visit_order_visible !== true) return false;

    const onDate = normalizeVisitOrderVisibleOn(row.visit_order_visible_on);
    const today = visitOrderVisibleTodayIst();
    if (onDate === today) return true;

    // Stale / missing day stamp — treat as off and clear so it stays off overnight.
    void supabase
      .from('technicians')
      .update({
        visit_order_visible: false,
        visit_order_visible_on: null,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', technicianId)
      .then(({ error: clearErr }) => {
        if (clearErr && !/visit_order_visible/i.test(clearErr.message)) {
          console.warn('[visit_order] stale visibility clear failed:', clearErr.message);
        }
      });
    return false;
  } catch {
    return false;
  }
}

/** Admin only: turn visit-order numbers on/off for one technician (ON lasts until end of IST day). */
export async function setVisitOrderVisibleForTechnician(
  technicianId: string,
  visible: boolean
): Promise<{ error: Error | null }> {
  if (!technicianId) return { error: new Error('No technician selected') };
  const payload = visible
    ? {
        visit_order_visible: true,
        visit_order_visible_on: visitOrderVisibleTodayIst(),
        updated_at: new Date().toISOString(),
      }
    : {
        visit_order_visible: false,
        visit_order_visible_on: null,
        updated_at: new Date().toISOString(),
      };
  const { error } = await supabase
    .from('technicians')
    .update(payload as any)
    .eq('id', technicianId);
  if (error) {
    if (/visit_order_visible/i.test(error.message)) {
      return {
        error: new Error(
          'Visit order visibility column is missing. Run scripts/add-technician-visit-order-visible.sql and scripts/add-technician-visit-order-visible-on.sql in Supabase, then try again.'
        ),
      };
    }
    return { error: new Error(error.message) };
  }
  return { error: null };
}

