import { differenceInDays, differenceInMonths, differenceInYears } from 'date-fns';

/**
 * How long ago a past date was, e.g. "23 days before", "2 months before", "1 year before".
 * Under 30 calendar days → days; under 1 year → months; otherwise → years.
 */
export function formatTimeBefore(
  dateInput: Date | string,
  referenceDate: Date = new Date()
): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return '';

  const days = differenceInDays(referenceDate, date);

  if (days <= 0) return 'Today';
  if (days < 30) {
    return days === 1 ? '1 day before' : `${days} days before`;
  }

  const years = differenceInYears(referenceDate, date);
  if (years >= 1) {
    return years === 1 ? '1 year before' : `${years} years before`;
  }

  const months = differenceInMonths(referenceDate, date);
  const monthCount = Math.max(1, months);
  return monthCount === 1 ? '1 month before' : `${monthCount} months before`;
}

/** Full completion timestamp for tooltips, e.g. "May 15th 2026 at 12:31 PM". */
export function formatCompletedAtDetailed(dateInput: Date | string): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return '';

  const day = date.getDate();
  const month = date.toLocaleString('en-US', { month: 'long' });
  const year = date.getFullYear();
  const ordinal = getOrdinalSuffix(day);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, '0');
  return `${month} ${day}${ordinal} ${year} at ${displayHours}:${displayMinutes} ${ampm}`;
}

function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/** e.g. "13 days before · May 15th 2026 at 12:31 PM" */
export function formatCompletedWhen(dateInput: Date | string): string | null {
  const before = formatTimeBefore(dateInput);
  const detailed = formatCompletedAtDetailed(dateInput);
  if (!before || !detailed) return null;
  return `${before} · ${detailed}`;
}
