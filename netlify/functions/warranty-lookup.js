// Public warranty lookup by phone for the /warranty page.
//
// Defense in depth (all enforced server-side — cannot be bypassed by calling the
// function directly or skipping the UI):
//   1. CORS origin allow-list.
//   2. IP rate limit + per-phone rate limit (stops enumeration / volume abuse).
//   3. ALTCHA proof-of-work token (verifyLoginToken) — required whenever ALTCHA is
//      configured, and mandatory in production. Stops headless/bot traffic.
//   4. Firebase phone OTP (verifyFirebasePhoneToken) — when OTP_ENFORCED=true, the
//      caller must present a Firebase ID token whose phone MATCHES the number being
//      looked up. This is the real anti-PII-harvest gate: you can only see a number's
//      warranty if you control that SIM.
//   5. The read itself uses the service-role key via a SECURITY DEFINER RPC that
//      returns only customer-facing fields (no raw PII dump).
//
// OTP can be toggled off for the testing phase (OTP_ENFORCED unset) without weakening
// the ALTCHA + rate-limit layers.
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, isOriginAllowed } = require('./cors-helper');
const { addSecurityHeaders } = require('./security-headers');
const {
  checkRateLimit,
  checkRateLimitForKey,
  rateLimitResponseForKey,
  getClientIdentifier,
} = require('./rate-limiter');
const { verifyLoginToken, isPlaceholderKey } = require('./altcha-guard');
const { isOtpEnforced, verifyFirebasePhoneToken, warmFirebaseAdmin } = require('./otp-guard');

function normalizePhoneDigits(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.slice(-10);
}

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

  // Warmup ping: pre-initialize firebase-admin and warm this container so the real
  // verify + lookup hits a warm function (kills cold-start latency on the OTP path).
  // Does no DB work, requires no tokens, and exposes nothing — so it is intentionally
  // exempt from rate limiting and the security gates below.
  if (body && body.warmup === true) {
    warmFirebaseAdmin();
    return json(200, corsHeaders, { warmed: true });
  }

  // IP rate limit (disabled automatically in local dev by rate-limiter.js).
  const ipLimit = checkRateLimit(event, {
    maxRequests: 20,
    windowMs: 60_000,
    endpoint: 'warranty-lookup',
  });
  if (!ipLimit.allowed) {
    return {
      statusCode: 429,
      headers: addSecurityHeaders({
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(Math.ceil((ipLimit.resetTime - Date.now()) / 1000)),
      }),
      body: JSON.stringify({ error: 'Too many requests', message: 'Please wait before trying again.' }),
    };
  }

  const norm = normalizePhoneDigits(body.phone);
  if (!norm || norm.length !== 10 || !/^[6-9]/.test(norm)) {
    return json(400, corsHeaders, { error: 'Enter a valid 10-digit mobile number.' });
  }

  // --- ALTCHA proof-of-work gate -------------------------------------------
  // Required whenever ALTCHA is configured (real HMAC key). In production a missing
  // key is a misconfiguration, so we fail closed rather than silently allowing bots.
  const altchaConfigured = !isPlaceholderKey();
  if (process.env.CONTEXT === 'production' && !altchaConfigured) {
    return json(503, corsHeaders, { error: 'Security protection unavailable' });
  }
  if (altchaConfigured) {
    if (!body.altchaLoginToken) {
      return json(403, corsHeaders, { error: 'Security verification required' });
    }
    const tokenCheck = verifyLoginToken(body.altchaLoginToken, body.altchaPayload);
    if (!tokenCheck.ok) {
      return json(403, corsHeaders, { error: tokenCheck.error || 'Security verification failed' });
    }
  }

  // Per-phone rate limit to stop enumeration.
  const phoneLimit = checkRateLimitForKey(norm, {
    maxRequests: 10,
    windowMs: 300_000,
    endpoint: 'warranty-lookup-phone',
  });
  if (!phoneLimit.allowed) {
    const base = rateLimitResponseForKey(phoneLimit);
    return { ...base, headers: addSecurityHeaders({ ...base.headers, ...corsHeaders }) };
  }

  // --- Phone OTP gate ------------------------------------------------------
  // When enforced, the Firebase ID token's phone must equal the looked-up number, so a
  // caller can only reveal warranty details for a SIM they actually control. Done after
  // rate limits so the Firebase verify endpoint can't be hammered.
  if (isOtpEnforced()) {
    const otpCheck = await verifyFirebasePhoneToken(body.phoneToken, norm);
    if (!otpCheck.ok) {
      return json(403, corsHeaders, {
        error: otpCheck.error || 'Phone verification required',
        otpRequired: true,
      });
    }
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return json(500, corsHeaders, { error: 'Server misconfigured' });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.rpc('get_warranties_by_phone', { p_phone: norm });
  if (error) {
    console.error('[warranty-lookup]', error.message, { ip: getClientIdentifier(event) });
    return json(500, corsHeaders, { error: 'Lookup failed. Please try again.' });
  }

  // RPC returns a jsonb object: { found, customer?, warranties? }.
  const result = data && typeof data === 'object' ? data : { found: false };
  return json(200, corsHeaders, result);
};
