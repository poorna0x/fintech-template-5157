/**
 * Server-only Google Maps key for Geocoding / Places / Distance Matrix REST APIs.
 *
 * Do NOT use VITE_GOOGLE_MAPS_API_KEY here — that key is HTTP-referrer restricted for
 * the browser Maps JS API and returns REQUEST_DENIED on server web-service calls.
 *
 * Sources (first match wins):
 *   1. GOOGLE_MAPS_API_KEY env (local .env.local / Netlify)
 *   2. app_secrets.google_maps_api_key (plain string; production without Netlify env bloat)
 *
 * Create the key in Google Cloud → Credentials → API key:
 *   Application restrictions: None (or IP if you pin Netlify egress — usually None for Lambdas)
 *   API restrictions: Geocoding API, Places API, Distance Matrix API (as needed)
 */

const { createClient } = require('@supabase/supabase-js');

const APP_SECRET_KEY = 'google_maps_api_key';
const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedKey = undefined;
let cachedAt = 0;

function trim(s) {
  return s && typeof s === 'string' ? s.trim() : '';
}

function getServiceSupabase() {
  const url = trim(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL);
  const serviceKey = trim(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getKeyFromEnv() {
  return trim(process.env.GOOGLE_MAPS_API_KEY) || null;
}

async function readKeyFromAppSecrets() {
  const db = getServiceSupabase();
  if (!db) return null;
  try {
    const { data, error } = await db
      .from('app_secrets')
      .select('value')
      .eq('key', APP_SECRET_KEY)
      .maybeSingle();
    if (error || !data?.value) return null;
    const value = trim(String(data.value));
    return value || null;
  } catch {
    return null;
  }
}

/**
 * Sync env-only lookup (hot paths that cannot await). Prefer getGoogleMapsServerKey().
 */
function getGoogleMapsServerKeySync() {
  return getKeyFromEnv();
}

/**
 * Resolve server Maps key (env, then app_secrets). Never returns the browser VITE key.
 */
async function getGoogleMapsServerKey() {
  const now = Date.now();
  if (cachedKey !== undefined && now - cachedAt < CACHE_TTL_MS) {
    return cachedKey;
  }

  const fromEnv = getKeyFromEnv();
  if (fromEnv) {
    cachedKey = fromEnv;
    cachedAt = now;
    return fromEnv;
  }

  const fromSecret = await readKeyFromAppSecrets();
  cachedKey = fromSecret;
  cachedAt = now;
  return fromSecret;
}

/** Clear cache after setting a new secret (tests / admin tools). */
function clearGoogleMapsServerKeyCache() {
  cachedKey = undefined;
  cachedAt = 0;
}

module.exports = {
  APP_SECRET_KEY,
  getGoogleMapsServerKey,
  getGoogleMapsServerKeySync,
  clearGoogleMapsServerKeyCache,
};
