/**
 * Shared job completion + billing rules (matches Postgres analytics_job_* functions).
 */

import { resolveReceivedCashAndOnline } from '@/lib/jobPendingPayment';

export type JobCompletionFields = {
  status?: string;
  completed_at?: string | null;
  end_time?: string | null;
  completedAt?: string | null;
  endTime?: string | null;
};

export type JobBillingFields = JobCompletionFields & {
  payment_amount?: number | string | null;
  actual_cost?: number | string | null;
  payment_method?: string | null;
  requirements?: unknown;
};

/** Prefer end_time, then completed_at — same as analytics_job_completed_at(). */
export function getJobCompletedAt(job: JobCompletionFields): Date | null {
  const raw = job.end_time || job.endTime || job.completed_at || job.completedAt;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isJobCompletedInRange(
  job: JobCompletionFields,
  startDate: Date,
  endDate: Date
): boolean {
  if (job.status !== 'COMPLETED') return false;
  const completedAt = getJobCompletedAt(job);
  if (!completedAt) return false;
  return completedAt >= startDate && completedAt <= endDate;
}

/** Supabase `.or()` filter for completed jobs by completion date in range. */
export function buildCompletedJobsDateOrFilter(startISO: string, endISO: string): string {
  return `and(end_time.gte.${startISO},end_time.lte.${endISO}),and(end_time.is.null,completed_at.gte.${startISO},completed_at.lte.${endISO})`;
}

/** Matches Postgres analytics_job_billing(payment_amount, actual_cost). */
export function resolveJobBillingAmount(
  paymentAmount: number | string | null | undefined,
  actualCost: number | string | null | undefined
): number {
  const payment = Number(paymentAmount) || 0;
  if (payment > 0) return payment;
  const actual = Number(actualCost) || 0;
  if (actual > 0) return actual;
  return 0;
}

export function jobHasBillableAmount(job: JobBillingFields): boolean {
  return resolveJobBillingAmount(job.payment_amount, job.actual_cost) > 0;
}

/** Amounts for technician / QR breakdown (PARTIAL uses cash + online split).
 *  Pending-payment jobs count only paid-today cash/online toward cash/QR, not the unpaid balance. */
export function resolveJobPaymentBreakdown(job: JobBillingFields): {
  total: number;
  cash: number;
  qr: number;
  other: number;
} {
  const billingTotal = resolveJobBillingAmount(job.payment_amount, job.actual_cost);
  const received = resolveReceivedCashAndOnline(job);
  if (received.isPendingOpen) {
    return {
      total: billingTotal,
      cash: received.cash,
      qr: received.online,
      other: 0,
    };
  }

  const paymentMethod = (job.payment_method || 'OTHER').toUpperCase();
  let cash = 0;
  let qr = 0;

  if (paymentMethod === 'PARTIAL') {
    try {
      const requirements =
        typeof job.requirements === 'string' ? JSON.parse(job.requirements) : job.requirements || [];
      const partialReq = Array.isArray(requirements)
        ? requirements.find((r: any) => r?.partial_cash_amount != null || r?.partial_online_amount != null)
        : null;
      cash = Number(partialReq?.partial_cash_amount) || 0;
      qr = Number(partialReq?.partial_online_amount) || 0;
      const partialTotal = cash + qr;
      return {
        total: partialTotal > 0 ? partialTotal : billingTotal,
        cash,
        qr,
        other: 0,
      };
    } catch {
      // fall through
    }
  }

  if (paymentMethod === 'CASH') {
    cash = billingTotal;
  } else if (paymentMethod === 'UPI' || paymentMethod === 'CARD' || paymentMethod === 'BANK_TRANSFER') {
    qr = billingTotal;
  }

  const other =
    paymentMethod !== 'PARTIAL' &&
    paymentMethod !== 'CASH' &&
    paymentMethod !== 'UPI' &&
    paymentMethod !== 'CARD' &&
    paymentMethod !== 'BANK_TRANSFER'
      ? billingTotal
      : 0;

  return { total: billingTotal, cash, qr, other };
}
