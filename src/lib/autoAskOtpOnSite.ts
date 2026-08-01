/**
 * On-site OTP ask: after first GPS-near on an OTP-required job, wait 5 minutes
 * then Ask OTP once. Server skips if OTP already entered or otp_auto_asked_at is set.
 *
 * Reliability notes (why 20s worked but 5 min often did not):
 * - Android WebView pauses/throttles long setTimeouts when the screen locks.
 * - We used to require "still within 200 m" to fire — GPS drift after minutes blocked it.
 * Fix: persist nearAt, fire when dwell elapsed even if slightly off-site, and flush
 * overdue jobs on an interval + app resume (not only on the timer callback).
 */
import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';
import { getStoredOtpFromRequirements } from '@/lib/technicianOtpRequests';
import { haversineDistanceMeters } from '@/lib/googleMapsDistance';

const ENDPOINT = '/.netlify/functions/auto-ask-otp-on-site';
const STORAGE_KEY = 'hro_otp_onsite_dwell_v5';
const NEAR_METERS = 200;
const MAX_ACCURACY_METERS = 500;
const DWELL_MS = 5 * 60 * 1000;
const ACTIVE_STATUSES = new Set(['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS']);

type DwellEntry = { nearAt: number; fired?: boolean };
type DwellMap = Record<string, DwellEntry>;

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

function readDwellMap(): DwellMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DwellMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeDwellMap(map: DwellMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
}

function markFired(jobId: string, nearAt: number): void {
  const map = readDwellMap();
  map[jobId] = { nearAt, fired: true };
  writeDwellMap(map);
}

function parseRequirements(raw: unknown): any[] {
  try {
    if (typeof raw === 'string') {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return [parsed];
      return [];
    }
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') return [raw];
  } catch {
    /* ignore */
  }
  return [];
}

function jobRequiresOtp(job: { requirements?: unknown }): boolean {
  return parseRequirements(job.requirements).some(
    (r) => r && typeof r === 'object' && r.require_otp === true
  );
}

function getCustomerCoords(job: any): { lat: number; lng: number } | null {
  const site = String(job?.service_site || job?.serviceSite || 'primary').toLowerCase();
  const customer = job?.customer;
  const loc =
    (site === 'alternate' || site === 'alt'
      ? customer?.alternate_location || customer?.alternateLocation
      : null) ||
    customer?.location ||
    job?.serviceLocation ||
    job?.service_location ||
    null;
  const lat = Number(loc?.latitude ?? loc?.lat);
  const lng = Number(loc?.longitude ?? loc?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

function isActiveOtpJob(job: AutoAskOtpJobLike): boolean {
  if (!job?.id) return false;
  const status = String(job.status || '').toUpperCase();
  if (!ACTIVE_STATUSES.has(status)) return false;
  if (job.otp_auto_asked_at) return false;
  if (!jobRequiresOtp(job)) return false;
  if (getStoredOtpFromRequirements(job.requirements)) return false;
  return true;
}

async function fireAutoAsk(jobId: string, technicianId: string, nearAt: number): Promise<void> {
  const map = readDwellMap();
  if (map[jobId]?.fired) return;

  const timer = pendingTimers.get(jobId);
  if (timer) {
    clearTimeout(timer);
    pendingTimers.delete(jobId);
  }

  try {
    const accessToken = await resolveSupabaseAccessTokenForApi();
    if (!accessToken) {
      console.warn('[auto-ask-otp] no session — will retry on next flush');
      return;
    }

    console.log('[auto-ask-otp] calling server', { jobId });
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ jobId, technicianId }),
      signal: AbortSignal.timeout(30_000),
      keepalive: true,
    });

    const out = (await res.json().catch(() => null)) as {
      skipped?: boolean;
      reason?: string;
      asked?: boolean;
      sent?: boolean;
      error?: string;
    } | null;

    console.log('[auto-ask-otp] response', res.status, out);

    if (res.ok) {
      markFired(jobId, nearAt);
      return;
    }

    console.warn('[auto-ask-otp] request failed', res.status, out);
  } catch (err) {
    console.warn('[auto-ask-otp] error', err);
  }
}

function scheduleFire(jobId: string, technicianId: string, nearAt: number): void {
  const remaining = Math.max(0, nearAt + DWELL_MS - Date.now());
  const existing = pendingTimers.get(jobId);
  if (existing) {
    clearTimeout(existing);
    pendingTimers.delete(jobId);
  }
  console.log('[auto-ask-otp] timer armed', { jobId, remainingMs: remaining });
  const timer = setTimeout(() => {
    pendingTimers.delete(jobId);
    void fireAutoAsk(jobId, technicianId, nearAt);
  }, remaining);
  pendingTimers.set(jobId, timer);
}

export type AutoAskOtpJobLike = {
  id: string;
  status?: string | null;
  requirements?: unknown;
  customer?: { location?: { latitude?: number; longitude?: number; lat?: number; lng?: number } | null } | null;
  serviceLocation?: { latitude?: number; longitude?: number } | null;
  service_location?: { latitude?: number; longitude?: number } | null;
  otp_auto_asked_at?: string | null;
};

/**
 * Fire any jobs whose dwell already finished. Does not need a fresh GPS fix —
 * used on resume / periodic flush because long setTimeouts die in the background.
 */
export function flushDueAutoAskOtpOnSite(opts: {
  technicianId: string;
  jobs: AutoAskOtpJobLike[];
}): void {
  const { technicianId, jobs } = opts;
  if (!technicianId || !jobs?.length) return;

  const map = readDwellMap();
  const now = Date.now();

  for (const job of jobs) {
    if (!isActiveOtpJob(job)) continue;
    const entry = map[job.id];
    if (!entry?.nearAt || entry.fired) continue;
    if (now < entry.nearAt + DWELL_MS) {
      scheduleFire(job.id, technicianId, entry.nearAt);
      continue;
    }
    console.log('[auto-ask-otp] dwell elapsed — flushing', { jobId: job.id });
    void fireAutoAsk(job.id, technicianId, entry.nearAt);
  }
}

/**
 * Call when the technician dashboard has a GPS fix + job list.
 * Starts the dwell clock the first time the tech is near the customer.
 */
export function evaluateAutoAskOtpOnSite(opts: {
  technicianId: string;
  jobs: AutoAskOtpJobLike[];
  lat: number;
  lng: number;
  accuracyMeters?: number | null;
}): void {
  const { technicianId, jobs, lat, lng } = opts;
  if (!technicianId || !Number.isFinite(lat) || !Number.isFinite(lng)) return;

  // Always flush overdue first (even if this fix is coarse / slightly off-site).
  flushDueAutoAskOtpOnSite({ technicianId, jobs });

  const accuracy = opts.accuracyMeters;
  const accuracyOk =
    !(typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy > MAX_ACCURACY_METERS);

  const map = readDwellMap();
  let mapDirty = false;
  const now = Date.now();

  for (const job of jobs) {
    if (!isActiveOtpJob(job)) continue;

    const existing = map[job.id];
    if (existing?.fired) continue;

    // Dwell already started — keep timer; don't require still-near to stay armed.
    if (existing?.nearAt) {
      if (now >= existing.nearAt + DWELL_MS) {
        void fireAutoAsk(job.id, technicianId, existing.nearAt);
      } else {
        scheduleFire(job.id, technicianId, existing.nearAt);
      }
      continue;
    }

    if (!accuracyOk) continue;

    const dest = getCustomerCoords(job);
    if (!dest) {
      console.log('[auto-ask-otp] skip — no customer coords', job.id);
      continue;
    }

    const meters = haversineDistanceMeters({ lat, lng }, dest);
    if (meters > NEAR_METERS) {
      console.log('[auto-ask-otp] not near yet', { jobId: job.id, meters: Math.round(meters) });
      continue;
    }

    console.log('[auto-ask-otp] near customer — start dwell', {
      jobId: job.id,
      meters: Math.round(meters),
      dwellMs: DWELL_MS,
    });
    map[job.id] = { nearAt: now };
    mapDirty = true;
    scheduleFire(job.id, technicianId, now);
  }

  if (mapDirty) writeDwellMap(map);
}
