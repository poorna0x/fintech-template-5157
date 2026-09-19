/**
 * Google Maps Platform usage for Settings → Storage.
 * Reads Cloud Monitoring (Consumed API request count) for the IST calendar month.
 *
 * Credentials (never client-exposed):
 *   app_secrets.google_cloud_monitoring = Firebase-style service account JSON
 *     { "project_id", "client_email", "private_key" }
 *     IAM: roles/monitoring.viewer on the Maps GCP project
 *   Fallback: app_secrets.firebase_service_account (same project, if it has Monitoring read)
 *
 * Maps API key alone cannot query usage.
 */

const crypto = require('crypto');
const { getServiceSupabase } = require('./whatsapp-helper');

const CACHE_TTL_MS = 10 * 60 * 1000;
const SCOPE = 'https://www.googleapis.com/auth/monitoring.read';
const CONSOLE_METRICS = 'https://console.cloud.google.com/google/maps-apis/metrics';
const COUNTERS_SECRET = 'google_maps_usage_counters';

const SKU_ALIASES = {
  places: 'places_details',
  distance: 'distance_matrix',
};

const SKU_CATALOG = [
  {
    id: 'dynamic_maps',
    label: 'Maps JavaScript',
    hint: 'Map shown on booking, hubs, spread, technician location, add/edit customer',
    freeCap: 10_000,
    usdPerThousand: 7,
    match: /maps-backend|maps\.googleapis\.com/i,
  },
  {
    id: 'places_autocomplete',
    label: 'Places Autocomplete',
    hint: 'Address search as you type (website booking, hubs, add customer)',
    freeCap: 10_000,
    usdPerThousand: 2.83,
    match: /places-backend/i,
  },
  {
    id: 'places_details',
    label: 'Places Details',
    hint: 'Picking a suggested address (Place Details / Autocomplete getPlace)',
    freeCap: 10_000,
    usdPerThousand: 2.83,
    match: /places\.googleapis\.com/i,
  },
  {
    id: 'places_find',
    label: 'Find Place',
    hint: 'Pasted Google Maps links and WhatsApp place names',
    freeCap: 10_000,
    usdPerThousand: 5,
    match: /findplace|place\.find/i,
  },
  {
    id: 'geocoding',
    label: 'Geocoding',
    hint: 'GPS → address, pin reverse-geocode, Maps link coordinates',
    freeCap: 10_000,
    usdPerThousand: 5,
    match: /geocod/i,
  },
  {
    id: 'distance_matrix',
    label: 'Distance Matrix',
    hint: 'Travel km, avoid-tolls, assign-job distance, visit order',
    freeCap: 10_000,
    usdPerThousand: 5,
    match: /distance-matrix|routes\.googleapis/i,
  },
];

function canonicalSku(id) {
  const raw = String(id || '').trim();
  return SKU_ALIASES[raw] || raw;
}

let cached = null;
let cachedAt = 0;

function trim(s) {
  return s && typeof s === 'string' ? s.trim() : '';
}

function parseSa(raw) {
  if (!raw) return null;
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object') return null;
  const projectId = trim(obj.project_id || obj.projectId);
  const clientEmail = trim(obj.client_email || obj.clientEmail);
  let privateKey = trim(obj.private_key || obj.privateKey);
  if (privateKey.includes('\\n')) privateKey = privateKey.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

async function loadServiceAccount() {
  const fromEnv = parseSa(process.env.GOOGLE_CLOUD_MONITORING_SA || process.env.GCP_MONITORING_SA);
  if (fromEnv) return { sa: fromEnv, source: 'env' };

  const db = getServiceSupabase();
  if (!db) return { sa: null, source: null, error: 'Supabase service role is not configured' };

  const dedicated = await db.from('app_secrets').select('value').eq('key', 'google_cloud_monitoring').maybeSingle();
  const dedicatedSa = parseSa(dedicated.data?.value);
  if (dedicatedSa) return { sa: dedicatedSa, source: 'google_cloud_monitoring' };

  const firebase = await db.from('app_secrets').select('value').eq('key', 'firebase_service_account').maybeSingle();
  const firebaseSa = parseSa(firebase.data?.value);
  if (firebaseSa) return { sa: firebaseSa, source: 'firebase_service_account' };

  return {
    sa: null,
    source: null,
    error:
      'Add app_secrets.google_cloud_monitoring (service account JSON with Monitoring Viewer) for the Maps GCP project',
  };
}

function toBase64Url(obj) {
  return Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function googleAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url({ alg: 'RS256', typ: 'JWT' });
  const claim = toBase64Url({
    iss: sa.clientEmail,
    scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  });
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const jwt = `${header}.${claim}.${signer.sign(sa.privateKey, 'base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `Google auth ${res.status}`);
  }
  return String(data.access_token);
}

function istMonthBounds() {
  const now = new Date();
  const istMs = now.getTime() + 5.5 * 60 * 60 * 1000;
  const ist = new Date(istMs);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const startUtc = Date.UTC(y, m, 1, 0, 0, 0) - 5.5 * 60 * 60 * 1000;
  return {
    start: new Date(startUtc).toISOString(),
    end: now.toISOString(),
    monthKey: `${y}-${String(m + 1).padStart(2, '0')}`,
  };
}

function foldTracked(bySku) {
  const out = {};
  for (const [key, value] of Object.entries(bySku || {})) {
    const id = canonicalSku(key);
    if (!SKU_CATALOG.some((row) => row.id === id)) continue;
    out[id] = (Number(out[id]) || 0) + Math.max(0, Number(value) || 0);
  }
  return out;
}

function parseCountsObject(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const id = canonicalSku(key);
    if (!SKU_CATALOG.some((row) => row.id === id)) continue;
    const n = Math.min(40, Math.max(0, Math.floor(Number(value) || 0)));
    if (n > 0) out[id] = (out[id] || 0) + n;
  }
  return out;
}

function skuForService(service) {
  const name = String(service || '');
  return SKU_CATALOG.find((row) => row.match.test(name)) || null;
}

function withFreeLimit(row) {
  const requests = Math.max(0, Number(row.requests) || 0);
  const freeCap = Math.max(0, Number(row.freeCap) || 0);
  const billable = Math.max(0, requests - freeCap);
  return {
    ...row,
    requests,
    remaining: Math.max(0, freeCap - requests),
    usedPercent: freeCap ? Math.min(100, Math.round((requests / freeCap) * 1000) / 10) : 0,
    insideFree: requests <= freeCap,
    billable,
    estimatedUsd: Math.round((billable / 1000) * (Number(row.usdPerThousand) || 0) * 100) / 100,
  };
}

function emptySkus() {
  return SKU_CATALOG.map((row) =>
    withFreeLimit({
      id: row.id,
      label: row.label,
      hint: row.hint,
      freeCap: row.freeCap,
      usdPerThousand: row.usdPerThousand,
      requests: 0,
      trackedRequests: 0,
      googleRequests: 0,
    })
  );
}

function rollupSkus(series) {
  const byId = new Map(emptySkus().map((row) => [row.id, { ...row }]));
  const other = [];
  for (const item of series) {
    const service = item.service;
    const requests = item.requests;
    const sku = skuForService(service);
    if (sku) {
      const row = byId.get(sku.id);
      row.requests += requests;
    } else if (requests > 0) {
      other.push({ service, requests });
    }
  }
  const skus = [...byId.values()].map((row) => withFreeLimit(row));
  const estimatedUsd = Math.round(skus.reduce((sum, row) => sum + row.estimatedUsd, 0) * 100) / 100;
  const requests = skus.reduce((sum, row) => sum + row.requests, 0);
  return { skus, other, estimatedUsd, requests };
}

function mergeTrackedAndGoogle(trackedBySku, googleSkus) {
  const folded = foldTracked(trackedBySku);
  const googleById = new Map((googleSkus || []).map((row) => [row.id, row]));
  const skus = emptySkus().map((row) => {
    const tracked = Math.max(0, Number(folded[row.id]) || 0);
    const google = Math.max(0, Number(googleById.get(row.id)?.requests) || 0);
    return withFreeLimit({
      ...row,
      requests: Math.max(tracked, google),
      trackedRequests: tracked,
      googleRequests: google,
    });
  });
  const estimatedUsd = Math.round(skus.reduce((sum, row) => sum + row.estimatedUsd, 0) * 100) / 100;
  const requests = skus.reduce((sum, row) => sum + row.requests, 0);
  const insideFree = skus.every((row) => row.insideFree);
  return { skus, estimatedUsd, requests, insideFree };
}

function seriesRequests(series) {
  let total = 0;
  for (const point of series.points || []) {
    const v = point.value || {};
    const n = Number(v.int64Value ?? v.doubleValue ?? 0);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

async function listTimeSeries(projectId, token, filter, start, end) {
  const out = [];
  let pageToken = '';
  for (let i = 0; i < 8; i += 1) {
    const url = new URL(`https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(projectId)}/timeSeries`);
    url.searchParams.set('filter', filter);
    url.searchParams.set('interval.startTime', start);
    url.searchParams.set('interval.endTime', end);
    url.searchParams.set('aggregation.alignmentPeriod', '86400s');
    url.searchParams.set('aggregation.perSeriesAligner', 'ALIGN_SUM');
    url.searchParams.set('aggregation.crossSeriesReducer', 'REDUCE_SUM');
    url.searchParams.append('aggregation.groupByFields', 'resource.labels.service');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error?.message || data.error || `Monitoring ${res.status}`;
      const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
      err.status = res.status;
      throw err;
    }
    for (const series of data.timeSeries || []) {
      const service = series.resource?.labels?.service || series.metric?.labels?.service || 'unknown';
      out.push({ service, requests: seriesRequests(series) });
    }
    pageToken = data.nextPageToken || '';
    if (!pageToken) break;
  }
  return out;
}

async function loadSecretCounters(db, monthKey) {
  const { data } = await db.from('app_secrets').select('value').eq('key', COUNTERS_SECRET).maybeSingle();
  if (!data?.value) return {};
  try {
    const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    return foldTracked(parsed?.[monthKey] || {});
  } catch {
    return {};
  }
}

async function writeSecretCounters(db, monthKey, monthCounts) {
  const { data } = await db.from('app_secrets').select('value').eq('key', COUNTERS_SECRET).maybeSingle();
  let all = {};
  try {
    all = typeof data?.value === 'string' ? JSON.parse(data.value) : data?.value || {};
  } catch {
    all = {};
  }
  if (!all || typeof all !== 'object' || Array.isArray(all)) all = {};
  all[monthKey] = foldTracked({ ...(all[monthKey] || {}), ...monthCounts });
  const keys = Object.keys(all).sort();
  while (keys.length > 4) {
    delete all[keys.shift()];
  }
  await db.from('app_secrets').upsert({ key: COUNTERS_SECRET, value: JSON.stringify(all) }, { onConflict: 'key' });
}

async function loadTrackedUsage() {
  const db = getServiceSupabase();
  if (!db) return { available: false, bySku: {}, error: 'Supabase service role is not configured' };
  const monthKey = istMonthBounds().monthKey;
  const secretCounts = await loadSecretCounters(db, monthKey).catch(() => ({}));

  const { data, error } = await db
    .from('google_maps_usage_counters')
    .select('sku, requests')
    .eq('month_key', monthKey);

  const tableCounts = {};
  if (!error) {
    for (const row of data || []) {
      if (row && row.sku) tableCounts[row.sku] = Math.max(0, Number(row.requests) || 0);
    }
  }

  const bySku = foldTracked({ ...secretCounts });
  for (const [id, n] of Object.entries(foldTracked(tableCounts))) {
    bySku[id] = Math.max(Number(bySku[id]) || 0, n);
  }

  return {
    available: true,
    bySku,
    tableOk: !error,
  };
}

async function incrementGoogleMapsUsageCounts(rawCounts) {
  const counts = parseCountsObject(rawCounts);
  if (!Object.keys(counts).length) return { ok: true, incremented: 0 };
  const db = getServiceSupabase();
  if (!db) return { ok: false };
  cached = null;
  cachedAt = 0;
  const { error } = await db.rpc('increment_google_maps_usage', { p_counts: counts });
  if (error) {
    const monthKey = istMonthBounds().monthKey;
    const current = await loadSecretCounters(db, monthKey).catch(() => ({}));
    const next = { ...current };
    for (const [id, n] of Object.entries(counts)) {
      next[id] = (Number(next[id]) || 0) + n;
    }
    await writeSecretCounters(db, monthKey, next);
  }
  return { ok: true, incremented: Object.values(counts).reduce((s, n) => s + n, 0) };
}

async function recordGoogleMapsUsage(sku, count = 1) {
  const id = canonicalSku(sku);
  const n = Math.min(50, Math.max(1, Math.floor(Number(count) || 1)));
  if (!SKU_CATALOG.some((row) => row.id === id)) return;
  await incrementGoogleMapsUsageCounts({ [id]: n });
}

async function fetchMapsMonitoring(sa) {
  const token = await googleAccessToken(sa);
  const { start, end, monthKey } = istMonthBounds();
  const services = [
    'maps-backend.googleapis.com',
    'maps.googleapis.com',
    'places-backend.googleapis.com',
    'places.googleapis.com',
    'geocoding-backend.googleapis.com',
    'geocoding.googleapis.com',
    'distance-matrix-backend.googleapis.com',
    'routes.googleapis.com',
  ];
  const filter = `metric.type="serviceruntime.googleapis.com/api/request_count" AND resource.type="consumed_api" AND (${services
    .map((s) => `resource.labels.service="${s}"`)
    .join(' OR ')})`;
  const series = await listTimeSeries(sa.projectId, token, filter, start, end);
  return { ...rollupSkus(series), monthKey, start, end };
}

async function buildGoogleMapsUsagePayload(force = false) {
  if (!force && cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;

  const loaded = await loadServiceAccount();
  const tracked = await loadTrackedUsage();
  const bounds = istMonthBounds();
  const catalog = emptySkus();
  const base = {
    ok: false,
    configured: Boolean(loaded.sa) || tracked.available,
    trackingAvailable: tracked.available,
    credentialSource: loaded.source,
    projectId: loaded.sa?.projectId || null,
    monthKey: bounds.monthKey,
    skus: catalog,
    other: [],
    requests: 0,
    estimatedUsd: 0,
    insideFree: true,
    consoleUrl: loaded.sa?.projectId ? `${CONSOLE_METRICS}?project=${encodeURIComponent(loaded.sa.projectId)}` : CONSOLE_METRICS,
    generatedAt: new Date().toISOString(),
  };

  let googleSkus = [];
  let googleOther = [];
  let googleError = null;
  if (loaded.sa) {
    try {
      const usage = await fetchMapsMonitoring(loaded.sa);
      googleSkus = usage.skus || [];
      googleOther = usage.other || [];
    } catch (err) {
      googleError =
        err.status === 403
          ? 'Google Cloud Monitoring is optional. This card counts Maps calls from the CRM.'
          : String(err && err.message ? err.message : 'Cloud Monitoring failed').slice(0, 280);
    }
  }

  const merged = mergeTrackedAndGoogle(tracked.bySku, googleSkus);
  const payload = {
    ...base,
    ok: true,
    configured: true,
    trackingAvailable: tracked.available,
    skus: merged.skus,
    other: googleOther,
    requests: merged.requests,
    estimatedUsd: merged.estimatedUsd,
    insideFree: merged.insideFree,
    error: undefined,
    note: googleError || undefined,
    generatedAt: new Date().toISOString(),
  };

  cached = payload;
  cachedAt = Date.now();
  return payload;
}

module.exports = {
  buildGoogleMapsUsagePayload,
  recordGoogleMapsUsage,
  incrementGoogleMapsUsageCounts,
  SKU_CATALOG,
  rollupSkus,
  emptySkus,
  withFreeLimit,
  mergeTrackedAndGoogle,
  canonicalSku,
};
