/**
 * Google Distance Matrix, driving, avoid tolls. Server-side key only.
 * Browser/referrer-restricted VITE keys cannot call this web service.
 */

function trim(s) {
  return s && typeof s === 'string' ? s.trim() : '';
}

function getGoogleMapsServerKey() {
  return trim(process.env.GOOGLE_MAPS_API_KEY) || trim(process.env.VITE_GOOGLE_MAPS_API_KEY) || null;
}

const cache = new Map();
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const TRAFFIC_CACHE_TTL_MS = 20 * 60 * 1000;
let googleUnusableUntil = 0;
let loggedGoogleSkip = false;

function cacheKey(origin, dest, traffic) {
  const o = `${Number(origin.lat).toFixed(5)},${Number(origin.lng).toFixed(5)}`;
  const d = `${Number(dest.lat).toFixed(5)},${Number(dest.lng).toFixed(5)}`;
  return `${o}|${d}|driving|tolls|${traffic ? 'traffic' : 'base'}`;
}

function pruneCache() {
  if (cache.size <= 200) return;
  const now = Date.now();
  for (const [k, v] of cache.entries()) {
    if (now - v.at >= CACHE_TTL_MS) cache.delete(k);
  }
}

/**
 * @param {{ lat: number, lng: number }} origin
 * @param {{ lat: number, lng: number }} dest
 * @param {{ traffic?: boolean }} [opts]
 * @returns {Promise<{ meters: number, durationSec: number | null } | null>}
 */
async function drivingRouteAvoidTollsOnce(origin, dest, traffic) {
  const key = cacheKey(origin, dest, traffic);
  const hit = cache.get(key);
  const ttl = traffic ? TRAFFIC_CACHE_TTL_MS : CACHE_TTL_MS;
  if (hit && Date.now() - hit.at < ttl) {
    return { meters: hit.meters, durationSec: hit.durationSec ?? null };
  }

  if (Date.now() < googleUnusableUntil) return null;

  const apiKey = getGoogleMapsServerKey();
  if (!apiKey) return null;

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
    url.searchParams.set('origins', `${origin.lat},${origin.lng}`);
    url.searchParams.set('destinations', `${dest.lat},${dest.lng}`);
    url.searchParams.set('mode', 'driving');
    url.searchParams.set('avoid', 'tolls');
    url.searchParams.set('units', 'metric');
    if (traffic) url.searchParams.set('departure_time', 'now');
    url.searchParams.set('key', apiKey);

    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json();
    const status = data?.status;
    if (status && status !== 'OK') {
      const hardFail = status === 'REQUEST_DENIED' || status === 'OVER_QUERY_LIMIT';
      if (hardFail && !traffic) {
        googleUnusableUntil = Date.now() + CACHE_TTL_MS;
      }
      if (!loggedGoogleSkip) {
        loggedGoogleSkip = true;
        console.warn(
          '[tech-travel] Google Distance Matrix',
          status,
          data.error_message || '',
          traffic ? '(traffic retry may follow)' : '— avoid-tolls km needs GOOGLE_MAPS_API_KEY'
        );
      }
      return null;
    }
    const el = data?.rows?.[0]?.elements?.[0];
    const meters =
      el?.status === 'OK' && el.distance && Number.isFinite(el.distance.value)
        ? Number(el.distance.value)
        : null;
    if (meters == null) return null;
    const trafficSec = Number(el.duration_in_traffic?.value);
    const baseSec = Number(el.duration?.value);
    const durationSec = Number.isFinite(trafficSec)
      ? trafficSec
      : Number.isFinite(baseSec)
        ? baseSec
        : null;
    cache.set(key, { meters, durationSec, at: Date.now() });
    pruneCache();
    return { meters, durationSec };
  } catch (err) {
    console.warn('[tech-travel] Google Distance Matrix failed', err?.message || err);
    return null;
  }
}

async function drivingRouteAvoidTolls(origin, dest, opts = {}) {
  if (!origin || !dest) return null;
  const traffic = opts.traffic === true;
  const first = await drivingRouteAvoidTollsOnce(origin, dest, traffic);
  if (first) return first;
  if (traffic) return drivingRouteAvoidTollsOnce(origin, dest, false);
  return null;
}

/**
 * @param {{ lat: number, lng: number }} origin
 * @param {{ lat: number, lng: number }} dest
 * @returns {Promise<number | null>} meters, or null if Google cannot route
 */
async function drivingDistanceMetersAvoidTolls(origin, dest) {
  const route = await drivingRouteAvoidTolls(origin, dest, { traffic: false });
  return route ? route.meters : null;
}

module.exports = {
  getGoogleMapsServerKey,
  drivingDistanceMetersAvoidTolls,
  drivingRouteAvoidTolls,
};
