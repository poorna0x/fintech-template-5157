/**
 * Parse casual completed-job dates ("last sep", "24 september 2025") in IST.
 */

const MONTH_ALIASES: Array<{ keys: string[]; month: number }> = [
  { keys: ['january', 'jan'], month: 0 },
  { keys: ['february', 'feb'], month: 1 },
  { keys: ['march', 'mar'], month: 2 },
  { keys: ['april', 'apr'], month: 3 },
  { keys: ['may'], month: 4 },
  { keys: ['june', 'jun'], month: 5 },
  { keys: ['july', 'jul'], month: 6 },
  { keys: ['august', 'aug'], month: 7 },
  { keys: ['september', 'sept', 'sep'], month: 8 },
  { keys: ['october', 'oct'], month: 9 },
  { keys: ['november', 'nov'], month: 10 },
  { keys: ['december', 'dec'], month: 11 },
];

export type ParsedFlexibleDate = {
  iso: string;
  label: string;
  guessedDay: boolean;
};

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

export function formatIsoDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

export function formatDateLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function getIstDateParts(now: Date = new Date()): { year: number; month: number; day: number } {
  const iso = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month: month - 1, day };
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function result(year: number, monthIndex: number, day: number, guessedDay: boolean): ParsedFlexibleDate | null {
  const max = daysInMonth(year, monthIndex);
  if (day < 1 || day > max) return null;
  const iso = formatIsoDate(year, monthIndex, day);
  return { iso, label: formatDateLabel(iso), guessedDay };
}

function normalizeToken(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z]/g, '');
}

function monthFromToken(token: string): number | null {
  const t = normalizeToken(token);
  if (!t) return null;
  for (const row of MONTH_ALIASES) {
    if (row.keys.includes(t)) return row.month;
  }
  // Typos like "septermebr" / "septemebr" still start with sep/sept.
  for (const row of MONTH_ALIASES) {
    if (row.keys.some((key) => key.length >= 3 && t.startsWith(key))) return row.month;
  }
  return null;
}

function lastOccurrenceOfMonth(monthIndex: number, now: Date): { year: number; month: number } {
  const today = getIstDateParts(now);
  // If this month has not finished yet, "last September" means the previous year.
  const year = today.month <= monthIndex ? today.year - 1 : today.year;
  return { year, month: monthIndex };
}

/**
 * Best-effort parse of a human date. Month-only values default to the 1st
 * (`guessedDay: true`) so the admin can pick the exact day on the date picker.
 */
export function parseFlexibleCompletedDate(
  raw: string,
  now: Date = new Date()
): ParsedFlexibleDate | null {
  const text = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ');
  if (!text) return null;

  const today = getIstDateParts(now);

  if (text === 'today') return result(today.year, today.month, today.day, false);
  if (text === 'yesterday') {
    const d = new Date(Date.UTC(today.year, today.month, today.day));
    d.setUTCDate(d.getUTCDate() - 1);
    return result(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), false);
  }

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return result(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]), false);
  }

  const lastMonth = text.match(/^last\s+([a-z]+)$/);
  if (lastMonth) {
    const month = monthFromToken(lastMonth[1]);
    if (month == null) return null;
    const when = lastOccurrenceOfMonth(month, now);
    return result(when.year, when.month, 1, true);
  }

  const tokens = text.split(' ').filter(Boolean);
  const monthToken = tokens.find((t) => monthFromToken(t) != null);
  if (!monthToken) return null;
  const month = monthFromToken(monthToken);
  if (month == null) return null;

  const numbers = tokens
    .filter((t) => t !== monthToken)
    .map((t) => t.replace(/[^0-9]/g, ''))
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n));

  const year = numbers.find((n) => n >= 2000 && n <= 2100) ?? null;
  const dayCandidate = numbers.find((n) => n < 2000) ?? null;

  if (dayCandidate == null) {
    const when = year == null ? lastOccurrenceOfMonth(month, now) : { year, month };
    return result(when.year, when.month, 1, true);
  }

  let resolvedYear = year ?? today.year;
  const wouldBeFuture =
    resolvedYear > today.year ||
    (resolvedYear === today.year && month > today.month) ||
    (resolvedYear === today.year && month === today.month && dayCandidate > today.day);
  if (year == null && wouldBeFuture) resolvedYear -= 1;
  return result(resolvedYear, month, dayCandidate, false);
}

/** Start the old-completed-job wizard from a CRM AI message. */
export function isOldCompletedJobRequest(message: string): boolean {
  const t = String(message || '').toLowerCase();
  if (!t.trim()) return false;
  if (/\b(show|list|find|search|open|how many|count|filter)\b/.test(t)) return false;
  if (
    /\b(create|add|log|record|backfill|enter|save)\b/.test(t) &&
    /\b(old|past|previous|historical|backdated)\b/.test(t) &&
    /\bjobs?\b/.test(t)
  ) {
    return true;
  }
  return /\bold\s+completed\s+jobs?\b/.test(t);
}
