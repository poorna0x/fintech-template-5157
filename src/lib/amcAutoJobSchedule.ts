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

function formatLocalYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addMonthsToDate(dateStr: string, months: number): string {
  const [year, month, day] = dateStr.split('-').map((part) => parseInt(part, 10));
  const target = new Date(year, month - 1 + months, 1, 12);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return formatLocalYmd(target);
}

export function subtractDaysFromDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() - days);
  return formatLocalYmd(d);
}

export function toDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.split('T')[0].split(' ')[0];
  return new Date(value).toISOString().split('T')[0];
}

/**
 * AMC auto-create rule.
 * The next visit is the last completed service plus the period (4 or 6 months).
 * A visit done in the 5th month makes the next one 4 months after that completed date.
 * If that date is after the AMC end, the last job is created in the final 10 days.
 * Reference is the customer's last completed job (any service type), else the AMC start.
 * Staff can pin one visit with `next_service_on` (push to the 1-year date, or any date).
 * That pin is used once, then the next visit is again the period after the completed date.
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

/** Last day of contract year N. Same rule as a saved AMC end: start + N years, minus 1 day. */
export function amcContractYearEnd(startDateStr: string, yearIndex: number): string {
  const d = new Date(startDateStr + 'T12:00:00');
  d.setFullYear(d.getFullYear() + yearIndex);
  d.setDate(d.getDate() - 1);
  return formatLocalYmd(d);
}

/**
 * Next 1-year service date: the upcoming contract anniversary (year 1, then year 2, …),
 * not the final end of a 2- or 3-year AMC. Null when every anniversary is already past.
 */
export function nextAmcYearServiceDate(
  startDateStr: string,
  endDateStr: string | null,
  todayStr: string,
): string | null {
  if (!startDateStr) return null;
  for (let year = 1; year <= 15; year++) {
    const yearEnd = amcContractYearEnd(startDateStr, year);
    if (endDateStr && yearEnd > endDateStr) {
      return endDateStr >= todayStr ? endDateStr : null;
    }
    if (yearEnd >= todayStr) return yearEnd;
  }
  if (endDateStr && endDateStr >= todayStr) return endDateStr;
  return null;
}

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
 * Next AMC visit. Counted from the last completed service.
 * A pinned `pushedDate` replaces only the next visit.
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

  // A service from before this AMC does not start the clock. The first visit is the start date plus the period.
  const anchor = args.referenceDate < args.startDate ? args.startDate : args.referenceDate;
  const rolled = addMonthsToDate(anchor, Math.max(1, args.periodMonths));
  if (!endDate || rolled <= endDate) {
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

  if (endDate) {
    const preExpiry = computeAmcPreExpiryAutoCreate(endDate, args.today);
    const finalVisitDone =
      args.referenceDate > args.startDate && args.referenceDate >= preExpiry.preExpiryWindowStart;
    const shouldCreate = preExpiry.shouldCreate && !finalVisitDone;
    return {
      nextDue: endDate,
      reminderStart: preExpiry.preExpiryWindowStart,
      shouldCreate,
      createReason: shouldCreate ? 'pre_expiry' : null,
      visitKind: 'pre_expiry',
      preExpiryWindowStart: preExpiry.preExpiryWindowStart,
      pushedConsumed,
    };
  }

  return {
    nextDue: null,
    reminderStart: null,
    shouldCreate: false,
    createReason: null,
    visitKind: null,
    preExpiryWindowStart: null,
    pushedConsumed,
  };
}

const AMC_MONTH_INDEX: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/** "13 Oct 2026" or "28 Sept 2026" from an AMC job description. */
export function parseAmcDisplayDate(fragment: string): string | null {
  const iso = fragment.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const match = fragment.match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/);
  if (!match) return null;
  const month = AMC_MONTH_INDEX[match[2].slice(0, 3).toLowerCase()];
  const day = Number(match[1]);
  const year = Number(match[3]);
  if (!month || day < 1 || day > 31 || year < 2000) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Real AMC visit day written on the auto-created job. Not the day the job was opened. */
export function amcVisitDueFromDescription(description: string | null | undefined): string | null {
  const text = String(description || '');
  if (!text) return null;
  const due = text.match(/Due on\s+([^.\n]+)/i);
  if (due) {
    const parsed = parseAmcDisplayDate(due[1]);
    if (parsed) return parsed;
  }
  const pushed = text.match(/Visit pushed to\s+([^.\n]+)/i);
  if (pushed) {
    const parsed = parseAmcDisplayDate(pushed[1]);
    if (parsed) return parsed;
  }
  const ends = text.match(/ends on\s+([^.\n]+)/i);
  if (ends) return parseAmcDisplayDate(ends[1]);
  return null;
}

function calendarDaysFrom(startYmd: string, endYmd: string): number {
  const [sy, sm, sd] = startYmd.split('-').map(Number);
  const [ey, em, ed] = endYmd.split('-').map(Number);
  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  return Math.round((end - start) / 86400000);
}

/**
 * Note for an AMC follow-up: how long until the visit, counted from the real due date.
 * A 6-month visit that is 5 months and 28 days along reads as due in a few days.
 */
export function formatAmcJobDueNote(dueYmd: string, todayYmd: string): string {
  const days = calendarDaysFrom(todayYmd, dueYmd);
  if (days === 0) return 'AMC job due today';
  if (days > 0) {
    return days === 1 ? 'AMC job due in 1 day' : `AMC job due in ${days} days`;
  }
  const ago = -days;
  return ago === 1 ? 'AMC job due 1 day ago' : `AMC job due ${ago} days ago`;
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
