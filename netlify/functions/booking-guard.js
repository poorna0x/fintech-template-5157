const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, isOriginAllowed, isProduction } = require('./cors-helper');
const { addSecurityHeaders } = require('./security-headers');
const {
  checkRateLimit,
  checkRateLimitForKey,
  rateLimitResponseForKey,
  getClientIdentifier,
} = require('./rate-limiter');
const { verifyLoginToken, consumeLoginToken, isPlaceholderKey } = require('./altcha-guard');

function normalizePhoneDigits(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length >= 12 && digits.startsWith('91')) {
    return digits.slice(-10);
  }
  return digits.slice(-10);
}

function isValidIndianMobile(norm) {
  return norm && norm.length === 10 && /^[6-9]/.test(norm);
}

function jsonResponse(statusCode, corsHeaders, body) {
  return {
    statusCode,
    headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  };
}

function preflightOrReject(event) {
  const requestOrigin = event.headers.origin || event.headers.Origin;
  const corsHeaders = getCorsHeaders(requestOrigin);

  if (event.httpMethod === 'OPTIONS') {
    return { handled: true, response: { statusCode: 200, headers: addSecurityHeaders(corsHeaders), body: '' } };
  }

  if (isProduction() && !requestOrigin) {
    return {
      handled: true,
      response: jsonResponse(403, corsHeaders, { error: 'Forbidden' }),
    };
  }

  if (requestOrigin && !isOriginAllowed(requestOrigin)) {
    return {
      handled: true,
      response: jsonResponse(403, corsHeaders, { error: 'Forbidden: Origin not allowed' }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      handled: true,
      response: jsonResponse(405, corsHeaders, { error: 'Method not allowed' }),
    };
  }

  if (process.env.CONTEXT === 'production' && isPlaceholderKey()) {
    return {
      handled: true,
      response: jsonResponse(503, corsHeaders, { error: 'Booking protection unavailable' }),
    };
  }

  return { handled: false, corsHeaders };
}

function rateLimitBooking(event, corsHeaders, phoneNorm, endpoint) {
  const ipLimit = checkRateLimit(event, {
    maxRequests: 20,
    windowMs: 60_000,
    endpoint,
  });
  if (!ipLimit.allowed) {
    return jsonResponse(429, corsHeaders, {
      error: 'Too many requests',
      message: 'Please wait before trying again.',
    });
  }

  if (phoneNorm) {
    const phoneLimit = checkRateLimitForKey(phoneNorm, {
      maxRequests: 10,
      windowMs: 300_000,
      endpoint: `${endpoint}-phone`,
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
  }

  return null;
}

function verifyAltcha(body, corsHeaders) {
  const { altchaLoginToken, altchaPayload } = body;
  if (!altchaLoginToken) {
    return { ok: false, response: jsonResponse(403, corsHeaders, { error: 'Security verification required' }) };
  }
  const tokenCheck = verifyLoginToken(altchaLoginToken, altchaPayload);
  if (!tokenCheck.ok) {
    return {
      ok: false,
      response: jsonResponse(403, corsHeaders, {
        error: tokenCheck.error || 'Security verification failed',
      }),
    };
  }
  return { ok: true, tokenCheck };
}

function getServiceClient() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { error: 'Server misconfigured' };
  }
  return {
    admin: createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
  };
}

/** Allowed keys for public booking customer updates (no arbitrary field writes). */
function pickBookingCustomerUpdates(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const allowed = [
    'full_name',
    'email',
    'alternate_phone',
    'address',
    'location',
    'preferred_time_slot',
    'custom_time',
    'updated_at',
  ];
  const out = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      out[key] = raw[key];
    }
  }
  return out;
}

module.exports = {
  normalizePhoneDigits,
  isValidIndianMobile,
  jsonResponse,
  preflightOrReject,
  rateLimitBooking,
  verifyAltcha,
  getServiceClient,
  pickBookingCustomerUpdates,
  consumeLoginToken,
  getClientIdentifier,
};
