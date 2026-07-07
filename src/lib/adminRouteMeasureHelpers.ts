import type { Job } from '@/types';

// Helper function to format time in 12-hour format
export function formatTime12Hour(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, '0');
  return `${displayHours}:${displayMinutes} ${ampm}`;
}
export function getJobScheduledDateKey(jobRow: Job | any): string | null {
  const raw = jobRow?.scheduled_date ?? jobRow?.scheduledDate;
  if (!raw) return null;
  if (typeof raw === 'string') return raw.split('T')[0];
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return null;
  }
}
export function parseCustomTimeMinutesFromJob(jobRow: Job | any): number | null {
  let reqs = jobRow?.requirements;
  if (typeof reqs === 'string') {
    try {
      reqs = JSON.parse(reqs);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(reqs)) return null;
  const withTime = reqs.find((r: any) => r && typeof r === 'object' && r.custom_time);
  const t = withTime?.custom_time;
  if (!t || typeof t !== 'string') return null;
  const parts = t.trim().split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] || '0', 10);
  if (isNaN(h) || h < 0 || h > 23) return null;
  if (isNaN(m) || m < 0 || m > 59) return null;
  return h * 60 + m;
}
/** Visit order: CUSTOM with HH:MM first (by time), then MORNING→…→FLEXIBLE, then CUSTOM without time (by created). */
export function routeSortKeyForJob(jobRow: Job | any): string {
  const slot = String(jobRow?.scheduled_time_slot || jobRow?.scheduledTimeSlot || 'MORNING').toUpperCase();
  const created = new Date(jobRow?.created_at || jobRow?.createdAt || 0).getTime();
  if (slot === 'CUSTOM') {
    const mins = parseCustomTimeMinutesFromJob(jobRow);
    if (mins != null) return `A-${String(mins).padStart(5, '0')}-${String(created).padStart(13, '0')}`;
    return `C-${String(created).padStart(13, '0')}`;
  }
  const slotRank: Record<string, number> = {
    MORNING: 1,
    AFTERNOON: 2,
    EVENING: 3,
    FLEXIBLE: 4,
  };
  const r = slotRank[slot] ?? 50;
  return `B-${String(r).padStart(2, '0')}-${String(created).padStart(13, '0')}`;
}

/**
 * Location for route labels — from DB-shaped job row: `jobs.service_address` (jsonb),
 * embedded `customer.address`, `customer.visible_address`, and `service_location` when needed.
 * Normalizes all whitespace so multi-word areas (e.g. "HSR Layout") and odd spacing still show.
 */
export function getRouteLocationWord(jobRow: Job | any): string {
  const str = (v: unknown): string => {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' && !Number.isNaN(v)) return String(v);
    return '';
  };
  const normalizeWs = (s: string) =>
    str(s).replace(/[\s\u00a0\u2000-\u200B\uFEFF]+/g, ' ').trim();

  const genericToken = (w: string) => {
    const t = w.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!t || t.length < 2) return true;
    if (t === 'bengaluru' || t === 'bangalore' || t === 'banglore') return true;
    if (t === 'karnataka' || t === 'india') return true;
    return false;
  };

  /** Entire phrase is only generic tokens (e.g. "Bangalore" or "Bangalore Karnataka"). */
  const phraseIsOnlyGeneric = (s: string) => {
    const n = normalizeWs(s);
    if (!n) return true;
    const parts = n.split(/\s+/).filter(Boolean);
    return parts.length > 0 && parts.every((p) => genericToken(p));
  };

  /** Prefer full short phrase when it contains any non-generic word (multi-word areas). */
  const pickPhraseOrEmpty = (raw: string, maxLen = 48): string => {
    const n = normalizeWs(raw);
    if (!n) return '';
    if (phraseIsOnlyGeneric(n)) return '';
    return n.length > maxLen ? `${n.slice(0, Math.max(0, maxLen - 1))}…` : n;
  };

  const firstNonGenericWord = (s: string): string => {
    for (const raw of normalizeWs(s).split(/[\s,]+/)) {
      const w = raw.trim();
      if (!w) continue;
      if (!genericToken(w)) return w;
    }
    return '';
  };

  /** DB/Google often store "Frazer, Town, Bangalore" — must not use only the first comma segment. */
  const localityBeforeCity = (raw: string): string => {
    const parts = raw.split(',').map((p) => normalizeWs(p)).filter(Boolean);
    const kept: string[] = [];
    for (const p of parts) {
      const lower = p.toLowerCase();
      const first = lower.split(/\s+/)[0] || '';
      if (/^\d{6}$/.test(p)) break;
      if (
        first === 'bengaluru' ||
        first === 'bangalore' ||
        first === 'banglore' ||
        first === 'karnataka' ||
        first === 'india'
      ) {
        break;
      }
      if (lower === 'in') break;
      kept.push(p);
    }
    return normalizeWs(kept.join(' '));
  };

  const cust = jobRow?.customer as any;
  const customerAddress = cust?.address || {};
  const serviceAddress = jobRow?.service_address || jobRow?.serviceAddress || {};

  let visibleLocation =
    normalizeWs(
      str(customerAddress?.visible_address) ||
        str(customerAddress?.visibleAddress) ||
        str(cust?.visible_address) ||
        str(serviceAddress?.visible_address) ||
        str(serviceAddress?.visibleAddress)
    );

  if (visibleLocation.includes(',')) {
    visibleLocation = localityBeforeCity(visibleLocation);
  }

  if (!visibleLocation) {
    visibleLocation = normalizeWs(
      str(customerAddress?.area) || str(serviceAddress?.area)
    );
    if (visibleLocation.includes(',')) {
      visibleLocation = localityBeforeCity(visibleLocation);
    }
  }

  let phrase = pickPhraseOrEmpty(visibleLocation);
  if (phrase) return phrase;

  const landmark = normalizeWs(str(customerAddress?.landmark) || str(serviceAddress?.landmark));
  phrase = pickPhraseOrEmpty(landmark);
  if (phrase) return phrase;

  const street = normalizeWs(str(customerAddress?.street) || str(serviceAddress?.street));
  phrase = pickPhraseOrEmpty(street);
  if (phrase) return phrase;

  const city = normalizeWs(str(customerAddress?.city) || str(serviceAddress?.city));
  let w = firstNonGenericWord(city);
  if (w) return w;

  const pin = normalizeWs(str(customerAddress?.pincode) || str(serviceAddress?.pincode));
  if (pin) return pin;

  const svcLoc = cust?.location || jobRow?.service_location || jobRow?.serviceLocation || {};
  const formatted = normalizeWs(str(svcLoc?.formattedAddress) || str(svcLoc?.formatted_address));
  if (formatted) {
    const joined = localityBeforeCity(formatted);
    phrase = pickPhraseOrEmpty(joined);
    if (phrase) return phrase;
    for (const part of formatted.split(',')) {
      const chunk = pickPhraseOrEmpty(normalizeWs(part));
      if (chunk) return chunk;
      w = firstNonGenericWord(part);
      if (w) return w;
    }
  }

  return '';
}
/** Route row: `Customer name (location)` — distinct stops even when area text repeats. */
export function formatRouteStopLabel(jobRow: Job | any): string {
  const cust = jobRow?.customer as any;
  const displayName = (cust?.full_name || cust?.fullName || 'Customer').trim() || 'Customer';
  const loc = getRouteLocationWord(jobRow);
  if (loc) return `${displayName} (${loc})`;
  return `${displayName} (—)`;
}

/** Active route jobs for this technician (assigned / en route / in progress), any scheduled day — not only today. */
export function collectOngoingJobsForMeasure(workingJob: Job | any, jobs: Job[]): Job[] {
  const assignedTechnicianId =
    (workingJob as any).assigned_technician_id || workingJob.assignedTechnicianId || null;
  if (!assignedTechnicianId) return [workingJob as Job];
  const ROUTE_STATUSES = new Set(['ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS']);
  let routeJobs = jobs.filter((j) => {
    const tid = (j as any).assigned_technician_id || j.assignedTechnicianId;
    if (String(tid) !== String(assignedTechnicianId)) return false;
    const st = (j as any).status || j.status;
    return ROUTE_STATUSES.has(st);
  });
  if (!routeJobs.some((j) => j.id === workingJob.id)) {
    routeJobs = [...routeJobs, workingJob as Job];
  }
  return [...routeJobs].sort((a, b) => {
    const da = getJobScheduledDateKey(a) || '9999-12-31';
    const db = getJobScheduledDateKey(b) || '9999-12-31';
    if (da !== db) return da.localeCompare(db);
    return routeSortKeyForJob(a).localeCompare(routeSortKeyForJob(b));
  });
}

