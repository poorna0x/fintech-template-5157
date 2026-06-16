export type LatLng = { lat: number; lng: number };

/** Approximate Bengaluru office (Seshadripuram) — manual fallback for distance from office. */
export const OFFICE_ORIGIN_LOCATION: LatLng = {
  lat: 12.991,
  lng: 77.5734,
};

const LOCATION_CACHE_KEY = 'admin_user_origin_location_v1';
const CACHE_MAX_AGE_MS = 30 * 60 * 1000;

export type LocationCaptureSource = 'cache' | 'browser' | 'google_ip' | 'office';

export type CaptureLocationResult =
  | { ok: true; location: LatLng; source: LocationCaptureSource }
  | { ok: false; error: string };

function isSecureContext(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.isSecureContext ||
    window.location.protocol === 'https:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  );
}

function readCachedLocation(): LatLng | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(LOCATION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { lat?: number; lng?: number; at?: number };
    if (!parsed.at || Date.now() - parsed.at > CACHE_MAX_AGE_MS) return null;
    if (!Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lng)) return null;
    return { lat: parsed.lat!, lng: parsed.lng! };
  } catch {
    return null;
  }
}

export function writeCachedUserLocation(loc: LatLng): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(
      LOCATION_CACHE_KEY,
      JSON.stringify({ lat: loc.lat, lng: loc.lng, at: Date.now() })
    );
  } catch {
    /* ignore quota */
  }
}

function browserGeolocation(options: PositionOptions): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      reject,
      options
    );
  });
}

async function tryBrowserLocation(): Promise<LatLng> {
  try {
    return await browserGeolocation({
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
    });
  } catch (first) {
    const err = first as GeolocationPositionError;
    if (err?.code === err?.PERMISSION_DENIED) throw first;
    return browserGeolocation({
      enableHighAccuracy: false,
      timeout: 20000,
      maximumAge: 300000,
    });
  }
}

/** Network/Wi‑Fi based location via Google Geolocation API (works on many desktops when GPS fails). */
async function tryGoogleNetworkLocation(): Promise<LatLng | null> {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `https://www.googleapis.com/geolocation/v1/geolocate?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ considerIp: true }),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { location?: { lat?: number; lng?: number } };
    const lat = data?.location?.lat;
    const lng = data?.location?.lng;
    if (typeof lat === 'number' && typeof lng === 'number') {
      return { lat, lng };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function geolocationErrorMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Location blocked for this site. Open site settings (lock icon) and set Location to Allow.';
    case error.POSITION_UNAVAILABLE:
      return 'Browser could not get GPS/Wi‑Fi location on this device.';
    case error.TIMEOUT:
      return 'Location request timed out.';
    default:
      return 'Failed to get your location.';
  }
}

/**
 * Best-effort location for admin distance: cache → browser GPS → Google network/IP.
 * Does not auto-pick office; use OFFICE_ORIGIN_LOCATION explicitly when needed.
 */
export async function captureUserLocation(opts?: {
  skipCache?: boolean;
}): Promise<CaptureLocationResult> {
  if (!isSecureContext()) {
    return { ok: false, error: 'Location requires HTTPS (or localhost).' };
  }

  if (!opts?.skipCache) {
    const cached = readCachedLocation();
    if (cached) return { ok: true, location: cached, source: 'cache' };
  }

  if (navigator.geolocation) {
    try {
      const loc = await tryBrowserLocation();
      writeCachedUserLocation(loc);
      return { ok: true, location: loc, source: 'browser' };
    } catch (e) {
      const geoErr = e as GeolocationPositionError;
      if (geoErr?.code === geoErr?.PERMISSION_DENIED) {
        return { ok: false, error: geolocationErrorMessage(geoErr) };
      }
      // POSITION_UNAVAILABLE / TIMEOUT — fall through to network location
    }
  }

  const networkLoc = await tryGoogleNetworkLocation();
  if (networkLoc) {
    writeCachedUserLocation(networkLoc);
    return { ok: true, location: networkLoc, source: 'google_ip' };
  }

  return {
    ok: false,
    error:
      'Could not get your location. Try "Use office location" or check that Geolocation API is enabled for your Google Maps key.',
  };
}
