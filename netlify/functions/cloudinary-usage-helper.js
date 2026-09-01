/**
 * Cloudinary Admin API helpers for account usage (server-only).
 * Credentials: app_secrets.cloudinary (production) or CLOUDINARY_* env (local). Never VITE_*.
 */

const { resolveCloudinaryAdminAccounts, getCloudinaryAdminAccountsFromEnv } = require('./cloudinary-secrets');

const CACHE_MS = 30 * 60 * 1000;
const HISTORY_CACHE_MS = 60 * 60 * 1000;
const MIN_REFRESH_MS = 60 * 1000;
const FOLDER_PAGE_CAP = 4;
const SEARCH_MAX = 12;
const HISTORY_DAYS = 7;

const cache = new Map();

function getCloudinaryAdminAccounts() {
  return getCloudinaryAdminAccountsFromEnv();
}

function publicAccountMeta(account) {
  return { id: account.id, label: account.label, cloudName: account.cloudName };
}

function basicAuthHeader(account) {
  return `Basic ${Buffer.from(`${account.apiKey}:${account.apiSecret}`).toString('base64')}`;
}

function cacheGet(key) {
  const row = cache.get(key);
  if (!row) return null;
  if (Date.now() > row.expiresAt) {
    cache.delete(key);
    return null;
  }
  return row;
}

function cacheSet(key, value, ttlMs) {
  cache.set(key, { value, fetchedAt: Date.now(), expiresAt: Date.now() + ttlMs });
}

function cacheAgeMs(key) {
  const row = cache.get(key);
  if (!row) return null;
  return Date.now() - row.fetchedAt;
}

function clearUsageCache() {
  cache.clear();
}

function asFinite(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
}

/** Cloudinary Free plan: 25 credits/month. 1 credit = 1 GB storage or 1 GB bandwidth or 1,000 transformations. */
const FREE_PLAN_CREDITS = 25;
const BYTES_PER_CREDIT = 1_000_000_000;
const TRANSFORMS_PER_CREDIT = 1000;

function fillQuota(meter, limit, quotaSource) {
  if (!meter || meter.usage == null || !(limit > 0)) return meter;
  if (meter.limit != null) {
    return { ...meter, quotaSource: meter.quotaSource || 'api' };
  }
  const usedPercent = (meter.usage / limit) * 100;
  return {
    ...meter,
    limit,
    remaining: Math.max(0, limit - meter.usage),
    usedPercent,
    quotaSource,
  };
}

function applyFreePlanQuotas(plan, meters) {
  if (!meters || !plan || String(plan).trim().toLowerCase() !== 'free') return meters;
  const creditLimit =
    meters.credits && meters.credits.limit != null && meters.credits.limit > 0
      ? meters.credits.limit
      : FREE_PLAN_CREDITS;
  return {
    ...meters,
    storage: fillQuota(meters.storage, creditLimit * BYTES_PER_CREDIT, 'free_plan'),
    bandwidth: fillQuota(meters.bandwidth, creditLimit * BYTES_PER_CREDIT, 'free_plan'),
    transformations: fillQuota(meters.transformations, creditLimit * TRANSFORMS_PER_CREDIT, 'free_plan'),
    credits: fillQuota(meters.credits, creditLimit, meters.credits && meters.credits.limit != null ? 'api' : 'free_plan'),
  };
}

/**
 * Normalize a Cloudinary usage meter. Missing limit/percent stays null until Free-plan fill-in.
 */
function parseMeter(raw) {
  if (raw == null) {
    return { available: false, usage: null, limit: null, usedPercent: null, remaining: null, creditsUsage: null };
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return {
      available: true,
      usage: raw,
      limit: null,
      usedPercent: null,
      remaining: null,
      creditsUsage: null,
    };
  }
  if (typeof raw !== 'object') {
    return { available: false, usage: null, limit: null, usedPercent: null, remaining: null, creditsUsage: null };
  }
  const usage = asFinite(raw.usage);
  const limit = asFinite(raw.limit);
  const usedPercent = asFinite(raw.used_percent);
  const creditsUsage = asFinite(raw.credits_usage);
  const remaining = usage != null && limit != null ? Math.max(0, limit - usage) : null;
  return {
    available: usage != null || limit != null || usedPercent != null,
    usage,
    limit,
    usedPercent,
    remaining,
    creditsUsage,
    breakdown: raw.breakdown && typeof raw.breakdown === 'object' ? raw.breakdown : null,
  };
}

function parseUsageReport(json) {
  if (!json || typeof json !== 'object') return null;
  const meters = {
    storage: parseMeter(json.storage),
    bandwidth: parseMeter(json.bandwidth),
    transformations: parseMeter(json.transformations),
    objects: parseMeter(json.objects),
    credits: parseMeter(json.credits),
    impressions: parseMeter(json.impressions),
    secondsDelivered: parseMeter(json.seconds_delivered),
    requests: parseMeter(typeof json.requests === 'number' ? json.requests : json.requests),
  };

  const addons = [];
  const skip = new Set([
    'plan',
    'last_updated',
    'date_requested',
    'transformations',
    'objects',
    'bandwidth',
    'storage',
    'credits',
    'impressions',
    'seconds_delivered',
    'requests',
    'resources',
    'derived_resources',
    'media_limits',
    'rate_limit_allowed',
    'rate_limit_reset_at',
    'rate_limit_remaining',
  ]);
  for (const [key, val] of Object.entries(json)) {
    if (skip.has(key)) continue;
    if (val && typeof val === 'object' && ('usage' in val || 'limit' in val)) {
      addons.push({ key, ...parseMeter(val) });
    }
  }

  const parsed = {
    plan: typeof json.plan === 'string' ? json.plan : null,
    cloudinaryLastUpdated: typeof json.last_updated === 'string' ? json.last_updated : null,
    dateRequested: typeof json.date_requested === 'string' ? json.date_requested : null,
    resources: asFinite(json.resources),
    derivedResources: asFinite(json.derived_resources),
    mediaLimits: json.media_limits && typeof json.media_limits === 'object' ? json.media_limits : null,
    meters,
    addons,
  };
  parsed.meters = applyFreePlanQuotas(parsed.plan, parsed.meters);
  return parsed;
}

function mapSearchResource(row, cloudName) {
  if (!row || typeof row !== 'object') return null;
  const publicId = String(row.public_id || '').trim();
  if (!publicId) return null;
  const folderFromId = publicId.includes('/') ? publicId.slice(0, publicId.lastIndexOf('/')) : '';
  const resourceType = String(row.resource_type || 'image') || 'image';
  const deliveryType = String(row.type || 'upload') || 'upload';
  const format = String(row.format || '');
  const fromApi = String(row.secure_url || row.url || '').trim();
  const built =
    cloudName && publicId
      ? `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/${resourceType}/${deliveryType}/${publicId}${
          format ? `.${format}` : ''
        }`
      : '';
  const previewUrl = fromApi.startsWith('https://') ? fromApi : built;
  return {
    publicId,
    filename: String(row.filename || publicId.split('/').pop() || publicId),
    resourceType,
    format,
    bytes: asFinite(row.bytes),
    folder: String(row.asset_folder || row.folder || folderFromId || ''),
    createdAt: typeof row.created_at === 'string' ? row.created_at : null,
    previewUrl: previewUrl || null,
  };
}

function jsonSafeError(err) {
  const msg = err && err.message ? String(err.message) : 'Cloudinary request failed';
  return msg.replace(/Basic [A-Za-z0-9+/=]+/g, 'Basic [redacted]').slice(0, 240);
}

async function cloudinaryRequest(account, method, path, body, fetchImpl) {
  const fetchFn = fetchImpl || fetch;
  const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(account.cloudName)}${path}`;
  const headers = {
    Authorization: basicAuthHeader(account),
    Accept: 'application/json',
  };
  const opts = { method, headers };
  if (body) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetchFn(url, opts);
  const rate = {
    limit: asFinite(res.headers.get('x-featureratelimit-limit') || res.headers.get('X-FeatureRateLimit-Limit')),
    remaining: asFinite(
      res.headers.get('x-featureratelimit-remaining') || res.headers.get('X-FeatureRateLimit-Remaining')
    ),
    resetAt: res.headers.get('x-featureratelimit-reset') || res.headers.get('X-FeatureRateLimit-Reset') || null,
  };
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (res.status === 429) {
    const err = new Error('Cloudinary Admin API rate limit');
    err.statusCode = 429;
    err.rate = rate;
    throw err;
  }
  if (!res.ok) {
    const err = new Error(
      (json && (json.error?.message || json.message)) || `Cloudinary HTTP ${res.status}`
    );
    err.statusCode = res.status;
    err.rate = rate;
    throw err;
  }
  return { json, rate, status: res.status };
}

async function fetchUsageReport(account, date, fetchImpl) {
  const path = date ? `/usage/${date}` : '/usage';
  const { json, rate } = await cloudinaryRequest(account, 'GET', path, null, fetchImpl);
  return { report: parseUsageReport(json), rate, rawOk: Boolean(json) };
}

async function fetchResourceTypeCounts(account, fetchImpl) {
  const types = ['image', 'video', 'raw'];
  const counts = { image: null, video: null, raw: null };
  const errors = {};
  await Promise.all(
    types.map(async (type) => {
      try {
        const { json } = await cloudinaryRequest(
          account,
          'POST',
          '/resources/search',
          { expression: `resource_type:${type}`, max_results: 1 },
          fetchImpl
        );
        counts[type] = asFinite(json && json.total_count);
      } catch (err) {
        errors[type] = jsonSafeError(err);
        counts[type] = null;
      }
    })
  );
  const known = [counts.image, counts.video, counts.raw].filter((n) => n != null);
  const total = known.length ? known.reduce((a, b) => a + b, 0) : null;
  return { counts, total, errors };
}

async function fetchFolderSummary(account, fetchImpl) {
  const names = [];
  let cursor = null;
  let pages = 0;
  let truncated = false;
  try {
    do {
      pages += 1;
      const q = cursor ? `?next_cursor=${encodeURIComponent(cursor)}` : '';
      const { json } = await cloudinaryRequest(account, 'GET', `/folders${q}`, null, fetchImpl);
      const list = Array.isArray(json && json.folders) ? json.folders : [];
      for (const f of list) {
        const name = String((f && (f.path || f.name)) || '').trim();
        if (name) names.push(name);
      }
      cursor = json && json.next_cursor ? String(json.next_cursor) : null;
    } while (cursor && pages < FOLDER_PAGE_CAP);
    if (cursor) truncated = true;
    return {
      available: true,
      count: names.length,
      names: names.slice(0, 80),
      truncated,
      sizeByFolder: {
        available: false,
        reason: 'Not available through Cloudinary API',
      },
    };
  } catch (err) {
    return {
      available: false,
      count: null,
      names: [],
      truncated: false,
      error: jsonSafeError(err),
      sizeByFolder: {
        available: false,
        reason: 'Not available through Cloudinary API',
      },
    };
  }
}

async function fetchSearchList(account, sortField, fetchImpl) {
  try {
    const { json } = await cloudinaryRequest(
      account,
      'POST',
      '/resources/search',
      {
        expression: 'resource_type:(image OR video OR raw)',
        sort_by: [{ [sortField]: 'desc' }],
        max_results: SEARCH_MAX,
      },
      fetchImpl
    );
    const resources = Array.isArray(json && json.resources) ? json.resources : [];
    return {
      available: true,
      totalCount: asFinite(json && json.total_count),
      items: resources.map((row) => mapSearchResource(row, account.cloudName)).filter(Boolean),
    };
  } catch (err) {
    return { available: false, items: [], error: jsonSafeError(err) };
  }
}

function utcDateOffset(daysAgo) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

async function fetchUsageHistory(account, fetchImpl) {
  const points = [];
  const errors = [];
  for (let i = HISTORY_DAYS; i >= 1; i--) {
    const date = utcDateOffset(i);
    try {
      const { report } = await fetchUsageReport(account, date, fetchImpl);
      points.push({
        date,
        storage: report?.meters?.storage?.usage ?? null,
        bandwidth: report?.meters?.bandwidth?.usage ?? null,
        transformations: report?.meters?.transformations?.usage ?? null,
        resources: report?.resources ?? null,
      });
    } catch (err) {
      errors.push({ date, error: jsonSafeError(err) });
      points.push({
        date,
        storage: null,
        bandwidth: null,
        transformations: null,
        resources: null,
      });
    }
  }
  const any = points.some((p) => p.storage != null || p.bandwidth != null);
  return { available: any, points, errors: errors.length ? errors : undefined };
}

function assertNoSecrets(payload) {
  const text = JSON.stringify(payload);
  if (/api[_-]?secret/i.test(text) || /CLOUDINARY_API_SECRET/.test(text)) {
    throw new Error('Refusing to return a payload that mentions Cloudinary secrets');
  }
}

async function loadAccountUsage(account, { refresh, fetchImpl } = {}) {
  const key = `usage:${account.cloudName}`;
  const age = cacheAgeMs(key);
  if (!refresh || (age != null && age < MIN_REFRESH_MS)) {
    const hit = cacheGet(key);
    if (hit) {
      return { ...hit.value, cached: true, cacheAgeMs: Date.now() - hit.fetchedAt };
    }
  }

  const [usageRes, typeRes] = await Promise.all([
    fetchUsageReport(account, null, fetchImpl),
    fetchResourceTypeCounts(account, fetchImpl),
  ]);

  const value = {
    ...publicAccountMeta(account),
    cached: false,
    lastUpdated: new Date().toISOString(),
    usage: usageRes.report,
    rateLimit: usageRes.rate,
    resourceCounts: typeRes.counts,
    resourceCountTotal: typeRes.total,
    resourceCountErrors: Object.keys(typeRes.errors).length ? typeRes.errors : undefined,
    sizeByResourceType: {
      available: false,
      reason: 'Not available through Cloudinary API',
    },
  };
  cacheSet(key, value, CACHE_MS);
  return value;
}

async function loadAccountDetails(account, { refresh, fetchImpl } = {}) {
  const key = `details:${account.cloudName}`;
  const age = cacheAgeMs(key);
  if (!refresh || (age != null && age < MIN_REFRESH_MS)) {
    const hit = cacheGet(key);
    if (hit) return { ...hit.value, cached: true };
  }

  const [folders, recent, largest] = await Promise.all([
    fetchFolderSummary(account, fetchImpl),
    fetchSearchList(account, 'created_at', fetchImpl),
    fetchSearchList(account, 'bytes', fetchImpl),
  ]);

  const value = {
    ...publicAccountMeta(account),
    cached: false,
    lastUpdated: new Date().toISOString(),
    folders,
    recentAssets: recent,
    largestAssets: largest,
  };
  cacheSet(key, value, CACHE_MS);
  return value;
}

async function loadAccountHistory(account, { refresh, fetchImpl } = {}) {
  const key = `history:${account.cloudName}`;
  const age = cacheAgeMs(key);
  if (!refresh || (age != null && age < MIN_REFRESH_MS)) {
    const hit = cacheGet(key);
    if (hit) return { ...hit.value, cached: true };
  }
  const history = await fetchUsageHistory(account, fetchImpl);
  const value = {
    ...publicAccountMeta(account),
    cached: false,
    lastUpdated: new Date().toISOString(),
    history,
  };
  cacheSet(key, value, HISTORY_CACHE_MS);
  return value;
}

async function buildCloudinaryUsagePayload({ refresh = false, details = false, history = false, fetchImpl } = {}) {
  const accounts = await resolveCloudinaryAdminAccounts();
  if (!accounts.length) {
    return {
      ok: false,
      error: 'Cloudinary Admin API is not configured (set app_secrets.cloudinary or CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET)',
      lastUpdated: new Date().toISOString(),
    };
  }

  const out = {
    ok: true,
    lastUpdated: new Date().toISOString(),
    accounts: [],
  };

  for (const account of accounts) {
    const row = { ...publicAccountMeta(account) };
    try {
      row.overview = await loadAccountUsage(account, { refresh, fetchImpl });
    } catch (err) {
      row.overviewError = jsonSafeError(err);
      row.rateLimited = err.statusCode === 429;
    }
    if (details) {
      try {
        row.details = await loadAccountDetails(account, { refresh, fetchImpl });
      } catch (err) {
        row.detailsError = jsonSafeError(err);
        row.rateLimited = row.rateLimited || err.statusCode === 429;
      }
    }
    if (history) {
      try {
        row.history = await loadAccountHistory(account, { refresh, fetchImpl });
      } catch (err) {
        row.historyError = jsonSafeError(err);
        row.rateLimited = row.rateLimited || err.statusCode === 429;
      }
    }
    out.accounts.push(row);
  }

  assertNoSecrets(out);
  return out;
}

module.exports = {
  CACHE_MS,
  MIN_REFRESH_MS,
  parseMeter,
  parseUsageReport,
  applyFreePlanQuotas,
  FREE_PLAN_CREDITS,
  BYTES_PER_CREDIT,
  TRANSFORMS_PER_CREDIT,
  mapSearchResource,
  getCloudinaryAdminAccounts,
  publicAccountMeta,
  buildCloudinaryUsagePayload,
  clearUsageCache,
  jsonSafeError,
};
