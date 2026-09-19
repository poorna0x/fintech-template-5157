/**
 * Admin-only Google Maps Platform usage (Cloud Monitoring).
 * GET or POST /.netlify/functions/google-maps-usage
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
const { buildGoogleMapsUsagePayload, incrementGoogleMapsUsageCounts } = require('./google-maps-usage-helper');

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
      maxRequests: 30,
      windowMs: 60_000,
      endpoint: 'google-maps-usage-ip',
    });
    if (!ipLimit.allowed) {
      const base = rateLimitResponseForKey(ipLimit);
      return { ...base, headers: addSecurityHeaders({ ...headers, ...base.headers }) };
    }
    const userKey = auth.userId || 'admin';
    const userLimit = checkRateLimitForKey(userKey, {
      maxRequests: 12,
      windowMs: 60_000,
      endpoint: 'google-maps-usage-user',
    });
    if (!userLimit.allowed) {
      const base = rateLimitResponseForKey(userLimit);
      return { ...base, headers: addSecurityHeaders({ ...headers, ...base.headers }) };
    }
  }

  let refresh = false;
  let increment = null;
  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}');
      refresh = truthy(body.refresh);
      if (body.increment && typeof body.increment === 'object') increment = body.increment;
    } catch {
      return json(400, headers, { ok: false, error: 'Invalid JSON' });
    }
  } else {
    refresh = truthy(event.queryStringParameters?.refresh);
  }

  try {
    if (increment) {
      const result = await incrementGoogleMapsUsageCounts(increment);
      return json(200, headers, { ok: Boolean(result.ok), incremented: result.incremented || 0 });
    }
    const payload = await buildGoogleMapsUsagePayload(refresh);
    return json(200, headers, payload);
  } catch (err) {
    const message = err && err.message ? String(err.message).slice(0, 200) : 'Google Maps usage failed';
    return json(500, headers, { ok: false, error: message });
  }
};
