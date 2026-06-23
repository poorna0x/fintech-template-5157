// CORS helper — allowlisted origins only on Netlify/production; permissive localhost for local dev only.

const DEFAULT_ORIGINS = [
  'http://localhost:8080',
  'https://localhost:8080',
  'http://localhost:8081',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:8888',
];

const PRODUCTION_ORIGINS = [
  'https://hydrogenro.com',
  'https://www.hydrogenro.com',
  'https://hydrogenro.netlify.app',
  'https://elevenro.com',
  'https://www.elevenro.com',
];

/** Local `netlify dev` / dev-server only — not Netlify deployed functions. */
function isLocalDev() {
  if (process.env.CORS_PERMISSIVE === 'true') return true;
  if (process.env.CONTEXT === 'dev' || process.env.NETLIFY_DEV === 'true') return true;
  if (process.env.NETLIFY || process.env.CONTEXT) return false;
  // Netlify functions run on AWS Lambda — treat as deployed even if NETLIFY env is absent.
  if (process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV) return false;
  return process.env.NODE_ENV !== 'production';
}

function getNetlifyDeployOrigins() {
  const urls = [process.env.URL, process.env.DEPLOY_PRIME_URL].filter(Boolean);
  return [...new Set(urls.map((u) => String(u).replace(/\/$/, '')))];
}

function getAllowedOrigins() {
  const envOrigins = process.env.ALLOWED_ORIGINS;
  const deployOrigins = getNetlifyDeployOrigins();

  if (envOrigins) {
    const parsed = envOrigins.split(',').map((o) => o.trim()).filter(Boolean);
    if (isLocalDev()) {
      return [...new Set([...DEFAULT_ORIGINS, ...parsed, ...deployOrigins])];
    }
    return [...new Set([...parsed, ...deployOrigins, ...PRODUCTION_ORIGINS])];
  }

  if (isLocalDev()) {
    return [...DEFAULT_ORIGINS, ...PRODUCTION_ORIGINS, ...deployOrigins];
  }

  return [...new Set([...PRODUCTION_ORIGINS, ...deployOrigins])];
}

function getAllowedOrigin(requestOrigin) {
  if (!requestOrigin) {
    return null;
  }

  const allowed = getAllowedOrigins();
  if (allowed.includes(requestOrigin)) {
    return requestOrigin;
  }

  if (isLocalDev()) {
    if (
      requestOrigin.startsWith('http://localhost:') ||
      requestOrigin.startsWith('https://localhost:')
    ) {
      return requestOrigin;
    }
    const localNetworkPattern =
      /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2[0-9]|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?\/?$/;
    if (localNetworkPattern.test(requestOrigin)) {
      return requestOrigin;
    }
  }

  return null;
}

const STRICT_METHODS = 'POST, OPTIONS';
const STRICT_HEADERS = 'Content-Type, Authorization';

function getCorsHeaders(requestOrigin) {
  const allowedOrigin = getAllowedOrigin(requestOrigin);

  // SECURITY: previously returned `Access-Control-Allow-Origin: null` for any
  // origin not in the allowlist, which **matched** the literal `Origin: null`
  // header that sandboxed iframes send. That let a malicious site embed an
  // iframe with `sandbox="allow-scripts"` and call our functions cross-origin.
  // Now we emit no CORS headers at all for disallowed origins → browser blocks
  // the response. Functions that need to actively reject still return 403.
  if (!allowedOrigin) {
    return {};
  }

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': STRICT_METHODS,
    'Access-Control-Allow-Headers': STRICT_HEADERS,
    'Access-Control-Allow-Credentials': 'false',
    Vary: 'Origin',
  };
}

function isOriginAllowed(requestOrigin) {
  if (isLocalDev() && !requestOrigin) return true;
  return getAllowedOrigin(requestOrigin) !== null;
}

/** @deprecated Use isLocalDev(); kept for booking-guard imports */
function isProduction() {
  return !isLocalDev();
}

module.exports = {
  getAllowedOrigin,
  getCorsHeaders,
  isOriginAllowed,
  isProduction,
  isLocalDev,
};
