// Shared, dependency-free warranty helpers used by both the public /warranty page
// and the admin warranty dialog. Keep this free of Supabase/heavy imports so the
// public page bundle stays small.

export type WarrantyCategory =
  | 'ELECTRICAL'
  | 'MEMBRANE'
  | 'CONSUMABLE'
  | 'OUTSIDE_FILTER'
  | 'BODY'
  | 'OTHER';

export interface WarrantyCategoryDef {
  value: WarrantyCategory;
  label: string;
  /** Examples shown as a hint in the admin UI. */
  hint: string;
  /** Tailwind classes for the category badge. */
  badgeClass: string;
}

// Main components of a water purifier, grouped into the warranty categories the
// business cares about. Order here is the display order in the UI.
export const WARRANTY_CATEGORIES: WarrantyCategoryDef[] = [
  {
    value: 'ELECTRICAL',
    label: 'Electricals',
    hint: 'Pump, adapter/SMPS, solenoid valve, UV barrel',
    badgeClass: 'bg-amber-100 text-amber-800',
  },
  {
    value: 'MEMBRANE',
    label: 'RO Membrane',
    hint: 'RO membrane',
    badgeClass: 'bg-violet-100 text-violet-800',
  },
  {
    value: 'CONSUMABLE',
    label: 'Consumables',
    hint: 'Sediment, pre-carbon, post-carbon filters',
    badgeClass: 'bg-emerald-100 text-emerald-800',
  },
  {
    value: 'OUTSIDE_FILTER',
    label: 'Outside Filter',
    hint: 'Outside / pre-filter candle & housing',
    badgeClass: 'bg-sky-100 text-sky-800',
  },
  {
    value: 'BODY',
    label: 'Body & Fittings',
    hint: 'Housing, tank, faucet, pipes, fittings',
    badgeClass: 'bg-slate-100 text-slate-800',
  },
  {
    value: 'OTHER',
    label: 'Other',
    hint: 'Anything else',
    badgeClass: 'bg-gray-100 text-gray-700',
  },
];

const CATEGORY_MAP = new Map<string, WarrantyCategoryDef>(
  WARRANTY_CATEGORIES.map((c) => [c.value, c])
);

export function categoryDef(category: string | null | undefined): WarrantyCategoryDef {
  return CATEGORY_MAP.get(String(category || 'OTHER')) || CATEGORY_MAP.get('OTHER')!;
}

export function categoryLabel(category: string | null | undefined): string {
  return categoryDef(category).label;
}

export const DEFAULT_WARRANTY_MONTHS = 3;

// We treat a "month" as a fixed 30 days so durations are predictable: 3 months = 90 days
// (not 89–92 depending on the calendar). Warranties are stored/compared by exact days.
export const DAYS_PER_MONTH = 30;

export type DurationUnit = 'months' | 'days';

/** Convert a duration value + unit into a whole number of days (30-day months). */
export function durationToDays(value: number, unit: DurationUnit): number {
  const v = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  return unit === 'months' ? v * DAYS_PER_MONTH : v;
}

/** Derive a friendly {value, unit} from a day count: exact multiples of 30 show as months. */
export function deriveDuration(days: number): { value: number; unit: DurationUnit } {
  const d = Number.isFinite(days) ? Math.max(0, Math.round(days)) : 0;
  if (d > 0 && d % DAYS_PER_MONTH === 0) {
    return { value: d / DAYS_PER_MONTH, unit: 'months' };
  }
  return { value: d, unit: 'days' };
}

/** Add a whole number of days to a YYYY-MM-DD date string. */
export function addDays(dateStr: string, days: number): string {
  const base = parseDateOnly(dateStr) ?? new Date();
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + Math.round(days));
  return toDateOnly(d);
}

/** Short human label for a duration, e.g. "3 months (90 days)" or "45 days". */
export function durationLabel(value: number, unit: DurationUnit): string {
  const days = durationToDays(value, unit);
  if (unit === 'months') {
    return `${value} month${value === 1 ? '' : 's'} (${days} days)`;
  }
  return `${days} day${days === 1 ? '' : 's'}`;
}

// Standard, professionally-worded note presets the admin can toggle on when adding a
// warranty. Stored as plain text in warranties.notes (joined with blank lines).
export interface WarrantyNotePreset {
  id: string;
  label: string;
  text: string;
  /** Auto-managed presets are applied automatically (e.g. AMC) and not shown as manual toggles. */
  auto?: boolean;
}

export const WARRANTY_NOTE_PRESETS: WarrantyNotePreset[] = [
  {
    id: 'exclusions',
    label: 'Standard exclusions',
    text:
      'This warranty covers manufacturing defects only. It does not cover physical damage, ' +
      'dry-run operation, voltage fluctuations, water leakage due to external causes, natural ' +
      'calamities, or any damage arising from misuse or mishandling.',
  },
  {
    id: 'visiting_charge',
    label: 'Visiting charges (uncovered parts)',
    text:
      'If a service visit is requested for a part that is not covered under warranty, a standard ' +
      'visiting and service charge will be applicable as per prevailing rates.',
  },
  {
    id: 'amc',
    label: 'Under AMC',
    text:
      'This customer is covered under an active Annual Maintenance Contract (AMC). Services and ' +
      'covered parts will be provided as agreed in the AMC agreement.',
    // Shown automatically (live AMC banner) for active-AMC customers — not a manual toggle.
    auto: true,
  },
];

/** Manually-toggleable presets (excludes auto-managed ones like AMC). */
export const MANUAL_WARRANTY_NOTE_PRESETS = WARRANTY_NOTE_PRESETS.filter((p) => !p.auto);

const NOTE_PRESET_MAP = new Map(WARRANTY_NOTE_PRESETS.map((p) => [p.id, p]));

export function notePresetText(id: string): string {
  return NOTE_PRESET_MAP.get(id)?.text ?? '';
}

/** Default number of days a replaced spare is covered for (90 days). */
export const DEFAULT_WARRANTY_DAYS = DEFAULT_WARRANTY_MONTHS * DAYS_PER_MONTH;

/**
 * Professional default policy shown when a customer has no specific warranty recorded.
 * Keeps the public page reassuring even when nothing was entered for them yet.
 */
export const GENERAL_WARRANTY_POLICY =
  `As a general policy, any spare part replaced during service is covered by a ` +
  `${DEFAULT_WARRANTY_DAYS}-day warranty starting from the date that part was changed, ` +
  `unless a different period is specified on your service bill/invoice.`;

/** Invoice/bill is the proof of the replacement date for any claim. */
export const WARRANTY_INVOICE_REQUIRED_NOTE =
  'Please keep your service bill/invoice safe — it serves as proof of the replacement ' +
  'date and is required to process any warranty claim.';

/** Standard terms shown with the general policy (proof of claim, exclusions, charges). */
export const GENERAL_WARRANTY_TERMS: string[] = [
  WARRANTY_INVOICE_REQUIRED_NOTE,
  notePresetText('exclusions'),
  notePresetText('visiting_charge'),
];

// Best-effort category guess from a part/product name so the admin doesn't have to
// classify every part by hand. Falls back to OTHER.
export function guessCategory(name: string | null | undefined): WarrantyCategory {
  const n = String(name || '').toLowerCase();
  if (/(membrane|ro\s*film)/.test(n)) return 'MEMBRANE';
  if (/(pump|smps|adapter|adaptor|solenoid|sv\b|valve|uv|transformer|motor|sensor|tds controller)/.test(n))
    return 'ELECTRICAL';
  if (/(filter|cartridge|candle|carbon|sediment|spun|cto|gac|antiscalant|mineral|alkaline|post\s*carbon)/.test(n))
    return n.includes('outside') || n.includes('pre filter') || n.includes('pre-filter')
      ? 'OUTSIDE_FILTER'
      : 'CONSUMABLE';
  if (/(housing|bowl|tank|faucet|tap|pipe|elbow|connector|spanner|stand|body|clamp|fitting)/.test(n))
    return 'BODY';
  return 'OTHER';
}

/** Add whole months to a YYYY-MM-DD date string, clamping day overflow (e.g. Jan 31 + 1mo). */
export function addMonths(dateStr: string, months: number): string {
  const base = parseDateOnly(dateStr) ?? new Date();
  const day = base.getDate();
  const d = new Date(base.getFullYear(), base.getMonth() + months, 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return toDateOnly(d);
}

/** Parse a YYYY-MM-DD (or ISO) string into a local Date at midnight, or null. */
function parseDateOnly(dateStr: string): Date | null {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

export function todayDateOnly(): string {
  return toDateOnly(new Date());
}

export interface WarrantyStatus {
  active: boolean;
  daysLeft: number;
  label: string;
  /** Tailwind classes for a status pill. */
  toneClass: string;
}

/** Compute active/expired + days remaining from an end date (YYYY-MM-DD). */
export function warrantyStatus(endDate: string): WarrantyStatus {
  const end = parseDateOnly(endDate);
  if (!end) {
    return { active: false, daysLeft: 0, label: 'Unknown', toneClass: 'bg-gray-100 text-gray-700' };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const msPerDay = 86_400_000;
  const daysLeft = Math.round((end.getTime() - today.getTime()) / msPerDay);

  if (daysLeft < 0) {
    return { active: false, daysLeft, label: 'Expired', toneClass: 'bg-red-100 text-red-700' };
  }
  if (daysLeft === 0) {
    return { active: true, daysLeft, label: 'Expires today', toneClass: 'bg-amber-100 text-amber-800' };
  }
  if (daysLeft <= 14) {
    return {
      active: true,
      daysLeft,
      label: `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`,
      toneClass: 'bg-amber-100 text-amber-800',
    };
  }
  return {
    active: true,
    daysLeft,
    label: `${daysLeft} days left`,
    toneClass: 'bg-emerald-100 text-emerald-700',
  };
}

/** Format YYYY-MM-DD as e.g. "10 Jun 2026" for display. */
export function formatWarrantyDate(dateStr: string): string {
  const d = parseDateOnly(dateStr);
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Shapes returned by the public lookup function and shared across page + lib.
export interface PublicWarrantyItem {
  id: string;
  category: WarrantyCategory;
  label: string;
  /** false = explicitly not covered (no warranty). Defaults to true when absent. */
  covered?: boolean;
  start_date: string;
  end_date: string;
}

export interface PublicWarranty {
  id: string;
  start_date: string;
  end_date: string;
  notes: string | null;
  items: PublicWarrantyItem[];
}

export interface PublicWarrantyCustomer {
  name: string;
  customer_id: string;
  visible_address: string;
  /** Full single-line address (street, area, city, state, pincode). */
  address: string;
  brand: string;
  model: string;
  customer_since: string | null;
  last_service_date: string | null;
  installation_date: string | null;
}

export interface PublicAmcInfo {
  active: boolean;
  start_date: string | null;
  end_date: string | null;
}

export interface PublicWarrantyLookupResult {
  found: boolean;
  customer?: PublicWarrantyCustomer;
  warranties?: PublicWarranty[];
  amc?: PublicAmcInfo | null;
}
