/**
 * Public: check PDF authenticity by SHA-256 (or optional verify code).
 * Requires valid sessionToken from pdf-authenticity-otp-verify.
 * Body: { sessionToken, sha256Hex?, verifyCode? } — send hash only, never the PDF.
 */
const { getCorsHeaders, isOriginAllowed } = require('./cors-helper');
const { addSecurityHeaders } = require('./security-headers');
const { checkRateLimit, checkRateLimitForKey } = require('./rate-limiter');
const {
  getServiceSupabase,
  getSessionSecret,
  verifySessionToken,
  isValidSha256Hex,
  lookupAuthenticityBySha256,
  lookupAuthenticityByVerifyCode,
} = require('./pdf-authenticity-helper');

function json(statusCode, corsHeaders, payload) {
  return {
    statusCode,
    headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  };
}

exports.handler = async (event) => {
  const requestOrigin = event.headers.origin || event.headers.Origin;
  const corsHeaders = getCorsHeaders(requestOrigin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: addSecurityHeaders(corsHeaders), body: '' };
  }

  if (requestOrigin && !isOriginAllowed(requestOrigin)) {
    return json(403, { 'Content-Type': 'application/json' }, { error: 'Forbidden: Origin not allowed' });
  }

  if (event.httpMethod !== 'POST') {
    return json(405, corsHeaders, { error: 'Method not allowed' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, corsHeaders, { error: 'Invalid JSON' });
  }

  const ipLimit = checkRateLimit(event, {
    maxRequests: 40,
    windowMs: 60_000,
    endpoint: 'pdf-auth-check-ip',
  });
  if (!ipLimit.allowed) {
    return {
      statusCode: 429,
      headers: addSecurityHeaders({
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(Math.ceil((ipLimit.resetTime - Date.now()) / 1000)),
      }),
      body: JSON.stringify({ error: 'Too many requests' }),
    };
  }

  const db = getServiceSupabase();
  if (!db) {
    return json(503, corsHeaders, { error: 'Service unavailable' });
  }

  const secret = await getSessionSecret(db);
  if (!secret) {
    return json(503, corsHeaders, { error: 'Service unavailable' });
  }

  const session = verifySessionToken(body.sessionToken, secret);
  if (!session.ok) {
    return json(401, corsHeaders, { error: session.error || 'Invalid session' });
  }

  const sessionLimit = checkRateLimitForKey(session.phone, {
    maxRequests: 30,
    windowMs: 20 * 60 * 1000,
    endpoint: 'pdf-auth-check-session',
  });
  if (!sessionLimit.allowed) {
    return json(429, corsHeaders, { error: 'Too many checks for this session.' });
  }

  const sha256Hex = body.sha256Hex ? String(body.sha256Hex).trim().toLowerCase() : '';
  const verifyCode = body.verifyCode ? String(body.verifyCode).trim() : '';

  if (!sha256Hex && !verifyCode) {
    return json(400, corsHeaders, { error: 'Provide a PDF hash or verify code.' });
  }

  if (sha256Hex && !isValidSha256Hex(sha256Hex)) {
    return json(400, corsHeaders, { error: 'Invalid hash.' });
  }

  try {
    let result = { authentic: false };
    if (sha256Hex) {
      result = await lookupAuthenticityBySha256(db, sha256Hex);
    } else if (verifyCode) {
      result = await lookupAuthenticityByVerifyCode(db, verifyCode);
    }
    return json(200, corsHeaders, result);
  } catch (err) {
    console.error('[pdf-authenticity-check]', err?.message || err);
    return json(500, corsHeaders, { error: 'Lookup failed' });
  }
};
