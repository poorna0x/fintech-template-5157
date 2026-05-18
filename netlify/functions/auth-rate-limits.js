// Shared brute-force limits for admin + technician login (secure-auth-login & provision).
const { checkRateLimit, checkRateLimitForKey, getClientIdentifier } = require('./rate-limiter');
const { addSecurityHeaders } = require('./security-headers');

const LIMITS = {
  /** Per IP — blocks rapid direct/proxy password attempts */
  ip: { maxRequests: 10, windowMs: 60 * 60 * 1000, endpoint: 'auth-ip' },
  /** Per email — blocks password guessing on one account */
  email: { maxRequests: 5, windowMs: 15 * 60 * 1000, endpoint: 'auth-email' },
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
 * Enforce IP + email login rate limits (always active — localhost and production).
 * @returns {{ blocked: boolean, response?: object }}
 */
function enforceLoginRateLimits(event, normalizedEmail, corsHeaders) {
  const ip = getClientIdentifier(event);
  const ipResult = checkRateLimit(event, LIMITS.ip);
  if (!ipResult.allowed) {
    if (ip === 'unknown' && process.env.NODE_ENV !== 'production') {
      console.warn('[auth-rate-limits] IP is unknown — ensure dev-server sets x-forwarded-for');
    }
    return {
      blocked: true,
      response: rateLimitHttpResponse(
        ipResult,
        corsHeaders,
        `Too many login attempts from this network. Try again in ${Math.ceil(
          (ipResult.resetTime - Date.now()) / 60000
        )} minute(s).`
      ),
    };
  }

  if (normalizedEmail) {
    const emailResult = checkRateLimitForKey(`email:${normalizedEmail}`, LIMITS.email);
    if (!emailResult.allowed) {
      return {
        blocked: true,
        response: rateLimitHttpResponse(
          emailResult,
          corsHeaders,
          `Too many login attempts for this email. Try again in ${Math.ceil(
            (emailResult.resetTime - Date.now()) / 60000
          )} minute(s).`
        ),
      };
    }
  }

  return { blocked: false };
}

module.exports = {
  LIMITS,
  enforceLoginRateLimits,
  rateLimitHttpResponse,
};
