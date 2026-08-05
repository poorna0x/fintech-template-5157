import { supabase } from '@/lib/supabase';
import { resolveUpiPaySiteOrigin } from '@/lib/upiPaymentAccounts';

export type CustomerTrackPhase =
  | 'invalid'
  | 'expired'
  | 'not_started'
  | 'en_route'
  | 'arrived'
  | 'working_away'
  | 'completed'
  | 'error';

export type CustomerTrackSnapshot = {
  ok: boolean;
  phase: CustomerTrackPhase;
  brand?: 'hydrogenro' | 'elevenro';
  jobStatus?: string;
  techName?: string;
  techPhone?: string;
  latitude?: number | null;
  longitude?: number | null;
  locationUpdatedAt?: string | null;
  fixTime?: string | null;
  locationSource?: string | null;
  distanceToCustomerM?: number | null;
  destLatitude?: number | null;
  destLongitude?: number | null;
};

const PROD_TRACK_ORIGINS: Record<'hydrogenro' | 'elevenro', string> = {
  hydrogenro: 'https://hydrogenro.com',
  elevenro: 'https://elevenro.com',
};

export function resolveJobTrackSiteOrigin(
  brand?: 'hydrogenro' | 'elevenro' | string | null
): string {
  const key = brand === 'elevenro' ? 'elevenro' : 'hydrogenro';
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (/elevenro/i.test(host)) return PROD_TRACK_ORIGINS.elevenro;
    if (/hydrogenro/i.test(host)) return PROD_TRACK_ORIGINS.hydrogenro;
  }
  return resolveUpiPaySiteOrigin(brand);
}

export function buildJobTrackHttpsLink(origin: string, code: string): string | null {
  const base = String(origin || '')
    .trim()
    .replace(/\/$/, '');
  const c = String(code || '')
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '');
  if (!base || c.length < 6) return null;
  return `${base}/track/${c}`;
}

const trackLinkCache = new Map<string, string>();

/** Admin only: mint or reuse short /track/{code} for a job. */
export async function createJobTrackShortLink(
  jobId: string,
  brand?: 'hydrogenro' | 'elevenro' | string | null
): Promise<string | null> {
  const id = String(jobId || '').trim();
  if (!id) return null;
  const cacheKey = `${id}|${brand === 'elevenro' ? 'elevenro' : 'hydrogenro'}`;
  const cached = trackLinkCache.get(cacheKey);
  if (cached) return cached;
  const resolvedBrand = brand === 'elevenro' ? 'elevenro' : 'hydrogenro';
  try {
    const { data, error } = await supabase.rpc('create_job_track_link', {
      p_job_id: id,
      p_brand: resolvedBrand,
    });
    if (error) {
      console.warn('[track] create_job_track_link failed', error.message);
      return null;
    }
    const code = typeof data === 'string' ? data.trim() : '';
    if (code.length < 6) return null;
    trackLinkCache.set(cacheKey, code);
    return code;
  } catch (e) {
    console.warn('[track] create_job_track_link error', e);
    return null;
  }
}

export async function buildJobTrackShareUrl(
  jobId: string,
  brand?: 'hydrogenro' | 'elevenro' | string | null
): Promise<string | null> {
  const code = await createJobTrackShortLink(jobId, brand);
  if (!code) return null;
  return buildJobTrackHttpsLink(resolveJobTrackSiteOrigin(brand), code);
}

/** Public: fetch live snapshot for customer track page (poll ~60s). */
export async function fetchCustomerTrackSnapshot(code: string): Promise<CustomerTrackSnapshot | null> {
  const c = String(code || '')
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '');
  if (c.length < 6 || c.length > 16) return { ok: false, phase: 'invalid' };
  try {
    const res = await fetch(`/.netlify/functions/customer-track-snapshot?code=${encodeURIComponent(c)}`);
    if (res.status === 404 || res.status === 410) {
      return { ok: false, phase: 'expired' };
    }
    if (!res.ok) {
      return { ok: false, phase: 'error' };
    }
    const body = (await res.json()) as CustomerTrackSnapshot;
    return body && typeof body === 'object' ? body : { ok: false, phase: 'error' };
  } catch {
    return { ok: false, phase: 'error' };
  }
}

export function agoLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export async function computeCustomerTrackEta(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  fixTimeIso?: string | null
): Promise<{ durationText?: string; estimatedArrival?: string } | null> {
  try {
    const { ensureGoogleMapsLoaded } = await import('@/lib/adminGoogleMapsDistance');
    const { formatTime12Hour } = await import('@/lib/adminRouteMeasureHelpers');
    await ensureGoogleMapsLoaded();
    const distanceMatrix = new (window as any).google.maps.DistanceMatrixService();
    return new Promise((resolve) => {
      distanceMatrix.getDistanceMatrix(
        {
          origins: [origin],
          destinations: [destination],
          travelMode: (window as any).google.maps.TravelMode.DRIVING,
          unitSystem: (window as any).google.maps.UnitSystem.METRIC,
        },
        (response: any, status: any) => {
          if (status !== (window as any).google.maps.DistanceMatrixStatus.OK || !response) {
            resolve(null);
            return;
          }
          const result = response.rows?.[0]?.elements?.[0];
          if (!result || result.status !== (window as any).google.maps.DistanceMatrixElementStatus.OK) {
            resolve(null);
            return;
          }
          const durationText = result.duration?.text || '';
          const durationValue = result.duration?.value ?? 0;
          let estimatedArrival: string | undefined;
          if (durationValue > 0) {
            const base = fixTimeIso ? new Date(fixTimeIso) : new Date();
            estimatedArrival = formatTime12Hour(new Date(base.getTime() + durationValue * 1000));
          }
          resolve({ durationText, estimatedArrival });
        }
      );
    });
  } catch {
    return null;
  }
}
