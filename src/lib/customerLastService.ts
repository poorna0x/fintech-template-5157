import { supabase } from '@/lib/supabaseClient';

export type CompletedJobServiceTimes = {
  completed_at?: string | null;
  end_time?: string | null;
};

/** Latest completion timestamp among COMPLETED job rows (completed_at, else end_time). */
export function pickLastCompletedServiceAt(
  jobs: CompletedJobServiceTimes[] | null | undefined
): string | null {
  let best: string | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const row of jobs || []) {
    const raw = String(row?.completed_at || row?.end_time || '').trim();
    if (!raw) continue;
    const ms = new Date(raw).getTime();
    if (Number.isNaN(ms) || ms < bestMs) continue;
    bestMs = ms;
    best = raw;
  }
  return best;
}

/** Asia/Kolkata calendar day for storing customers.last_service_date. */
export function lastServiceDateForDb(iso: string | null | undefined): string | null {
  const raw = String(iso || '').trim();
  if (!raw) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00+05:30` : raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export async function fetchLastCompletedServiceAt(
  customerId: string | null | undefined
): Promise<string | null> {
  const id = String(customerId || '').trim();
  if (!id) return null;
  const { data, error } = await supabase
    .from('jobs')
    .select('completed_at, end_time')
    .eq('customer_id', id)
    .eq('status', 'COMPLETED')
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(40);
  if (error) {
    console.warn('[last-service] completed-job lookup failed:', error.message);
    return null;
  }
  return pickLastCompletedServiceAt(data || []);
}

/**
 * Rewrite customers.last_service_date from remaining COMPLETED jobs (or null).
 * Soft-fail so job complete/delete still succeeds.
 */
export async function syncCustomerLastServiceDate(
  customerId: string | null | undefined
): Promise<string | null> {
  const id = String(customerId || '').trim();
  if (!id) return null;
  try {
    const at = await fetchLastCompletedServiceAt(id);
    const dateOnly = lastServiceDateForDb(at);
    const { error } = await supabase
      .from('customers')
      .update({ last_service_date: dateOnly })
      .eq('id', id);
    if (error) {
      console.warn('[last-service] customer stamp failed:', error.message);
    }
    return dateOnly;
  } catch (err) {
    console.warn('[last-service] sync failed:', err);
    return null;
  }
}

export function queueSyncCustomerLastServiceDate(customerId?: string | null) {
  if (!customerId) return;
  void syncCustomerLastServiceDate(customerId);
}

export function jobChangeAffectsLastService(
  updates: { status?: unknown; completed_at?: unknown; end_time?: unknown } | null | undefined
): boolean {
  if (!updates) return false;
  return (
    updates.status !== undefined ||
    updates.completed_at !== undefined ||
    updates.end_time !== undefined
  );
}
