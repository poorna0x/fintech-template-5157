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
  'customer:customers(full_name,visible_address)',
].join(',');

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

export function jobMatchesVisitOrderDate(
  job: Job | Record<string, unknown>,
  dateKey: string
): boolean {
  const scheduled = getJobScheduledDateKey(job);
  if (scheduled) return scheduled === dateKey;
  // Unscheduled open jobs appear under today so they can still be ordered.
  return dateKey === localDateKey();
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
  const loc = String(
    cust?.visible_address || cust?.visibleAddress || ''
  )
    .replace(/[\s\u00a0\u2000-\u200B\uFEFF]+/g, ' ')
    .trim();
  if (loc) return `${displayName} (${loc})`;
  return displayName;
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

/** Filter already-loaded admin jobs in memory (no network). */
export function filterCachedJobsForVisitOrder(
  jobs: Array<Job | Record<string, unknown>>,
  technicianId: string,
  dateKey: string
): VisitOrderJobRow[] {
  const rows = jobs.filter((j) => {
    const tid = (j as any).assigned_technician_id || (j as any).assignedTechnicianId;
    if (String(tid) !== String(technicianId)) return false;
    const st = String((j as any).status || '').toUpperCase();
    if (!VISIT_ORDER_STATUSES.has(st)) return false;
    return jobMatchesVisitOrderDate(j, dateKey);
  }) as VisitOrderJobRow[];
  return sortJobsForVisitOrder(rows);
}

/** Load open jobs for a technician on a given date (YYYY-MM-DD). Slim columns + date filter. */
export async function fetchTechnicianJobsForVisitOrder(
  technicianId: string,
  dateKey: string
): Promise<{ data: VisitOrderJobRow[]; error: Error | null }> {
  const run = async (select: string) => {
    let query = supabase
      .from('jobs')
      .select(select)
      .eq('assigned_technician_id', technicianId)
      .in('status', Array.from(VISIT_ORDER_STATUSES))
      .order('created_at', { ascending: false })
      .limit(40);

    // Push date filter to DB so we don't download other days' jobs.
    if (dateKey === localDateKey()) {
      query = query.or(`scheduled_date.eq.${dateKey},scheduled_date.is.null`);
    } else {
      query = query.eq('scheduled_date', dateKey);
    }

    return query;
  };

  let { data, error } = await run(VISIT_ORDER_JOB_SELECT);
  if (error && isMissingVisitOrderColumnError(error)) {
    markVisitOrderColumnMissing();
    ({ data, error } = await run(omitVisitOrderFromSelect(VISIT_ORDER_JOB_SELECT)));
  }

  if (error) {
    return { data: [], error: new Error(error.message) };
  }

  const rows = ((data || []) as VisitOrderJobRow[]).filter((j) =>
    jobMatchesVisitOrderDate(j, dateKey)
  );
  return { data: sortJobsForVisitOrder(rows), error: null };
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
