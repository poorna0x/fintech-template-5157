// Public warranty lookup by phone for the /warranty page.
//
// NOTE: OTP and captcha (Turnstile/ALTCHA) are intentionally SKIPPED for now per
// product decision (testing phase). We still apply CORS + IP/phone rate limiting, and
// the read goes through the service-role key calling a SECURITY DEFINER RPC that
// returns only customer-facing warranty fields (no full PII). To harden later, add the
// ALTCHA gate exactly like booking-customer-lookup.js (verifyLoginToken).
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, isOriginAllowed } = require('./cors-helper');
const { addSecurityHeaders } = require('./security-headers');
const {
  checkRateLimit,
  checkRateLimitForKey,
  rateLimitResponseForKey,
  getClientIdentifier,
} = require('./rate-limiter');

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

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, corsHeaders, { error: 'Invalid JSON' });
  }

  const norm = normalizePhoneDigits(body.phone);
  if (!norm || norm.length !== 10 || !/^[6-9]/.test(norm)) {
    return json(400, corsHeaders, { error: 'Enter a valid 10-digit mobile number.' });
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
