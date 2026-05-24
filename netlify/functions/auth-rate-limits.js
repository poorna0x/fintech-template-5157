// Shared brute-force limits for admin + technician login (secure-auth-login).
// IP + email counters increment only on failed password attempts (successful
// logins do not consume quota). Turnstile + per-account lockout are primary gates.
const {
  peekRateLimit,
  peekRateLimitForKey,
  incrementRateLimit,
  incrementRateLimitForKey,
  getClientIdentifier,
} = require('./rate-limiter');
const { addSecurityHeaders } = require('./security-headers');

const LIMITS = {
  /** Per IP — failed login attempts only */
  ip: { maxRequests: 10, windowMs: 60 * 60 * 1000, endpoint: 'auth-ip-fail' },
  /** Per email — failed login attempts only */
  email: { maxRequests: 5, windowMs: 15 * 60 * 1000, endpoint: 'auth-email-fail' },
};

function rateLimitHttpResponse(result, corsHeaders, userMessage) {
  const retrySec = Math.max(1, Math.ceil((result.resetTime - Date.now()) / 1000));
  return {
    statusCode: 429,
    headers: addSecurityHeaders({
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Retry-After': String(retrySec),
      'X-RateLimit-Limit': String(result.limit),
      'X-RateLimit-Remaining': '0',
    }),
    body: JSON.stringify({
      error: 'Too many login attempts',
      message:
        userMessage ||
        `Too many login attempts. Try again in ${Math.ceil(retrySec / 60)} minute(s).`,
      retryAfter: retrySec,
      locked: true,
    }),
  };
}

/**
 * Check IP + email limits without incrementing (call at start of login).
 * @returns {{ blocked: boolean, response?: object }}
 */
function checkLoginRateLimits(event, normalizedEmail, corsHeaders) {
  const ip = getClientIdentifier(event);
  const ipResult = peekRateLimit(event, LIMITS.ip);
  if (!ipResult.allowed) {
    if (ip === 'unknown' && process.env.NODE_ENV !== 'production') {
      console.warn('[auth-rate-limits] IP is unknown — ensure dev-server sets x-forwarded-for');
    }
    return {
      blocked: true,
      response: rateLimitHttpResponse(
        ipResult,
        corsHeaders,
        `Too many login attempts. Try again in ${Math.ceil(
          (ipResult.resetTime - Date.now()) / 60000
        )} minute(s).`
      ),
    };
  }

  if (normalizedEmail) {
    const emailResult = peekRateLimitForKey(`email:${normalizedEmail}`, LIMITS.email);
    if (!emailResult.allowed) {
      return {
        blocked: true,
        response: rateLimitHttpResponse(
          emailResult,
          corsHeaders,
          `Too many login attempts. Try again in ${Math.ceil(
            (emailResult.resetTime - Date.now()) / 60000
          )} minute(s).`
        ),
      };
    }
  }

  return { blocked: false };
}

/** Increment IP + email failure counters after a failed password attempt. */
function recordLoginRateLimitFailure(event, normalizedEmail) {
  incrementRateLimit(event, LIMITS.ip);
  if (normalizedEmail) {
    incrementRateLimitForKey(`email:${normalizedEmail}`, LIMITS.email);
  }
}

/** @deprecated Use checkLoginRateLimits + recordLoginRateLimitFailure */
function enforceLoginRateLimits(event, normalizedEmail, corsHeaders) {
  return checkLoginRateLimits(event, normalizedEmail, corsHeaders);
}

module.exports = {
  LIMITS,
  checkLoginRateLimits,
  recordLoginRateLimitFailure,
  enforceLoginRateLimits,
  rateLimitHttpResponse,
};
