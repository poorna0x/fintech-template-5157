/**
 * Driving distance for one origin × one destination.
 * Prefer Google Distance Matrix (avoid=tolls). Fall back to OSRM if the
 * Maps key is browser/referrer-restricted (typical VITE_GOOGLE_MAPS_API_KEY).
 */

function trim(s) {
  return s && typeof s === 'string' ? s.trim() : '';
}

function getGoogleMapsServerKey() {
  return trim(process.env.GOOGLE_MAPS_API_KEY) || trim(process.env.VITE_GOOGLE_MAPS_API_KEY) || null;
}

const cache = new Map();
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
let googleUnusableUntil = 0;
let loggedGoogleSkip = false;

function cacheKey(origin, dest) {
  const o = `${Number(origin.lat).toFixed(5)},${Number(origin.lng).toFixed(5)}`;
  const d = `${Number(dest.lat).toFixed(5)},${Number(dest.lng).toFixed(5)}`;
  return `${o}|${d}|driving|tolls`;
}

async function googleDistanceMetersAvoidTolls(origin, dest, apiKey) {
  const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
  url.searchParams.set('origins', `${origin.lat},${origin.lng}`);
  url.searchParams.set('destinations', `${dest.lat},${dest.lng}`);
  url.searchParams.set('mode', 'driving');
  url.searchParams.set('avoid', 'tolls');
  url.searchParams.set('units', 'metric');
  url.searchParams.set('key', apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const data = await res.json();
  const status = data?.status;
  if (status && status !== 'OK') {
    if (status === 'REQUEST_DENIED' || status === 'OVER_QUERY_LIMIT') {
      googleUnusableUntil = Date.now() + CACHE_TTL_MS;
    }
    if (!loggedGoogleSkip) {
      loggedGoogleSkip = true;
      console.warn(
        '[tech-travel] Google Distance Matrix',
        status,
        data.error_message || '',
        '— using road fallback'
      );
    }
    return null;
  }
  const el = data?.rows?.[0]?.elements?.[0];
  if (el?.status === 'OK' && el.distance && Number.isFinite(el.distance.value)) {
    return Number(el.distance.value);
  }
  return null;
}

async function osrmDrivingMeters(origin, dest) {
  const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=false`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'HydrogenRO-CRM/tech-travel' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const meters = data?.routes?.[0]?.distance;
  return Number.isFinite(meters) && meters >= 0 ? Number(meters) : null;
}

/**
 * @param {{ lat: number, lng: number }} origin
 * @param {{ lat: number, lng: number }} dest
 * @returns {Promise<number | null>} meters, or null if no route
 */
async function drivingDistanceMetersAvoidTolls(origin, dest) {
  if (!origin || !dest) return null;
  const key = cacheKey(origin, dest);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.meters;

  let meters = null;
  const apiKey = getGoogleMapsServerKey();
  if (apiKey && Date.now() >= googleUnusableUntil) {
    try {
      meters = await googleDistanceMetersAvoidTolls(origin, dest, apiKey);
    } catch (err) {
      console.warn('[tech-travel] Google Distance Matrix failed', err?.message || err);
    }
  }
  if (meters == null) {
    try {
      meters = await osrmDrivingMeters(origin, dest);
    } catch (err) {
      console.warn('[tech-travel] OSRM fallback failed', err?.message || err);
    }
  }

  if (meters != null) cache.set(key, { meters, at: Date.now() });
  if (cache.size > 200) {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (now - v.at >= CACHE_TTL_MS) cache.delete(k);
    }
  }
  return meters;
}

module.exports = {
  getGoogleMapsServerKey,
  drivingDistanceMetersAvoidTolls,
};
