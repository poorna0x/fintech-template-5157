import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { resolveJobBillingTechnicianId } from '@/lib/jobAnalytics';
import {
  parseJobPendingPayment,
  upsertPendingPaymentInRequirements,
} from '@/lib/jobPendingPayment';

export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export type DeniedPaymentPlan = {
  linkedJob: boolean;
  jobId: string | null;
  jobNumber: string | null;
  technicianId: string | null;
  oldBill: number;
  kept: number;
  denied: number;
  oldCommission: number;
  newCommission: number;
  /** Excess commission taken off next month, not the job's month. */
  deductNextMonth: number;
  nextMonthLabel: string;
  nextMonthYmd: string;
  alreadyDenied: boolean;
};

function nextMonthStart(from = new Date()): { ymd: string; label: string } {
  const d = new Date(from.getFullYear(), from.getMonth() + 1, 1);
  return {
    ymd: format(d, 'yyyy-MM-dd'),
    label: format(d, 'MMMM yyyy'),
  };
}

function ymdFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, 'yyyy-MM-dd');
}

/**
 * Keep only money already received. The pending balance is denied.
 * Commission on the denied part is deducted from next month's salary.
 */
export function planDeniedPendingPayment(input: {
  oldBill: number;
  amountPending: number;
  paidToday?: number | null;
  bookedCommission?: number | null;
  commissionPercentage?: number | null;
  linkedJob?: boolean;
  jobId?: string | null;
  jobNumber?: string | null;
  technicianId?: string | null;
  alreadyDenied?: boolean;
  from?: Date;
}): DeniedPaymentPlan {
  const next = nextMonthStart(input.from);
  const oldBill = roundMoney(Math.max(0, input.oldBill));
  const pending = roundMoney(Math.max(0, input.amountPending));
  const paid =
    input.paidToday == null || !Number.isFinite(Number(input.paidToday))
      ? null
      : roundMoney(Math.max(0, Number(input.paidToday)));

  let kept = 0;
  let denied = pending;
  if (input.linkedJob && oldBill > 0) {
    if (paid != null && paid > 0 && paid <= oldBill) {
      kept = paid;
    } else {
      denied = Math.min(pending, oldBill);
      kept = roundMoney(oldBill - denied);
    }
    denied = roundMoney(oldBill - kept);
  }

  const pct = Number(input.commissionPercentage);
  const rate = Number.isFinite(pct) && pct > 0 ? pct / 100 : 0.1;
  const booked =
    input.bookedCommission == null || !Number.isFinite(Number(input.bookedCommission))
      ? null
      : roundMoney(Number(input.bookedCommission));
  const oldCommission = booked != null ? booked : roundMoney(oldBill * rate);
  const share = oldBill > 0 ? denied / oldBill : input.linkedJob ? 1 : 0;
  const deductNextMonth =
    input.linkedJob && input.technicianId && oldCommission > 0
      ? roundMoney(oldCommission * share)
      : 0;
  const newCommission = roundMoney(Math.max(0, oldCommission - deductNextMonth));

  return {
    linkedJob: Boolean(input.linkedJob),
    jobId: input.jobId || null,
    jobNumber: input.jobNumber || null,
    technicianId: input.technicianId || null,
    oldBill,
    kept,
    denied,
    oldCommission,
    newCommission,
    deductNextMonth,
    nextMonthLabel: next.label,
    nextMonthYmd: next.ymd,
    alreadyDenied: Boolean(input.alreadyDenied),
  };
}

export async function loadDeniedPendingPaymentPlan(input: {
  jobId?: string | null;
  amountPending: number;
}): Promise<DeniedPaymentPlan> {
  const jobId = String(input.jobId || '').trim();
  if (!jobId) {
    return planDeniedPendingPayment({
      oldBill: 0,
      amountPending: input.amountPending,
      linkedJob: false,
    });
  }

  const { data: job, error } = await supabase
    .from('jobs')
    .select(
      'id, job_number, actual_cost, payment_amount, requirements, assigned_technician_id, completed_by, end_time, completed_at'
    )
    .eq('id', jobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!job) {
    return planDeniedPendingPayment({
      oldBill: 0,
      amountPending: input.amountPending,
      linkedJob: false,
    });
  }

  const pending = parseJobPendingPayment(job.requirements);
  const oldBill = roundMoney(Number(job.actual_cost ?? job.payment_amount) || 0);
  const { data: payments, error: payErr } = await supabase
    .from('technician_payments')
    .select('technician_id, commission_percentage, commission_amount')
    .eq('job_id', jobId);
  if (payErr) throw new Error(payErr.message);
  const rows = payments || [];
  const booked = rows.reduce((sum, row) => sum + (Number(row.commission_amount) || 0), 0);
  const pct = rows.length === 1 ? Number(rows[0].commission_percentage) : null;
  const technicianId =
    (rows[0]?.technician_id as string | undefined) ||
    resolveJobBillingTechnicianId(job);

  return planDeniedPendingPayment({
    oldBill,
    amountPending: input.amountPending,
    paidToday: pending?.paid_today,
    bookedCommission: rows.length ? booked : null,
    commissionPercentage: pct,
    linkedJob: true,
    jobId: job.id,
    jobNumber: job.job_number || null,
    technicianId,
    alreadyDenied: Boolean(pending?.denied_at),
  });
}

export async function applyDeniedPendingPayment(input: {
  reminderId: string;
  reminderNotes: string | null | undefined;
  jobId?: string | null;
  amountPending: number;
}): Promise<DeniedPaymentPlan> {
  const plan = await loadDeniedPendingPaymentPlan({
    jobId: input.jobId,
    amountPending: input.amountPending,
  });
  const deniedAt = new Date().toISOString();

  if (plan.alreadyDenied) {
    const { error: remErr } = await supabase
      .from('reminders')
      .update({ completed_at: deniedAt })
      .eq('id', input.reminderId);
    if (remErr) throw new Error(remErr.message);
    return plan;
  }

  if (plan.linkedJob && plan.jobId) {
    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select('id, requirements, end_time, completed_at, assigned_technician_id, completed_by')
      .eq('id', plan.jobId)
      .maybeSingle();
    if (jobErr) throw new Error(jobErr.message);
    if (!job) throw new Error('Linked job was not found.');

    const existing = parseJobPendingPayment(job.requirements);
    const requirements = existing
      ? upsertPendingPaymentInRequirements(job.requirements, {
          ...existing,
          amount_pending: 0,
          paid_today: plan.kept,
          settled_at: deniedAt,
          denied_at: deniedAt,
          denied_amount: plan.denied,
          kept_amount: plan.kept,
        })
      : upsertPendingPaymentInRequirements(job.requirements, {
          promised_date: format(new Date(), 'yyyy-MM-dd'),
          amount_pending: 0,
          paid_today: plan.kept,
          paid_today_mode: null,
          settled_at: deniedAt,
          denied_at: deniedAt,
          denied_amount: plan.denied,
          kept_amount: plan.kept,
        });

    const { error: updateJobErr } = await supabase
      .from('jobs')
      .update({
        actual_cost: plan.kept,
        payment_amount: plan.kept,
        payment_status: 'PAID',
        requirements,
      })
      .eq('id', plan.jobId);
    if (updateJobErr) throw new Error(updateJobErr.message);

    if (plan.deductNextMonth > 0 && plan.technicianId) {
      const { data: payRows, error: payErr } = await supabase
        .from('technician_payments')
        .select('id, commission_amount')
        .eq('job_id', plan.jobId);
      if (payErr) throw new Error(payErr.message);
      const rows = payRows || [];
      const oldSum = rows.reduce((sum, row) => sum + (Number(row.commission_amount) || 0), 0);
      let allocated = 0;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const isLast = i === rows.length - 1;
        const share = Number(row.commission_amount) || 0;
        const next =
          oldSum > 0
            ? isLast
              ? roundMoney(plan.newCommission - allocated)
              : roundMoney(plan.newCommission * (share / oldSum))
            : 0;
        allocated = roundMoney(allocated + next);
        const { error: commErr } = await supabase
          .from('technician_payments')
          .update({
            bill_amount: plan.kept,
            commission_amount: Math.max(0, next),
          })
          .eq('id', row.id);
        if (commErr) throw new Error(commErr.message);
      }

      const holdDate =
        ymdFromIso(job.end_time || job.completed_at) || format(new Date(), 'yyyy-MM-dd');
      const note = `denied-pending:${input.reminderId}`;
      const { error: extraErr } = await supabase.from('technician_extra_commissions').insert([
        {
          technician_id: plan.technicianId,
          amount: plan.deductNextMonth,
          description: `Customer denied payment — commission kept until ${plan.nextMonthLabel} (job ${plan.jobNumber || plan.jobId})`,
          commission_date: holdDate,
          notes: `${note}:hold`,
        },
        {
          technician_id: plan.technicianId,
          amount: -plan.deductNextMonth,
          description: `Customer denied payment — deduct unpaid commission (job ${plan.jobNumber || plan.jobId})`,
          commission_date: plan.nextMonthYmd,
          notes: `${note}:next`,
        },
      ]);
      if (extraErr) throw new Error(extraErr.message);
    }
  }

  let notes = input.reminderNotes || '';
  try {
    const parsed = notes.trim().startsWith('{') ? JSON.parse(notes) : { note: notes || undefined };
    notes = JSON.stringify({
      ...parsed,
      amount_pending: 0,
      denied: true,
      denied_amount: plan.denied,
      kept_amount: plan.kept,
    });
  } catch {
    notes = JSON.stringify({
      amount_pending: 0,
      denied: true,
      denied_amount: plan.denied,
      kept_amount: plan.kept,
      note: notes || undefined,
    });
  }

  const { error: remErr } = await supabase
    .from('reminders')
    .update({ completed_at: deniedAt, notes })
    .eq('id', input.reminderId);
  if (remErr) throw new Error(remErr.message);

  return plan;
}
