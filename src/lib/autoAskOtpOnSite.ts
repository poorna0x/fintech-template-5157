/**
 * On-site OTP ask — SERVER owns the 5‑minute clock.
 *
 * Phone only:
 *  1) When GPS is near → POST near:true (arms otp_onsite_detected_at on the job)
 *  2) On open / every 30s / resume → POST again (server fires Ask OTP once dwell elapsed)
 *
 * This survives screen lock and WebView timer death (the bug with local 5‑min setTimeout).
 */
import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';
import { getStoredOtpFromRequirements } from '@/lib/technicianOtpRequests';
import { haversineDistanceMeters } from '@/lib/googleMapsDistance';

const ENDPOINT = '/.netlify/functions/auto-ask-otp-on-site';
const NEAR_METERS = 200;
const MAX_ACCURACY_METERS = 500;
const ACTIVE_STATUSES = new Set(['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS']);

/** Avoid spamming the same job more than once every few seconds. */
const lastCallAt = new Map<string, number>();
const MIN_CALL_GAP_MS = 8_000;

export type AutoAskOtpJobLike = {
  id: string;
  status?: string | null;
  requirements?: unknown;
  customer?: { location?: { latitude?: number; longitude?: number; lat?: number; lng?: number } | null } | null;
  serviceLocation?: { latitude?: number; longitude?: number } | null;
  service_location?: { latitude?: number; longitude?: number } | null;
  otp_auto_asked_at?: string | null;
  otp_onsite_detected_at?: string | null;
};

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

async function callServer(jobId: string, near: boolean): Promise<void> {
  const now = Date.now();
  const key = `${jobId}:${near ? 'near' : 'check'}`;
  const last = lastCallAt.get(key) || 0;
  if (now - last < MIN_CALL_GAP_MS) return;
  lastCallAt.set(key, now);

  try {
    const accessToken = await resolveSupabaseAccessTokenForApi();
    if (!accessToken) {
      console.warn('[auto-ask-otp] no session');
      return;
    }

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ jobId, near }),
      signal: AbortSignal.timeout(30_000),
      keepalive: true,
    });

    const out = await res.json().catch(() => null);
    console.log('[auto-ask-otp]', near ? 'near' : 'check', jobId, res.status, out);
  } catch (err) {
    console.warn('[auto-ask-otp] error', err);
  }
}

/**
 * Fresh GPS: if near an OTP job, arm the server clock (near:true) and check dwell.
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
  const accuracyOk = !(
    typeof accuracy === 'number' &&
    Number.isFinite(accuracy) &&
    accuracy > MAX_ACCURACY_METERS
  );

  for (const job of jobs) {
    if (!isActiveOtpJob(job)) continue;

    // Always ping server for jobs already armed on the server (or locally known).
    // near:false still fires Ask OTP once 5 min have passed server-side.
    if (job.otp_onsite_detected_at) {
      void callServer(job.id, false);
    }

    if (!accuracyOk) continue;

    const dest = getCustomerCoords(job);
    if (!dest) continue;

    const meters = haversineDistanceMeters({ lat, lng }, dest);
    if (meters > NEAR_METERS) {
      console.log('[auto-ask-otp] not near', { jobId: job.id, meters: Math.round(meters) });
      // Still check dwell if we may have armed earlier this session before jobs refreshed.
      void callServer(job.id, false);
      continue;
    }

    console.log('[auto-ask-otp] near — arm/check server clock', {
      jobId: job.id,
      meters: Math.round(meters),
    });
    void callServer(job.id, true);
  }
}

/**
 * Resume / interval: check server clock for every active OTP job (no GPS required).
 * Fires Ask OTP if otp_onsite_detected_at + 5 min has passed.
 */
export function flushDueAutoAskOtpOnSite(opts: {
  technicianId: string;
  jobs: AutoAskOtpJobLike[];
}): void {
  const { technicianId, jobs } = opts;
  if (!technicianId || !jobs?.length) return;

  for (const job of jobs) {
    if (!isActiveOtpJob(job)) continue;
    void callServer(job.id, false);
  }
}
