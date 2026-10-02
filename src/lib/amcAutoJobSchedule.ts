/** Shared AMC auto job scheduling (admin dashboard + AMC view). */

const AMC_THROTTLE_MS = 6 * 60 * 60 * 1000;
const AMC_THROTTLE_KEY = 'amc_service_jobs_last_run';
const AMC_DEFAULT_PERIOD_KEY = 'amc_default_service_period_months';

let amcCreationInFlight: Promise<{ created: number; error: unknown }> | null = null;

export function getDefaultAmcServicePeriodMonths(): number {
  if (typeof window === 'undefined') return 4;
  const stored = localStorage.getItem(AMC_DEFAULT_PERIOD_KEY);
  if (stored === null || stored === '') return 4;
  const n = parseInt(stored, 10);
  return Number.isNaN(n) ? 4 : n;
}

export type AmcServicePeriodKind = '4' | '6' | 'custom' | 'no_auto';

export function deriveAmcServicePeriodKind(
  months: number | null | undefined,
): { kind: AmcServicePeriodKind; custom: number } {
  if (months == null) {
    const def = getDefaultAmcServicePeriodMonths();
    if (def === 0) return { kind: 'no_auto', custom: 4 };
    if (def === 4) return { kind: '4', custom: 4 };
    if (def === 6) return { kind: '6', custom: 6 };
    return { kind: 'custom', custom: Math.max(1, def) };
  }
  if (months === 0) return { kind: 'no_auto', custom: 4 };
  if (months === 4) return { kind: '4', custom: 4 };
  if (months === 6) return { kind: '6', custom: 6 };
  return { kind: 'custom', custom: Math.max(1, months) };
}

export function resolveAmcServicePeriodMonths(
  kind: AmcServicePeriodKind,
  customMonths: number,
): number {
  if (kind === 'no_auto') return 0;
  if (kind === '4') return 4;
  if (kind === '6') return 6;
  return Math.max(1, customMonths);
}

export function addMonthsToDate(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

export function subtractDaysFromDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

export function toDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.split('T')[0].split(' ')[0];
  return new Date(value).toISOString().split('T')[0];
}

/**
 * AMC auto-create rule.
 * Visits stay on the contract calendar: start + period, + 2 periods, and so on.
 * A late or early visit does not slide the later dates.
 * Reference is the customer's last completed job (any service type).
 * The next due date is the first calendar slot after that visit.
 * If no slot is left before the AMC end, the last visit is in the final 10 days.
 * Staff can pin one visit with `next_service_on` (push to the 1-year date, or any date).
 * That pin is used once, then the calendar resumes.
 * A job is created when today is within 10 days before the due date,
 * and the customer has no open AMC Service job yet.
 */
export const AMC_REMINDER_DAYS_BEFORE = 10;

/** A completed visit on or after (pushed date − this many days) counts as that pushed visit. */
export const AMC_PUSH_CONSUMED_GRACE_DAYS = 21;

export function computeAmcAutoCreateDue(
  referenceDateStr: string,
  periodMonths: number,
  todayStr: string
): { nextDue: string; reminderStart: string; shouldCreate: boolean } {
  const nextDue = addMonthsToDate(referenceDateStr, periodMonths);
  const reminderStart = subtractDaysFromDate(nextDue, AMC_REMINDER_DAYS_BEFORE);
  const shouldCreate = todayStr >= reminderStart;
  return { nextDue, reminderStart, shouldCreate };
}

/** When the next period-based service falls after AMC end, create one job in the last 10 days of the contract. */
export function computeAmcPreExpiryAutoCreate(
  endDateStr: string,
  todayStr: string
): { preExpiryWindowStart: string; shouldCreate: boolean } {
  const preExpiryWindowStart = subtractDaysFromDate(endDateStr, AMC_REMINDER_DAYS_BEFORE);
  const shouldCreate = todayStr >= preExpiryWindowStart && todayStr <= endDateStr;
  return { preExpiryWindowStart, shouldCreate };
}

export type AmcVisitKind = 'pushed' | 'slot' | 'pre_expiry';

export type AmcNextVisitPlan = {
  nextDue: string | null;
  reminderStart: string | null;
  shouldCreate: boolean;
  /** Set only when a job should be inserted now. */
  createReason: 'pushed' | 'regular' | 'pre_expiry' | null;
  visitKind: AmcVisitKind | null;
  preExpiryWindowStart: string | null;
  /** Last completed visit already covers the pinned date — clear `next_service_on`. */
  pushedConsumed: boolean;
};

/** Due dates from the AMC start, every `periodMonths`, stopping at the contract end. */
export function listAmcContractSlots(
  startDateStr: string,
  periodMonths: number,
  endDateStr: string | null,
): string[] {
  if (!startDateStr || periodMonths <= 0) return [];
  const slots: string[] = [];
  for (let k = 1; k <= 36; k++) {
    const slot = addMonthsToDate(startDateStr, k * periodMonths);
    if (endDateStr && slot > endDateStr) break;
    if (slots.length > 0 && slot <= slots[slots.length - 1]) break;
    slots.push(slot);
  }
  return slots;
}

/**
 * Next AMC visit. Calendar slots stay fixed. A pinned `pushedDate` replaces
 * only the next visit (for example, move it onto the 1-year end date).
 */
export function planAmcNextVisit(args: {
  startDate: string;
  endDate: string | null;
  periodMonths: number;
  referenceDate: string;
  pushedDate?: string | null;
  today: string;
}): AmcNextVisitPlan {
  const endDate = args.endDate || null;
  const pushed = args.pushedDate ? toDateOnly(args.pushedDate) : null;
  const visitDuringContract = args.referenceDate > args.startDate;
  const pushedConsumed = Boolean(
    pushed &&
      visitDuringContract &&
      args.referenceDate >= subtractDaysFromDate(pushed, AMC_PUSH_CONSUMED_GRACE_DAYS),
  );

  if (pushed && !pushedConsumed) {
    const reminderStart = subtractDaysFromDate(pushed, AMC_REMINDER_DAYS_BEFORE);
    const shouldCreate = args.today >= reminderStart;
    return {
      nextDue: pushed,
      reminderStart,
      shouldCreate,
      createReason: shouldCreate ? 'pushed' : null,
      visitKind: 'pushed',
      preExpiryWindowStart: null,
      pushedConsumed: false,
    };
  }

  const slots = listAmcContractSlots(args.startDate, args.periodMonths, endDate);
  const nextSlot = slots.find((slot) => slot > args.referenceDate) || null;
  if (nextSlot) {
    const reminderStart = subtractDaysFromDate(nextSlot, AMC_REMINDER_DAYS_BEFORE);
    const shouldCreate = args.today >= reminderStart;
    return {
      nextDue: nextSlot,
      reminderStart,
      shouldCreate,
      createReason: shouldCreate ? 'regular' : null,
      visitKind: 'slot',
      preExpiryWindowStart: null,
      pushedConsumed,
    };
  }

  if (endDate) {
    const preExpiry = computeAmcPreExpiryAutoCreate(endDate, args.today);
    return {
      nextDue: endDate,
      reminderStart: preExpiry.preExpiryWindowStart,
      shouldCreate: preExpiry.shouldCreate,
      createReason: preExpiry.shouldCreate ? 'pre_expiry' : null,
      visitKind: 'pre_expiry',
      preExpiryWindowStart: preExpiry.preExpiryWindowStart,
      pushedConsumed,
    };
  }

  const rolled = addMonthsToDate(args.referenceDate, Math.max(1, args.periodMonths));
  const reminderStart = subtractDaysFromDate(rolled, AMC_REMINDER_DAYS_BEFORE);
  const shouldCreate = args.today >= reminderStart;
  return {
    nextDue: rolled,
    reminderStart,
    shouldCreate,
    createReason: shouldCreate ? 'regular' : null,
    visitKind: 'slot',
    preExpiryWindowStart: null,
    pushedConsumed,
  };
}

export function formatAmcDateEnIN(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function shouldRunAmcJobCreationNow(): boolean {
  if (typeof window === 'undefined') return true;
  const lastRun = localStorage.getItem(AMC_THROTTLE_KEY);
  if (!lastRun) return true;
  const elapsed = Date.now() - parseInt(lastRun, 10);
  return Number.isNaN(elapsed) || elapsed >= AMC_THROTTLE_MS;
}

export function markAmcJobCreationRun(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AMC_THROTTLE_KEY, String(Date.now()));
}

/** Prevent parallel createAMCServiceJobs runs (duplicate mass inserts). */
export async function withAmcJobCreationLock<T>(fn: () => Promise<T>): Promise<T> {
  if (amcCreationInFlight) return amcCreationInFlight as Promise<T>;
  const run = fn().finally(() => {
    amcCreationInFlight = null;
  });
  amcCreationInFlight = run as Promise<{ created: number; error: unknown }>;
  return run;
}
