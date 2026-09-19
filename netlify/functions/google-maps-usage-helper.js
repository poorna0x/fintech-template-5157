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

const SKU_CATALOG = [
  {
    id: 'dynamic_maps',
    label: 'Dynamic Maps',
    hint: 'Each Maps JavaScript load (booking, hubs, spread, CRM pins)',
    freeCap: 10_000,
    usdPerThousand: 7,
    match: /maps-backend|maps\.googleapis\.com/i,
  },
  {
    id: 'places',
    label: 'Places',
    hint: 'Autocomplete and place details when searching an address',
    freeCap: 10_000,
    usdPerThousand: 2.83,
    match: /places/i,
  },
  {
    id: 'geocoding',
    label: 'Geocoding',
    hint: 'Pin → address and pasted Maps links',
    freeCap: 10_000,
    usdPerThousand: 5,
    match: /geocod/i,
  },
  {
    id: 'distance',
    label: 'Distance / Routes',
    hint: 'Travel km and avoid-tolls lookups',
    freeCap: 10_000,
    usdPerThousand: 5,
    match: /distance-matrix|routes\.googleapis/i,
  },
];

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

function skuForService(service) {
  const name = String(service || '');
  return SKU_CATALOG.find((row) => row.match.test(name)) || null;
}

function emptySkus() {
  return SKU_CATALOG.map((row) => ({
    id: row.id,
    label: row.label,
    hint: row.hint,
    freeCap: row.freeCap,
    usdPerThousand: row.usdPerThousand,
    requests: 0,
    billable: 0,
    estimatedUsd: 0,
  }));
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
  const skus = [...byId.values()].map((row) => {
    const billable = Math.max(0, row.requests - row.freeCap);
    return {
      ...row,
      billable,
      estimatedUsd: Math.round((billable / 1000) * row.usdPerThousand * 100) / 100,
    };
  });
  const estimatedUsd = Math.round(skus.reduce((sum, row) => sum + row.estimatedUsd, 0) * 100) / 100;
  const requests = skus.reduce((sum, row) => sum + row.requests, 0);
  return { skus, other, estimatedUsd, requests };
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
  const catalog = emptySkus();
  const bounds = istMonthBounds();
  const base = {
    ok: false,
    configured: Boolean(loaded.sa),
    credentialSource: loaded.source,
    projectId: loaded.sa?.projectId || null,
    monthKey: bounds.monthKey,
    skus: catalog,
    other: [],
    requests: 0,
    estimatedUsd: 0,
    consoleUrl: loaded.sa?.projectId ? `${CONSOLE_METRICS}?project=${encodeURIComponent(loaded.sa.projectId)}` : CONSOLE_METRICS,
    generatedAt: new Date().toISOString(),
  };

  if (!loaded.sa) {
    const payload = { ...base, error: loaded.error };
    cached = payload;
    cachedAt = Date.now();
    return payload;
  }

  try {
    const usage = await fetchMapsMonitoring(loaded.sa);
    const payload = {
      ...base,
      ok: true,
      monthKey: usage.monthKey,
      skus: usage.skus,
      other: usage.other,
      requests: usage.requests,
      estimatedUsd: usage.estimatedUsd,
      generatedAt: new Date().toISOString(),
    };
    cached = payload;
    cachedAt = Date.now();
    return payload;
  } catch (err) {
    const message = err && err.message ? String(err.message).slice(0, 280) : 'Cloud Monitoring failed';
    const payload = {
      ...base,
      ok: false,
      error:
        err.status === 403
          ? 'This service account cannot read Cloud Monitoring. Grant Monitoring Viewer on the Maps GCP project, or store that SA in app_secrets.google_cloud_monitoring.'
          : message,
    };
    cached = payload;
    cachedAt = Date.now();
    return payload;
  }
}

module.exports = {
  buildGoogleMapsUsagePayload,
  SKU_CATALOG,
  rollupSkus,
  emptySkus,
};
