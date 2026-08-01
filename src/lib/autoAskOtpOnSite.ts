/**
 * Optimized on-site OTP ask:
 * When the tech opens the app and GPS is near the customer for an OTP-required
 * job, start a one-shot 5‑minute dwell timer. After 5 minutes, call the server
 * once — server skips if OTP already entered or already auto-asked.
 *
 * No continuous geofence uploads. Uses the same location fix the dashboard
 * already takes when the page opens / resumes.
 */
import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';
import { getStoredOtpFromRequirements } from '@/lib/technicianOtpRequests';
import { haversineDistanceMeters } from '@/lib/googleMapsDistance';

const ENDPOINT = '/.netlify/functions/auto-ask-otp-on-site';
const STORAGE_KEY = 'hro_otp_onsite_dwell_v1';
const NEAR_METERS = 200;
const MAX_ACCURACY_METERS = 150;
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

async function fireAutoAsk(jobId: string, technicianId: string): Promise<void> {
  const map = readDwellMap();
  const entry = map[jobId];
  if (entry?.fired) return;
  map[jobId] = { nearAt: entry?.nearAt || Date.now(), fired: true };
  writeDwellMap(map);

  const timer = pendingTimers.get(jobId);
  if (timer) {
    clearTimeout(timer);
    pendingTimers.delete(jobId);
  }

  try {
    const accessToken = await resolveSupabaseAccessTokenForApi();
    if (!accessToken) return;

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
    } | null;

    if (out?.skipped && out.reason === 'otp_already_entered') {
      // Keep fired so we don't keep calling.
      return;
    }
    if (!res.ok) {
      // Allow a later open to retry if claim never happened.
      const latest = readDwellMap();
      if (latest[jobId]) {
        latest[jobId] = { nearAt: latest[jobId].nearAt, fired: false };
        writeDwellMap(latest);
      }
      console.warn('[auto-ask-otp] request failed', res.status, out);
    }
  } catch (err) {
    const latest = readDwellMap();
    if (latest[jobId]) {
      latest[jobId] = { nearAt: latest[jobId].nearAt, fired: false };
      writeDwellMap(latest);
    }
    console.warn('[auto-ask-otp] error', err);
  }
}

function scheduleFire(jobId: string, technicianId: string, nearAt: number): void {
  if (pendingTimers.has(jobId)) return;
  const remaining = Math.max(0, nearAt + DWELL_MS - Date.now());
  const timer = setTimeout(() => {
    pendingTimers.delete(jobId);
    void fireAutoAsk(jobId, technicianId);
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
 * Call whenever the technician dashboard has a fresh GPS fix and job list.
 * Cheap: local haversine + localStorage; at most one network call per job.
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

  const accuracy = opts.accuracyMeters;
  if (typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy > MAX_ACCURACY_METERS) {
    return;
  }

  const map = readDwellMap();
  let mapDirty = false;
  const now = Date.now();

  for (const job of jobs) {
    if (!job?.id) continue;
    const status = String(job.status || '').toUpperCase();
    if (!ACTIVE_STATUSES.has(status)) continue;
    if (job.otp_auto_asked_at) continue;
    if (!jobRequiresOtp(job)) continue;
    if (getStoredOtpFromRequirements(job.requirements)) continue;

    const dest = getCustomerCoords(job);
    if (!dest) continue;

    const meters = haversineDistanceMeters({ lat, lng }, dest);
    if (meters > NEAR_METERS) continue;

    const existing = map[job.id];
    if (existing?.fired) continue;

    if (!existing?.nearAt) {
      map[job.id] = { nearAt: now };
      mapDirty = true;
      scheduleFire(job.id, technicianId, now);
      continue;
    }

    if (now >= existing.nearAt + DWELL_MS) {
      void fireAutoAsk(job.id, technicianId);
    } else {
      scheduleFire(job.id, technicianId, existing.nearAt);
    }
  }

  if (mapDirty) writeDwellMap(map);
}
