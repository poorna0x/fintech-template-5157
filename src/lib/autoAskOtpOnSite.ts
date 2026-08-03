/**
 * On-site OTP ask — SERVER owns the dwell clock (7 minutes after GPS near).
 *
 * Phone:
 *  1) GPS near customer → POST near:true (arms otp_onsite_detected_at)
 *  2) Open / every 15s / resume → POST check (fires Ask OTP when dwell elapsed)
 */
import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';
import { getStoredOtpFromRequirements } from '@/lib/technicianOtpRequests';
import { haversineDistanceMeters } from '@/lib/googleMapsDistance';
import { getJobLocationDisplay } from '@/lib/customer-locations';
import { extractCoordinates } from '@/lib/maps';
import { extractCoordinatesFromGoogleMapsLink } from '@/lib/googleMapsLink';
import {
  cancelNativeAutoAskDwell,
  scheduleNativeAutoAskDwell,
} from '@/lib/autoAskOtpNativeAlarm';

const ENDPOINT = '/.netlify/functions/auto-ask-otp-on-site';
/** Was 200m — too tight for typical phone GPS + apartment offset. */
const NEAR_METERS = 600;
const MAX_ACCURACY_METERS = 800;
const ACTIVE_STATUSES = new Set(['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS']);

const lastCallAt = new Map<string, number>();
const MIN_CALL_GAP_MS = 5_000;

export type AutoAskOtpJobLike = {
  id: string;
  status?: string | null;
  requirements?: unknown;
  customer?: unknown;
  serviceLocation?: unknown;
  service_location?: unknown;
  service_site?: string | null;
  serviceSite?: string | null;
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

/** Same pin the tech Maps button uses (primary/secondary site + googleLocation). */
function getCustomerCoords(job: any): { lat: number; lng: number } | null {
  try {
    const display = getJobLocationDisplay(job, job?.customer);
    const fromExtract = extractCoordinates(display.location);
    if (
      fromExtract &&
      fromExtract.latitude &&
      fromExtract.longitude &&
      (fromExtract.latitude !== 0 || fromExtract.longitude !== 0)
    ) {
      return { lat: fromExtract.latitude, lng: fromExtract.longitude };
    }

    const googleHref =
      (display.location as any)?.googleLocation ||
      (display.location as any)?.google_location ||
      '';
    if (typeof googleHref === 'string' && googleHref.trim()) {
      const fromLink = extractCoordinatesFromGoogleMapsLink(googleHref);
      if (fromLink) return { lat: fromLink.latitude, lng: fromLink.longitude };
    }
  } catch (err) {
    console.warn('[auto-ask-otp] getJobLocationDisplay failed', err);
  }

  // Fallbacks matching dashboard distance calc
  const loc =
    job?.customer?.location ||
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

    const out = (await res.json().catch(() => null)) as {
      waiting?: boolean;
      armed?: boolean;
      remainingMs?: number;
      asked?: boolean;
      sent?: boolean;
      skipped?: boolean;
      reason?: string;
      error?: string;
      details?: string;
      dwellMs?: number;
      requestId?: string;
      nonce?: string;
    } | null;

    console.log('[auto-ask-otp]', near ? 'near' : 'check', jobId, res.status, out);

    if (!res.ok) {
      console.warn('[auto-ask-otp] server error', out?.error || out?.details || res.status);
      return;
    }

    // Arm native AlarmManager so Ask OTP still fires with the app closed.
    if (out?.waiting && typeof out.remainingMs === 'number' && out.remainingMs > 0) {
      void scheduleNativeAutoAskDwell({
        jobId,
        remainingMs: out.remainingMs,
        accessToken,
      });
    }

    if (
      out?.asked ||
      out?.reason === 'already_asked' ||
      out?.reason === 'otp_already_entered' ||
      out?.reason === 'otp_already_on_request'
    ) {
      void cancelNativeAutoAskDwell(jobId);
    }
  } catch (err) {
    console.warn('[auto-ask-otp] error', err);
  }
}

/**
 * Fresh GPS: if near an OTP job, arm the server clock (near:true).
 */
export function evaluateAutoAskOtpOnSite(opts: {
  technicianId: string;
  jobs: AutoAskOtpJobLike[];
  lat: number;
  lng: number;
  accuracyMeters?: number | null;
  /** Optional precomputed distances (km) from the dashboard — same as UI. */
  distancesKm?: Record<string, number>;
}): void {
  const { technicianId, jobs, lat, lng } = opts;
  if (!technicianId || !Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const accuracy = opts.accuracyMeters;
  const accuracyOk = !(
    typeof accuracy === 'number' &&
    Number.isFinite(accuracy) &&
    accuracy > MAX_ACCURACY_METERS
  );

  let otpJobCount = 0;
  let nearCount = 0;
  let noCoordCount = 0;

  for (const job of jobs) {
    if (!isActiveOtpJob(job)) continue;
    otpJobCount += 1;

    if (job.otp_onsite_detected_at) {
      void callServer(job.id, false);
    }

    let meters: number | null = null;

    if (typeof opts.distancesKm?.[job.id] === 'number') {
      meters = opts.distancesKm[job.id] * 1000;
    }

    if (meters == null) {
      if (!accuracyOk) {
        console.log('[auto-ask-otp] skip near-check — GPS accuracy coarse', accuracy);
        void callServer(job.id, false);
        continue;
      }
      const dest = getCustomerCoords(job);
      if (!dest) {
        noCoordCount += 1;
        console.log('[auto-ask-otp] no customer coords', job.id);
        void callServer(job.id, false);
        continue;
      }
      meters = haversineDistanceMeters({ lat, lng }, dest);
    }

    if (meters > NEAR_METERS) {
      console.log('[auto-ask-otp] not near', {
        jobId: job.id,
        meters: Math.round(meters),
        limit: NEAR_METERS,
      });
      void callServer(job.id, false);
      continue;
    }

    nearCount += 1;
    console.log('[auto-ask-otp] NEAR — arming server clock', {
      jobId: job.id,
      meters: Math.round(meters),
    });
    void callServer(job.id, true);
  }

  if (otpJobCount > 0) {
    console.log('[auto-ask-otp] evaluate summary', {
      otpJobs: otpJobCount,
      near: nearCount,
      noCoords: noCoordCount,
      tech: { lat, lng, accuracy },
    });
  }
}

/** Resume / interval: check server clock for every active OTP job. */
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
