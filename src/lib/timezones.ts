/**
 * Static IANA timezone list. Use this for any timezone dropdown or display.
 * Do NOT query pg_timezone_names from the database — it is expensive and has 0% cache hit rate.
 * This list is a subset of common zones; add more as needed.
 */
export const TIMEZONE_NAMES: string[] = [
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/New_York',
  'America/Phoenix',
  'America/Sao_Paulo',
  'America/Toronto',
  'Asia/Bangkok',
  'Asia/Dubai',
  'Asia/Hong_Kong',
  'Asia/Jakarta',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Seoul',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Melbourne',
  'Australia/Sydney',
  'Europe/Amsterdam',
  'Europe/Berlin',
  'Europe/London',
  'Europe/Moscow',
  'Europe/Paris',
  'Pacific/Auckland',
  'Pacific/Fiji',
  'UTC',
];

let cachedList: { value: string; label: string }[] | null = null;

/**
 * Returns timezone options for dropdowns. No DB call — uses static list.
 * Label format: "Asia/Kolkata (IST)"-style can be added later if needed.
 */
export function getTimezoneOptions(): { value: string; label: string }[] {
  if (cachedList) return cachedList;
  cachedList = TIMEZONE_NAMES.map((name) => ({ value: name, label: name }));
  return cachedList;
}

/**
 * Get raw list of timezone names. No DB call.
 */
export function getTimezoneNames(): string[] {
  return TIMEZONE_NAMES;
}
