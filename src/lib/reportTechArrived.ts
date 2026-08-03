/**
 * Report technician GPS near a Start Job customer → one admin push (server once).
 * Independent of Auto Ask OTP dwell.
 */
import { resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';
import { haversineDistanceMeters } from '@/lib/googleMapsDistance';
import { getJobLocationDisplay } from '@/lib/customer-locations';
import { extractCoordinates } from '@/lib/maps';
import { extractCoordinatesFromGoogleMapsLink } from '@/lib/googleMapsLink';

const ENDPOINT = '/.netlify/functions/report-tech-arrived';
const NEAR_METERS = 600;
const MAX_ACCURACY_METERS = 800;
const ACTIVE_STATUSES = new Set(['EN_ROUTE', 'IN_PROGRESS']);

const lastCallAt = new Map<string, number>();
const MIN_CALL_GAP_MS = 5_000;
/** Jobs already claimed this session — avoid repeat POSTs before list refresh. */
const notifiedLocal = new Set<string>();

export type TechArrivedJobLike = {
  id: string;
  status?: string | null;
  customer?: unknown;
  serviceLocation?: unknown;
  service_location?: unknown;
  service_site?: string | null;
  serviceSite?: string | null;
  tech_arrived_at?: string | null;
};

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
    console.warn('[tech-arrived] getJobLocationDisplay failed', err);
  }

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

function isEligible(job: TechArrivedJobLike): boolean {
  if (!job?.id) return false;
  if (job.tech_arrived_at || notifiedLocal.has(job.id)) return false;
  const status = String(job.status || '').toUpperCase();
  return ACTIVE_STATUSES.has(status);
}

async function reportArrived(jobId: string): Promise<void> {
  const now = Date.now();
  const last = lastCallAt.get(jobId) || 0;
  if (now - last < MIN_CALL_GAP_MS) return;
  lastCallAt.set(jobId, now);

  try {
    const accessToken = await resolveSupabaseAccessTokenForApi();
    if (!accessToken) {
      console.warn('[tech-arrived] no session');
      return;
    }

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ jobId }),
      signal: AbortSignal.timeout(30_000),
      keepalive: true,
    });

    const out = (await res.json().catch(() => null)) as {
      notified?: boolean;
      skipped?: boolean;
      reason?: string;
      sent?: number;
    } | null;

    console.log('[tech-arrived]', jobId, res.status, out);

    if (out?.notified || out?.reason === 'already_notified') {
      notifiedLocal.add(jobId);
    }
  } catch (err) {
    console.warn('[tech-arrived] error', err);
  }
}

/**
 * Fresh GPS: if near an EN_ROUTE / IN_PROGRESS job, claim arrival + admin push once.
 */
export function evaluateTechArrivedOnSite(opts: {
  technicianId: string;
  jobs: TechArrivedJobLike[];
  lat: number;
  lng: number;
  accuracyMeters?: number | null;
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
  if (!accuracyOk) {
    console.log('[tech-arrived] skip — GPS accuracy coarse', accuracy);
    return;
  }

  for (const job of jobs) {
    if (!isEligible(job)) continue;

    let meters: number | null = null;
    if (typeof opts.distancesKm?.[job.id] === 'number') {
      meters = opts.distancesKm[job.id] * 1000;
    }
    if (meters == null) {
      const dest = getCustomerCoords(job);
      if (!dest) continue;
      meters = haversineDistanceMeters({ lat, lng }, dest);
    }

    if (meters > NEAR_METERS) continue;

    console.log('[tech-arrived] NEAR — reporting', {
      jobId: job.id,
      meters: Math.round(meters),
    });
    void reportArrived(job.id);
  }
}

/** Clear local skip when admin unassigns / reassigns (optional). */
export function clearTechArrivedLocal(jobId: string): void {
  if (!jobId) return;
  notifiedLocal.delete(jobId);
  lastCallAt.delete(jobId);
}
