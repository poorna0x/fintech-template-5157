/**
 * Public /accept/{token} lookup + one-time acceptance.
 * Token possession is authorization; service-role access stays server-side.
 */
const crypto = require('crypto');
const { getCorsHeaders, isOriginAllowed } = require('./cors-helper');
const { addSecurityHeaders } = require('./security-headers');
const {
  isRateLimitEnabled,
  checkRateLimit,
  checkRateLimitForKey,
  rateLimitResponseForKey,
} = require('./rate-limiter');
const { getServiceSupabase } = require('./document-accept-helper');
const {
  publicEmailAcceptSummary,
  acceptEmailInvite,
} = require('./document-accept-email-helper');

function json(statusCode, corsHeaders, payload) {
  return {
    statusCode,
    headers: addSecurityHeaders({
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, private',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    }),
    body: JSON.stringify(payload),
  };
}

function rateLimitsOn() {
  if (typeof isRateLimitEnabled === 'function') return isRateLimitEnabled();
  const context = process.env.CONTEXT;
  return Boolean(context && context !== 'dev');
}

function limited(event, corsHeaders, action, token) {
  if (!rateLimitsOn()) return null;
  const isAccept = action === 'accept';
  const ip = checkRateLimit(event, {
    maxRequests: isAccept ? 10 : 40,
    windowMs: 60_000,
    endpoint: `document-accept-public-${action}-ip`,
  });
  if (!ip.allowed) {
    const base = rateLimitResponseForKey(ip);
    return { ...base, headers: addSecurityHeaders({ ...corsHeaders, ...base.headers }) };
  }
  const tokenKey = crypto.createHash('sha256').update(token).digest('hex').slice(0, 24);
  const perToken = checkRateLimitForKey(`document-accept:${action}:${tokenKey}`, {
    maxRequests: isAccept ? 5 : 20,
    windowMs: isAccept ? 15 * 60_000 : 60_000,
    endpoint: `document-accept-public-${action}-token`,
  });
  if (!perToken.allowed) {
    const base = rateLimitResponseForKey(perToken);
    return { ...base, headers: addSecurityHeaders({ ...corsHeaders, ...base.headers }) };
  }
  return null;
}

function clientIp(event) {
  return String(
    event.headers['x-nf-client-connection-ip'] ||
    event.headers['x-forwarded-for'] ||
    event.headers['client-ip'] ||
    ''
  ).split(',')[0].trim();
}

exports.handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin;
  const corsHeaders = getCorsHeaders(origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: addSecurityHeaders(corsHeaders), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, corsHeaders, { error: 'Method not allowed' });
  }
  if (origin && !isOriginAllowed(origin)) {
    return json(403, corsHeaders, { error: 'Forbidden' });
  }
  if ((event.body || '').length > 8_000) {
    return json(413, corsHeaders, { error: 'Payload too large' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, corsHeaders, { error: 'Invalid JSON' });
  }
  const action = String(body.action || '').trim().toLowerCase();
  const token = String(body.token || '').trim();
  if (!/^[A-Za-z0-9_-]{40,48}$/.test(token)) {
    return json(400, corsHeaders, { ok: false, error: 'invalid' });
  }
  if (action !== 'get' && action !== 'accept') {
    return json(400, corsHeaders, { error: 'action required' });
  }

  const blocked = limited(event, corsHeaders, action, token);
  if (blocked) return blocked;

  const db = getServiceSupabase();
  if (!db) return json(500, corsHeaders, { ok: false, error: 'failed' });

  try {
    if (action === 'get') {
      const result = await publicEmailAcceptSummary(db, token);
      return json(200, corsHeaders, result);
    }
    const result = await acceptEmailInvite(db, token, {
      ip: clientIp(event),
      userAgent: event.headers['user-agent'] || event.headers['User-Agent'] || '',
    });
    return json(result.ok ? 200 : 400, corsHeaders, result);
  } catch (error) {
    console.error('[document-accept-public]', error?.message);
    return json(500, corsHeaders, { ok: false, error: 'failed' });
  }
};
