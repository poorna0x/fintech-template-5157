/**
 * Admin-only iLovePDF credit balance (official remaining_credits from /start).
 * POST or GET /.netlify/functions/ilovepdf-usage
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
const { fetchILovePdfAccountUsage } = require('./ilovepdf-compress-helper');
const {
  isQuotationPdfCompressionEnabled,
} = require('./quotation-pdf-compression-setting');

function json(statusCode, headers, payload) {
  return {
    statusCode,
    headers: addSecurityHeaders({ ...headers, 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  };
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
      endpoint: 'ilovepdf-usage-ip',
    });
    if (!ipLimit.allowed) {
      const base = rateLimitResponseForKey(ipLimit);
      return { ...base, headers: addSecurityHeaders({ ...headers, ...base.headers }) };
    }
    const userKey = auth.userId || 'admin';
    const userLimit = checkRateLimitForKey(userKey, {
      maxRequests: 12,
      windowMs: 60_000,
      endpoint: 'ilovepdf-usage-user',
    });
    if (!userLimit.allowed) {
      const base = rateLimitResponseForKey(userLimit);
      return { ...base, headers: addSecurityHeaders({ ...headers, ...base.headers }) };
    }
  }

  try {
    const [usage, dashboardEnabled] = await Promise.all([
      fetchILovePdfAccountUsage(),
      isQuotationPdfCompressionEnabled(),
    ]);
    return json(usage.ok ? 200 : usage.configured ? 503 : 200, headers, {
      ok: usage.ok,
      configured: usage.configured,
      remainingCredits: usage.remainingCredits,
      remainingFiles: usage.remainingFiles,
      estimatedCompressJobs: usage.estimatedCompressJobs,
      compressCreditsPerFile: usage.compressCreditsPerFile,
      level: usage.level,
      region: usage.region,
      dashboardEnabled: Boolean(dashboardEnabled),
      generatedAt: new Date().toISOString(),
      error: usage.error || undefined,
    });
  } catch (err) {
    const message = err && err.message ? String(err.message).slice(0, 200) : 'iLovePDF usage failed';
    return json(500, headers, { ok: false, error: message });
  }
};
