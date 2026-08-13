/**
 * Public: verify WhatsApp authenticity OTP → short-lived HMAC session.
 * Body: { phone, otp, altchaLoginToken?, altchaPayload? }
 */
const { getCorsHeaders, isOriginAllowed } = require('./cors-helper');
const { addSecurityHeaders } = require('./security-headers');
const {
  checkRateLimit,
  checkRateLimitForKey,
  getClientIdentifier,
} = require('./rate-limiter');
const { verifyLoginToken, isPlaceholderKey } = require('./altcha-guard');
const {
  getServiceSupabase,
  getSessionSecret,
  normalizePhoneE164,
  hashOtp,
  timingSafeEqualHex,
  issueSessionToken,
  MAX_OTP_ATTEMPTS,
  SESSION_TTL_SEC,
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
    maxRequests: 30,
    windowMs: 60_000,
    endpoint: 'pdf-auth-otp-verify-ip',
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

  const phone = normalizePhoneE164(body.phone);
  const otp = String(body.otp || '').replace(/\D/g, '');
  if (!phone || phone.length < 12 || otp.length !== 6) {
    return json(400, corsHeaders, { error: 'Invalid or expired code' });
  }

  const phoneLimit = checkRateLimitForKey(phone, {
    maxRequests: 10,
    windowMs: 300_000,
    endpoint: 'pdf-auth-otp-verify-phone',
  });
  if (!phoneLimit.allowed) {
    return json(429, corsHeaders, { error: 'Too many attempts. Try again later.' });
  }

  // ALTCHA: required on Netlify (prod/preview). Local vite proxies altcha-verify to
  // hydrogenro.com, so a local HMAC check would always fail with a signature mismatch.
  const onNetlify = Boolean(process.env.CONTEXT && process.env.CONTEXT !== 'dev');
  const altchaConfigured = !isPlaceholderKey();
  if (process.env.CONTEXT === 'production' && !altchaConfigured) {
    return json(503, corsHeaders, { error: 'Security protection unavailable' });
  }
  if (onNetlify && altchaConfigured) {
    if (!body.altchaLoginToken) {
      return json(403, corsHeaders, { error: 'Security verification required' });
    }
    const tokenCheck = verifyLoginToken(body.altchaLoginToken, body.altchaPayload);
    if (!tokenCheck.ok) {
      return json(403, corsHeaders, { error: tokenCheck.error || 'Security verification failed' });
    }
  }

  const db = getServiceSupabase();
  if (!db) {
    return json(503, corsHeaders, { error: 'Service unavailable' });
  }

  const secret = await getSessionSecret(db);
  if (!secret) {
    console.error('[pdf-authenticity-otp-verify] session secret missing');
    return json(503, corsHeaders, { error: 'Service unavailable' });
  }

  const nowIso = new Date().toISOString();
  const { data: row, error: lookupErr } = await db
    .from('pdf_authenticity_otp')
    .select('id, otp_hash, expires_at, attempts, consumed_at')
    .eq('phone_e164', phone)
    .is('consumed_at', null)
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupErr) {
    console.error('[pdf-authenticity-otp-verify] lookup', lookupErr.message);
    return json(500, corsHeaders, { error: 'Invalid or expired code' });
  }

  if (!row) {
    return json(400, corsHeaders, { error: 'Invalid or expired code' });
  }

  if (Number(row.attempts || 0) >= MAX_OTP_ATTEMPTS) {
    await db
      .from('pdf_authenticity_otp')
      .update({ consumed_at: nowIso })
      .eq('id', row.id);
    return json(400, corsHeaders, { error: 'Invalid or expired code' });
  }

  const expectedHash = hashOtp(phone, otp, secret);
  if (!timingSafeEqualHex(expectedHash, row.otp_hash)) {
    const nextAttempts = Number(row.attempts || 0) + 1;
    const patch = { attempts: nextAttempts };
    if (nextAttempts >= MAX_OTP_ATTEMPTS) patch.consumed_at = nowIso;
    await db.from('pdf_authenticity_otp').update(patch).eq('id', row.id);
    return json(400, corsHeaders, { error: 'Invalid or expired code' });
  }

  await db
    .from('pdf_authenticity_otp')
    .update({
      consumed_at: nowIso,
      request_ip: getClientIdentifier(event) || null,
    })
    .eq('id', row.id);

  const sessionToken = issueSessionToken(phone, secret);
  return json(200, corsHeaders, {
    ok: true,
    sessionToken,
    expiresInSec: SESSION_TTL_SEC,
  });
};
