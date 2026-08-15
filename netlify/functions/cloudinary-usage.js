/**
 * Admin-only Cloudinary usage / storage (Admin API).
 * POST or GET /.netlify/functions/cloudinary-usage
 * Body/query: { refresh?: boolean, details?: boolean, history?: boolean }
 * Never returns API secrets.
 */
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { addSecurityHeaders } = require('./security-headers');
const { authorizeAdminRequest } = require('./admin-auth-guard');
const {
  isRateLimitEnabled,
  checkRateLimit,
  checkRateLimitForKey,
  rateLimitResponseForKey,
} = require('./rate-limiter');
const { buildCloudinaryUsagePayload } = require('./cloudinary-usage-helper');

function json(statusCode, headers, payload) {
  return {
    statusCode,
    headers: addSecurityHeaders({ ...headers, 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  };
}

function truthy(v) {
  return v === true || v === '1' || v === 'true' || v === 'yes';
}

exports.handler = async (event) => {
  const headers = getCorsHeaders(event.headers?.origin || event.headers?.Origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: addSecurityHeaders(headers), body: '' };
  }
  if (shouldRejectMissingOrigin(event)) {
    return json(403, headers, { ok: false, error: 'Forbidden' });
  }
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return json(405, headers, { ok: false, error: 'Method not allowed' });
  }

  const auth = await authorizeAdminRequest(event);
  if (!auth.ok) {
    return json(auth.statusCode || 401, headers, { ok: false, error: auth.error || 'Unauthorized' });
  }

  if (typeof isRateLimitEnabled === 'function' && isRateLimitEnabled()) {
    const ipLimit = checkRateLimit(event, {
      maxRequests: 40,
      windowMs: 60_000,
      endpoint: 'cloudinary-usage-ip',
    });
    if (!ipLimit.allowed) {
      const base = rateLimitResponseForKey(ipLimit);
      return { ...base, headers: addSecurityHeaders({ ...headers, ...base.headers }) };
    }
    const userKey = auth.userId || 'admin';
    const userLimit = checkRateLimitForKey(userKey, {
      maxRequests: 20,
      windowMs: 60_000,
      endpoint: 'cloudinary-usage-user',
    });
    if (!userLimit.allowed) {
      const base = rateLimitResponseForKey(userLimit);
      return { ...base, headers: addSecurityHeaders({ ...headers, ...base.headers }) };
    }
  }

  let body = {};
  if (event.httpMethod === 'POST') {
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return json(400, headers, { ok: false, error: 'Invalid JSON' });
    }
  }
  const q = event.queryStringParameters || {};
  const refresh = truthy(body.refresh) || truthy(q.refresh);
  const details = truthy(body.details) || truthy(q.details);
  const history = truthy(body.history) || truthy(q.history);

  try {
    const payload = await buildCloudinaryUsagePayload({ refresh, details, history });
    const status = payload.ok ? 200 : 503;
    return json(status, headers, payload);
  } catch (err) {
    const message = err && err.message ? String(err.message).slice(0, 200) : 'Cloudinary usage failed';
    if (/secret/i.test(message) && /CLOUDINARY/i.test(message)) {
      return json(500, headers, { ok: false, error: 'Cloudinary usage failed' });
    }
    return json(500, headers, { ok: false, error: message.replace(/Basic [A-Za-z0-9+/=]+/g, '[redacted]') });
  }
};
