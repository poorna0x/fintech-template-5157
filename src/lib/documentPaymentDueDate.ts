import { db, supabase } from '@/lib/supabase';
import {
  isJobPendingPaymentOpen,
  parseJobPendingPayment,
} from '@/lib/jobPendingPayment';
import { PENDING_PAYMENT_REMINDER_TITLE } from '@/lib/pendingPaymentReminder';

function ymdFrom(value: unknown): string | null {
  const raw = String(value || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

/** Promised due date from an open job pending-payment payload, if any. */
export function dueDateFromJobRequirements(requirements: unknown): string | null {
  if (!isJobPendingPaymentOpen(requirements)) return null;
  const p = parseJobPendingPayment(requirements);
  return ymdFrom(p?.promised_date) || null;
}

/**
 * Resolve payment due date for PDF generators (PENDING / PARTIAL).
 * Prefer current job → newest completed job with open pending → open Settings reminder.
 */
export async function resolveDocumentPaymentDueDate(opts: {
  customerId?: string | null;
  /** Linked / selected job requirements (or full job row with requirements). */
  jobRequirements?: unknown;
  job?: { requirements?: unknown; Requirements?: unknown } | null;
}): Promise<string | null> {
  const fromCurrent =
    dueDateFromJobRequirements(opts.jobRequirements) ||
    dueDateFromJobRequirements(opts.job?.requirements ?? opts.job?.Requirements);
  if (fromCurrent) return fromCurrent;

  const customerId = String(opts.customerId || '').trim();
  if (!customerId) return null;

  try {
    const { data: jobs, error } = await db.jobs.getByCustomerIdSlim(customerId);
    if (!error && Array.isArray(jobs)) {
      for (const job of jobs) {
        const status = String((job as any).status || '').toUpperCase();
        if (status && status !== 'COMPLETED') continue;
        const due = dueDateFromJobRequirements((job as any).requirements);
        if (due) return due;
      }
      for (const job of jobs) {
        const due = dueDateFromJobRequirements((job as any).requirements);
        if (due) return due;
      }
    }
  } catch {
    /* soft-fail */
  }

  try {
    const { data, error } = await supabase
      .from('reminders')
      .select('reminder_at, completed_at, title')
      .eq('entity_type', 'customer')
      .eq('entity_id', customerId)
      .eq('title', PENDING_PAYMENT_REMINDER_TITLE)
      .is('completed_at', null)
      .order('reminder_at', { ascending: true })
      .limit(1);
    if (!error && data?.[0]) {
      const due = ymdFrom(data[0].reminder_at);
      if (due) return due;
    }
  } catch {
    /* soft-fail */
  }

  return null;
}
