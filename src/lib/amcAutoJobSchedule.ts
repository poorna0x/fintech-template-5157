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
 * AMC auto-create rule: next due = reference + period months (e.g. 4).
 * Reference is the customer's last completed job date (any service type — RO repair,
 * AMC visit, installation, etc.), not only jobs labelled "AMC Service".
 * Job is created when today is within 7 days before that due date (or later),
 * and the customer has no open AMC Service job yet.
 */
export const AMC_REMINDER_DAYS_BEFORE = 7;

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

/** When the next period-based service falls after AMC end, create one job in the last 7 days of the contract. */
export function computeAmcPreExpiryAutoCreate(
  endDateStr: string,
  todayStr: string
): { preExpiryWindowStart: string; shouldCreate: boolean } {
  const preExpiryWindowStart = subtractDaysFromDate(endDateStr, AMC_REMINDER_DAYS_BEFORE);
  const shouldCreate = todayStr >= preExpiryWindowStart && todayStr <= endDateStr;
  return { preExpiryWindowStart, shouldCreate };
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
