/**
 * Google Distance Matrix, driving, avoid tolls. Server-side key only.
 * One origin × one destination per call (cheap, matches a single travel leg).
 */

function trim(s) {
  return s && typeof s === 'string' ? s.trim() : '';
}

function getGoogleMapsServerKey() {
  return trim(process.env.GOOGLE_MAPS_API_KEY) || trim(process.env.VITE_GOOGLE_MAPS_API_KEY) || null;
}

const cache = new Map();
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

function cacheKey(origin, dest) {
  const o = `${Number(origin.lat).toFixed(5)},${Number(origin.lng).toFixed(5)}`;
  const d = `${Number(dest.lat).toFixed(5)},${Number(dest.lng).toFixed(5)}`;
  return `${o}|${d}|driving|tolls`;
}

/**
 * @param {{ lat: number, lng: number }} origin
 * @param {{ lat: number, lng: number }} dest
 * @returns {Promise<number | null>} meters, or null if Google cannot route
 */
async function drivingDistanceMetersAvoidTolls(origin, dest) {
  if (!origin || !dest) return null;
  const key = cacheKey(origin, dest);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.meters;

  const apiKey = getGoogleMapsServerKey();
  if (!apiKey) return null;

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
  const el = data?.rows?.[0]?.elements?.[0];
  const meters = el?.status === 'OK' && el.distance && Number.isFinite(el.distance.value)
    ? Number(el.distance.value)
    : null;
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
