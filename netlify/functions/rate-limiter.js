// Rate limiting utility for Netlify Functions
// Uses in-memory storage (will reset on function restart)
// For production, consider using Redis or a persistent store

// Rate limit store: Map<identifier, { count: number, resetTime: number }>
const rateLimitStore = new Map();

/** Netlify production/deploy contexts only — local dev-server has no CONTEXT. */
function isRateLimitEnabled() {
  const ctx = process.env.CONTEXT;
  if (!ctx || ctx === 'dev') return false;
  return true;
}

// Cleanup old entries periodically
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000);
if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();

/**
 * Get client identifier from request
 * Uses IP address or a combination of headers
 */
function getClientIdentifier(event) {
  // Try to get real IP from various headers (Netlify sets these)
  // Handle both lowercase and uppercase header names
  const headers = event.headers || {};
  const ip = 
    headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    headers['X-Forwarded-For']?.split(',')[0]?.trim() ||
    headers['x-real-ip'] ||
    headers['X-Real-Ip'] ||
    headers['cf-connecting-ip'] ||
    headers['CF-Connecting-IP'] ||
    headers['client-ip'] ||
    headers['Client-IP'] ||
    event.requestContext?.identity?.sourceIp ||
    'unknown';
  
  return ip;
}

function evaluateRateLimit(storeKey, options, increment) {
  const {
    maxRequests = 10,
    windowMs = 60000,
  } = options;

  const now = Date.now();
  let entry = rateLimitStore.get(storeKey);

  if (!entry || entry.resetTime < now) {
    entry = { count: 0, resetTime: now + windowMs };
    rateLimitStore.set(storeKey, entry);
  }

  if (increment) {
    entry.count++;
  }

  const allowed = increment
    ? entry.count <= maxRequests
    : entry.count < maxRequests;
  const remaining = Math.max(0, maxRequests - entry.count);

  return {
    allowed,
    remaining,
    resetTime: entry.resetTime,
    limit: maxRequests,
  };
}

/**
 * Check rate limit for a request (increments count — use for non-auth endpoints).
 */
function checkRateLimit(event, options = {}) {
  const {
    maxRequests = 10,
    windowMs = 60000,
    endpoint = 'default',
  } = options;

  const clientId = getClientIdentifier(event);
  const key = `${endpoint}:${clientId}`;
  const result = evaluateRateLimit(key, { maxRequests, windowMs }, true);

  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[Rate Limiter] ${endpoint}:${clientId} - Count: ${rateLimitStore.get(key)?.count}/${maxRequests}, Allowed: ${result.allowed}`
    );
  }

  return result;
}

/** Peek IP limit without incrementing (auth: count failures only). */
function peekRateLimit(event, options = {}) {
  const { endpoint = 'default', ...rest } = options;
  const clientId = getClientIdentifier(event);
  return evaluateRateLimit(`${endpoint}:${clientId}`, rest, false);
}

/** Record one failed attempt against an IP limit. */
function incrementRateLimit(event, options = {}) {
  const { endpoint = 'default', ...rest } = options;
  const clientId = getClientIdentifier(event);
  return evaluateRateLimit(`${endpoint}:${clientId}`, rest, true);
}

/**
 * Rate limit by arbitrary key (increments count).
 */
function checkRateLimitForKey(key, options = {}) {
  const endpoint = options.endpoint || 'key';
  const { maxRequests = 10, windowMs = 60000 } = options;
  return evaluateRateLimit(`${endpoint}:${key}`, { maxRequests, windowMs }, true);
}

/** Peek key limit without incrementing. */
function peekRateLimitForKey(key, options = {}) {
  const endpoint = options.endpoint || 'key';
  const { maxRequests = 10, windowMs = 60000 } = options;
  return evaluateRateLimit(`${endpoint}:${key}`, { maxRequests, windowMs }, false);
}

/** Record one failed attempt against a key limit. */
function incrementRateLimitForKey(key, options = {}) {
  const endpoint = options.endpoint || 'key';
  const { maxRequests = 10, windowMs = 60000 } = options;
  return evaluateRateLimit(`${endpoint}:${key}`, { maxRequests, windowMs }, true);
}

function rateLimitResponseForKey(result) {
  return {
    statusCode: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': Math.ceil((result.resetTime - Date.now()) / 1000).toString(),
      'X-RateLimit-Limit': result.limit.toString(),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': new Date(result.resetTime).toISOString(),
    },
    body: JSON.stringify({
      error: 'Too many requests',
      message: `Rate limit exceeded. Please try again after ${Math.ceil((result.resetTime - Date.now()) / 1000)} seconds.`,
      retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
    }),
  };
}

/**
 * Rate limit middleware for Netlify Functions
 * @param {Object} options - Rate limit configuration
 * @returns {Function} Middleware function
 */
function createRateLimiter(options = {}) {
  return (event) => {
    if (!isRateLimitEnabled()) {
      return null;
    }

    const result = checkRateLimit(event, options);

    if (!result.allowed) {
      return {
        statusCode: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': Math.ceil((result.resetTime - Date.now()) / 1000).toString(),
          'X-RateLimit-Limit': result.limit.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': new Date(result.resetTime).toISOString(),
        },
        body: JSON.stringify({
          error: 'Too many requests',
          message: `Rate limit exceeded. Please try again after ${Math.ceil((result.resetTime - Date.now()) / 1000)} seconds.`,
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
        })
      };
    }

    // Return null if allowed (continue with handler)
    return null;
  };
}

// Predefined rate limiters for different endpoint types
const rateLimiters = {
  // Strict limits for password operations (brute force protection)
  password: createRateLimiter({
    maxRequests: 5,      // 5 attempts
    windowMs: 900000,    // per 15 minutes
    endpoint: 'password'
  }),

  // Strict limits for email sending (spam / relay abuse protection)
  email: createRateLimiter({
    maxRequests: 5,
    windowMs: 3600000,
    endpoint: 'email',
  }),

  // Moderate limits for hashing (DoS protection)
  hashing: createRateLimiter({
    maxRequests: 20,      // 20 hashes
    windowMs: 60000,     // per minute
    endpoint: 'hashing'
  }),

  // Moderate limits for ALTCHA (abuse protection)
  // Increased limits to accommodate auto-loading widget and page refreshes
  altcha: createRateLimiter({
    maxRequests: 60,      // 60 requests (increased from 30)
    windowMs: 60000,     // per minute
    endpoint: 'altcha'
  }),

  // Auth login proxy — strict per-IP (brute force on /auth/v1/token)
  auth: createRateLimiter({
    maxRequests: 10,
    windowMs: 60000,
    endpoint: 'auth',
  }),

  // Default rate limiter
  default: createRateLimiter({
    maxRequests: 100,    // 100 requests
    windowMs: 60000,     // per minute
    endpoint: 'default'
  })
};

const SEND_EMAIL_IP_LIMIT = {
  maxRequests: 5,
  windowMs: 3_600_000,
  endpoint: 'send-email-ip',
};

const SEND_EMAIL_RECIPIENT_LIMIT = {
  maxRequests: 3,
  windowMs: 3_600_000,
  endpoint: 'send-email-recipient',
};

/**
 * Always-on limits for send-email (not gated by isRateLimitEnabled).
 * @returns {Object|null} 429 response object or null if allowed
 */
function enforceSendEmailRateLimits(event, recipientEmail) {
  if (process.env.CONTEXT === 'dev') {
    return null;
  }

  const ipResult = checkRateLimit(event, SEND_EMAIL_IP_LIMIT);
  if (!ipResult.allowed) {
    return rateLimitResponseForKey(ipResult);
  }

  if (recipientEmail && typeof recipientEmail === 'string') {
    const toKey = recipientEmail.trim().toLowerCase();
    if (toKey) {
      const toResult = checkRateLimitForKey(toKey, SEND_EMAIL_RECIPIENT_LIMIT);
      if (!toResult.allowed) {
        return rateLimitResponseForKey(toResult);
      }
    }
  }

  return null;
}

module.exports = {
  isRateLimitEnabled,
  checkRateLimit,
  checkRateLimitForKey,
  peekRateLimit,
  peekRateLimitForKey,
  incrementRateLimit,
  incrementRateLimitForKey,
  rateLimitResponseForKey,
  createRateLimiter,
  rateLimiters,
  getClientIdentifier,
  enforceSendEmailRateLimits,
  SEND_EMAIL_IP_LIMIT,
};

