import { db, supabase } from '@/lib/supabase';
import { getLocalTomorrowYmd } from '@/lib/pendingPaymentReminder';

/** UI payment mode including pending (not always a DB payment_method enum value). */
export type JobPaymentModeUi = 'CASH' | 'ONLINE' | 'PARTIAL' | 'PENDING_PAYMENT' | '';

export type PaidTodayMode = 'CASH' | 'ONLINE' | 'PARTIAL';

export type JobPendingPaymentPayload = {
  promised_date: string;
  amount_pending: number;
  paid_today: number;
  paid_today_mode: PaidTodayMode | null;
  reminder_id?: string | null;
  settled_at?: string | null;
};

export type PendingPaymentReminderNotes = {
  amount_pending: number;
  note?: string;
  job_id?: string;
  job_number?: string;
};

export function parseRequirementsArray(requirements: unknown): any[] {
  if (!requirements) return [];
  if (typeof requirements === 'string') {
    try {
      const parsed = JSON.parse(requirements);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return [parsed];
      return [];
    } catch {
      return [];
    }
  }
  if (Array.isArray(requirements)) return requirements;
  if (typeof requirements === 'object') return [requirements];
  return [];
}

export function parseJobPendingPayment(requirements: unknown): JobPendingPaymentPayload | null {
  const arr = parseRequirementsArray(requirements);
  const row = arr.find((r) => r?.pending_payment && typeof r.pending_payment === 'object');
  if (!row) return null;
  const p = row.pending_payment as Record<string, unknown>;
  const promised_date =
    typeof p.promised_date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(p.promised_date)
      ? p.promised_date.slice(0, 10)
      : '';
  const amount_pending = Number(p.amount_pending) || 0;
  const paid_today = Number(p.paid_today) || 0;
  const mode = p.paid_today_mode;
  const paid_today_mode =
    mode === 'CASH' || mode === 'ONLINE' || mode === 'PARTIAL' ? mode : null;
  return {
    promised_date,
    amount_pending,
    paid_today,
    paid_today_mode,
    reminder_id: typeof p.reminder_id === 'string' ? p.reminder_id : null,
    settled_at: typeof p.settled_at === 'string' ? p.settled_at : null,
  };
}

export function isJobPendingPaymentOpen(requirements: unknown): boolean {
  const p = parseJobPendingPayment(requirements);
  return Boolean(p && !p.settled_at && p.amount_pending > 0);
}

export function buildJobPendingPaymentRequirement(
  payload: JobPendingPaymentPayload
): { pending_payment: JobPendingPaymentPayload } {
  return {
    pending_payment: {
      promised_date: payload.promised_date,
      amount_pending: Math.max(0, Number(payload.amount_pending) || 0),
      paid_today: Math.max(0, Number(payload.paid_today) || 0),
      paid_today_mode: payload.paid_today_mode,
      reminder_id: payload.reminder_id ?? null,
      settled_at: payload.settled_at ?? null,
    },
  };
}

/** Strip previous pending_payment entries, then optionally push a new one. */
export function upsertPendingPaymentInRequirements(
  requirements: unknown,
  payload: JobPendingPaymentPayload | null
): any[] {
  const arr = parseRequirementsArray(requirements).filter((r) => !r?.pending_payment);
  if (payload) arr.push(buildJobPendingPaymentRequirement(payload));
  return arr;
}

export function markPendingPaymentSettledInRequirements(
  requirements: unknown,
  settledAt: string = new Date().toISOString()
): any[] {
  const existing = parseJobPendingPayment(requirements);
  if (!existing) return parseRequirementsArray(requirements);
  return upsertPendingPaymentInRequirements(requirements, {
    ...existing,
    amount_pending: 0,
    settled_at: settledAt,
  });
}

export function resolveDbPaymentMethodFromUi(
  mode: JobPaymentModeUi,
  paidTodayMode: PaidTodayMode | null | undefined,
  paidTodayAmount: number
): 'CASH' | 'UPI' | 'PARTIAL' | null {
  if (mode === 'CASH') return 'CASH';
  if (mode === 'ONLINE') return 'UPI';
  if (mode === 'PARTIAL') return 'PARTIAL';
  if (mode === 'PENDING_PAYMENT') {
    if (!(paidTodayAmount > 0) || !paidTodayMode) return null;
    if (paidTodayMode === 'CASH') return 'CASH';
    if (paidTodayMode === 'ONLINE') return 'UPI';
    return 'PARTIAL';
  }
  return null;
}

export function resolveJobCustomerPaymentStatus(input: {
  billAmount: number;
  mode: JobPaymentModeUi;
  paidTodayAmount?: number;
}): 'PENDING' | 'PARTIAL' | 'PAID' {
  const bill = Math.max(0, Number(input.billAmount) || 0);
  if (bill <= 0) return 'PENDING';
  if (input.mode === 'PENDING_PAYMENT') {
    const paid = Math.max(0, Number(input.paidTodayAmount) || 0);
    if (paid <= 0) return 'PENDING';
    if (paid < bill) return 'PARTIAL';
    return 'PAID';
  }
  if (input.mode === 'CASH' || input.mode === 'ONLINE' || input.mode === 'PARTIAL') {
    return 'PAID';
  }
  return 'PENDING';
}

export function computePendingBalance(billAmount: number, paidToday: number): number {
  return Math.max(0, Math.round((billAmount - paidToday) * 100) / 100);
}

export function validatePendingPaymentInputs(input: {
  billAmount: number;
  paidTodayEnabled: boolean;
  paidTodayMode: PaidTodayMode | '';
  paidTodayAmount: number;
  partialCash: number;
  partialOnline: number;
  promisedDate: string;
}): string | null {
  const bill = input.billAmount;
  if (!(bill > 0)) return 'Bill amount must be greater than zero for pending payment.';
  if (!input.promisedDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.promisedDate)) {
    return 'Select when payment will be made.';
  }
  if (input.promisedDate < new Date().toISOString().slice(0, 10)) {
    // allow today; only block clearly past dates if needed — allow today and future
  }
  let paid = 0;
  if (input.paidTodayEnabled) {
    if (!input.paidTodayMode) return 'Select how today’s payment was received.';
    if (input.paidTodayMode === 'PARTIAL') {
      if (!(input.partialCash > 0) || !(input.partialOnline > 0)) {
        return 'Enter both cash and online amounts for paid today.';
      }
      paid = Math.round((input.partialCash + input.partialOnline) * 100) / 100;
    } else {
      paid = input.paidTodayAmount;
      if (!(paid > 0)) return 'Enter the amount paid today.';
    }
    if (paid >= bill) {
      return 'Paid today covers the full bill — use Cash, Online, or Partial instead of Pending Payment.';
    }
  }
  const balance = computePendingBalance(bill, paid);
  if (!(balance > 0)) return 'Pending balance must be greater than zero.';
  return null;
}

export function defaultPromisedPaymentDate(): string {
  return getLocalTomorrowYmd();
}

export function buildPendingPaymentReminderNotes(input: {
  amountPending: number;
  jobId: string;
  jobNumber?: string | null;
  note?: string | null;
}): string {
  const payload: PendingPaymentReminderNotes = {
    amount_pending: Math.max(0, Number(input.amountPending) || 0),
    job_id: input.jobId,
  };
  if (input.jobNumber) payload.job_number = String(input.jobNumber);
  if (input.note && input.note.trim()) payload.note = input.note.trim();
  return JSON.stringify(payload);
}

export function parsePendingPaymentReminderNotesExtended(
  notes: string | null | undefined
): PendingPaymentReminderNotes {
  const raw = (notes ?? '').toString().trim();
  if (!raw) return { amount_pending: 0 };
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const amount_pending =
        typeof parsed.amount_pending === 'number'
          ? parsed.amount_pending
          : Number(String(raw).replace(/[^0-9.-]/g, '')) || 0;
      return {
        amount_pending,
        note: typeof parsed.note === 'string' && parsed.note.trim() ? parsed.note.trim() : undefined,
        job_id: typeof parsed.job_id === 'string' ? parsed.job_id : undefined,
        job_number: typeof parsed.job_number === 'string' ? parsed.job_number : undefined,
      };
    } catch {
      /* fallthrough */
    }
  }
  const n = Number(raw.replace(/[^0-9.-]/g, ''));
  return { amount_pending: Number.isFinite(n) ? n : 0 };
}

/**
 * Create Settings pending-payment reminder linked to a job.
 * Uses SECURITY DEFINER RPC — `reminders` RLS is admin-only, so technicians
 * cannot insert directly (that was causing the "reminder failed" toast).
 */
export async function createPendingPaymentReminderFromJob(input: {
  customerId: string;
  jobId: string;
  jobNumber?: string | null;
  amountPending: number;
  promisedDate: string;
  note?: string | null;
}): Promise<{ id: string | null; error: Error | null }> {
  const note =
    input.note?.trim() ||
    `Balance from job ${input.jobNumber || input.jobId.slice(0, 8)}`;
  const { data, error } = await supabase.rpc('create_pending_payment_reminder_from_job', {
    p_job_id: input.jobId,
    p_customer_id: input.customerId,
    p_amount_pending: input.amountPending,
    p_promised_date: input.promisedDate,
    p_job_number: input.jobNumber ?? null,
    p_note: note,
  });
  if (error) return { id: null, error: error as Error };
  const id = typeof data === 'string' ? data : (data as string | null) ?? null;
  return { id, error: null };
}

export async function updatePendingPaymentReminderFromJob(input: {
  reminderId: string;
  amountPending: number;
  promisedDate: string;
  jobId: string;
  jobNumber?: string | null;
  note?: string | null;
}): Promise<{ error: Error | null }> {
  const { error } = await db.reminders.update(input.reminderId, {
    reminder_at: input.promisedDate,
    notes: buildPendingPaymentReminderNotes({
      amountPending: input.amountPending,
      jobId: input.jobId,
      jobNumber: input.jobNumber,
      note: input.note,
    }),
    completed_at: null,
  } as any);
  return { error: error ? (error as Error) : null };
}

export async function completePendingPaymentReminder(
  reminderId: string
): Promise<{ error: Error | null }> {
  const { error } = await db.reminders.update(reminderId, {
    completed_at: new Date().toISOString(),
  });
  return { error: error ? (error as Error) : null };
}

/**
 * Cash/online amounts actually received (for cash handover / QR stats).
 * Pending balance is excluded; full bill still comes from resolveJobBillingAmount.
 */
export function resolveReceivedCashAndOnline(job: {
  payment_method?: string | null;
  payment_amount?: number | string | null;
  actual_cost?: number | string | null;
  requirements?: unknown;
}): { cash: number; online: number; pendingBalance: number; isPendingOpen: boolean } {
  const pending = parseJobPendingPayment(job.requirements);
  const open = Boolean(pending && !pending.settled_at);

  if (open && pending) {
    const mode = pending.paid_today_mode;
    const paid = pending.paid_today;
    if (mode === 'PARTIAL') {
      const arr = parseRequirementsArray(job.requirements);
      const partialReq = arr.find(
        (r: any) => r?.partial_cash_amount != null || r?.partial_online_amount != null
      );
      return {
        cash: Number(partialReq?.partial_cash_amount) || 0,
        online: Number(partialReq?.partial_online_amount) || 0,
        pendingBalance: pending.amount_pending,
        isPendingOpen: true,
      };
    }
    if (mode === 'CASH') {
      return { cash: paid, online: 0, pendingBalance: pending.amount_pending, isPendingOpen: true };
    }
    if (mode === 'ONLINE') {
      return { cash: 0, online: paid, pendingBalance: pending.amount_pending, isPendingOpen: true };
    }
    return { cash: 0, online: 0, pendingBalance: pending.amount_pending, isPendingOpen: true };
  }

  const method = (job.payment_method || '').toUpperCase();
  const billing =
    (Number(job.payment_amount) || 0) > 0
      ? Number(job.payment_amount) || 0
      : Number(job.actual_cost) || 0;

  if (method === 'PARTIAL') {
    const arr = parseRequirementsArray(job.requirements);
    const partialReq = arr.find((r: any) => r?.partial_cash_amount != null || r?.partial_online_amount != null);
    return {
      cash: Number(partialReq?.partial_cash_amount) || 0,
      online: Number(partialReq?.partial_online_amount) || 0,
      pendingBalance: 0,
      isPendingOpen: false,
    };
  }
  if (method === 'CASH') {
    return { cash: billing, online: 0, pendingBalance: 0, isPendingOpen: false };
  }
  if (method === 'UPI' || method === 'CARD' || method === 'BANK_TRANSFER') {
    return { cash: 0, online: billing, pendingBalance: 0, isPendingOpen: false };
  }
  return { cash: 0, online: 0, pendingBalance: 0, isPendingOpen: false };
}
