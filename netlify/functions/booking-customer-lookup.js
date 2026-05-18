// ALTCHA-gated, rate-limited customer lookup for public booking (no full PII to anon key).
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

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizePhoneDigits(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length >= 12 && digits.startsWith('91')) {
    return digits.slice(-10);
  }
  return digits.slice(-10);
}

exports.handler = async (event) => {
  const requestOrigin = event.headers.origin || event.headers.Origin;
  const corsHeaders = getCorsHeaders(requestOrigin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: addSecurityHeaders(corsHeaders), body: '' };
  }

  if (requestOrigin && !isOriginAllowed(requestOrigin)) {
    return {
      statusCode: 403,
      headers: addSecurityHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Forbidden: Origin not allowed' }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  if (process.env.CONTEXT === 'production' && isPlaceholderKey()) {
    return {
      statusCode: 503,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Booking protection unavailable' }),
    };
  }

  const ipLimit = checkRateLimit(event, {
    maxRequests: 15,
    windowMs: 60_000,
    endpoint: 'booking-customer-lookup',
  });
  if (!ipLimit.allowed) {
    return {
      statusCode: 429,
      headers: addSecurityHeaders({
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(Math.ceil((ipLimit.resetTime - Date.now()) / 1000)),
      }),
      body: JSON.stringify({
        error: 'Too many requests',
        message: 'Please wait before trying again.',
      }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Invalid JSON' }),
    };
  }

  const { phone, altchaLoginToken, altchaPayload, lat, lng } = body;
  const norm = normalizePhoneDigits(phone);

  if (!norm || norm.length !== 10 || !/^[6-9]/.test(norm)) {
    return {
      statusCode: 400,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Invalid phone number' }),
    };
  }

  if (!altchaLoginToken) {
    return {
      statusCode: 403,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Security verification required' }),
    };
  }

  const tokenCheck = verifyLoginToken(altchaLoginToken, altchaPayload);
  if (!tokenCheck.ok) {
    return {
      statusCode: 403,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: tokenCheck.error || 'Security verification failed' }),
    };
  }

  const phoneLimit = checkRateLimitForKey(norm, {
    maxRequests: 8,
    windowMs: 300_000,
    endpoint: 'booking-lookup-phone',
  });
  if (!phoneLimit.allowed) {
    return {
      ...rateLimitResponseForKey(phoneLimit),
      headers: addSecurityHeaders({
        ...rateLimitResponseForKey(phoneLimit).headers,
        ...corsHeaders,
      }),
    };
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return {
      statusCode: 500,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Server misconfigured' }),
    };
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.rpc('get_customer_by_phone_for_booking', {
    p_phone: norm,
  });

  if (error) {
    console.error('[booking-customer-lookup]', error.message, { ip: getClientIdentifier(event) });
    return {
      statusCode: 500,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Lookup failed' }),
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      statusCode: 200,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ found: false }),
    };
  }

  let keepPreviousLocation = false;
  const existingLoc = row.location || {};
  const existingLat = existingLoc.latitude ?? existingLoc.lat;
  const existingLng = existingLoc.longitude ?? existingLoc.lng;
  const newLat = typeof lat === 'number' ? lat : parseFloat(lat);
  const newLng = typeof lng === 'number' ? lng : parseFloat(lng);
  const hasExisting =
    typeof existingLat === 'number' &&
    typeof existingLng === 'number' &&
    (existingLat !== 0 || existingLng !== 0);
  const hasNew =
    Number.isFinite(newLat) &&
    Number.isFinite(newLng) &&
    (newLat !== 0 || newLng !== 0);

  if (hasExisting && hasNew && haversineKm(existingLat, existingLng, newLat, newLng) <= 2) {
    keepPreviousLocation = true;
  }

  return {
    statusCode: 200,
    headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      found: true,
      id: row.id,
      keepPreviousLocation,
    }),
  };
};
