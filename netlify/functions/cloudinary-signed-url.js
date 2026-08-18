// Signed, short-lived Cloudinary delivery URLs for payment receipts / bills.
// Requires Supabase JWT (admin or technician). Secrets stay server-side.
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, isOriginAllowed } = require('./cors-helper');
const { addSecurityHeaders } = require('./security-headers');
const { verifyStaffBearerToken, readAccessTokenFromEvent } = require('./admin-auth-guard');
const { technicianMayAccessCloudinaryAsset } = require('./staff-access');
const { checkRateLimit, checkRateLimitForKey, rateLimitResponseForKey } = require('./rate-limiter');

const trim = (s) => (s && typeof s === 'string' ? s.trim() : s);

function getCloudinaryConfig(useSecondary) {
  // Server-only. Do NOT fall back to VITE_* — those would leak into the browser bundle.
  if (useSecondary) {
    const cloudName = trim(process.env.CLOUDINARY_SECONDARY_CLOUD_NAME);
    const apiKey = trim(process.env.CLOUDINARY_SECONDARY_API_KEY);
    const apiSecret = trim(process.env.CLOUDINARY_SECONDARY_API_SECRET);
    return cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null;
  }
  const cloudName = trim(process.env.CLOUDINARY_CLOUD_NAME);
  const apiKey = trim(process.env.CLOUDINARY_API_KEY);
  const apiSecret = trim(process.env.CLOUDINARY_API_SECRET);
  return cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null;
}

function extractPublicIdFromUrl(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return null;
  const match = imageUrl.match(/res\.cloudinary\.com\/([^/]+)\/image\/upload\/(.+)/);
  if (!match) return null;
  const cloudName = match[1];
  let pathAfterUpload = match[2].split('?')[0];
  // Strip existing signature segment s--xxx--
  pathAfterUpload = pathAfterUpload.replace(/^s--[^/]+--\//, '');
  const parts = pathAfterUpload.split('/').filter(Boolean);
  if (!parts.length) return null;
  const startIndex = parts[0].match(/^v\d+$/) ? 1 : 0;
  const pathParts = parts.slice(startIndex);
  if (!pathParts.length) return null;
  const publicId = pathParts.join('/').replace(/\.[^.]+$/, '');
  return { cloudName, publicId };
}

/** Cloudinary delivery URL with expires_at (see delivery_url_signatures). */
function buildSignedUrl(config, publicId, ttlSeconds = 3600) {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const toSign = `expires_at=${expiresAt}&public_id=${publicId}`;
  const signature = crypto
    .createHash('sha1')
    .update(toSign + config.apiSecret)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `https://res.cloudinary.com/${config.cloudName}/image/upload/s--${signature}--/${publicId}?expires_at=${expiresAt}`;
}

function configForCloudName(cloudName) {
  const primary = getCloudinaryConfig(false);
  const secondary = getCloudinaryConfig(true);
  if (primary?.cloudName === cloudName) return primary;
  if (secondary?.cloudName === cloudName) return secondary;
  return null;
}

function getServiceDb() {
  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

exports.handler = async (event) => {
  const requestOrigin = event.headers.origin || event.headers.Origin;
  const corsHeaders = getCorsHeaders(requestOrigin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: addSecurityHeaders(corsHeaders), body: '' };
  }

  if (requestOrigin && !isOriginAllowed(requestOrigin)) {
    return {
      statusCode: 403,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
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

  const accessToken = readAccessTokenFromEvent(event, body);
  const urls = Array.isArray(body.urls) ? body.urls : body.url ? [body.url] : [];

  if (!accessToken || !urls.length) {
    return {
      statusCode: 400,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Missing accessToken or urls' }),
    };
  }

  const auth = await verifyStaffBearerToken(accessToken);
  if (!auth.ok) {
    return {
      statusCode: auth.error === 'Unauthorized' ? 401 : 403,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: auth.error || 'Forbidden' }),
    };
  }

  const ipLimit = checkRateLimit(event, {
    maxRequests: 60,
    windowMs: 60_000,
    endpoint: 'cloudinary-signed-url-ip',
  });
  if (!ipLimit.allowed) {
    const base = rateLimitResponseForKey(ipLimit);
    return {
      ...base,
      headers: addSecurityHeaders({ ...base.headers, ...corsHeaders }),
    };
  }

  const userLimit = checkRateLimitForKey(`cloudinary-sign-user:${auth.userId}`, {
    maxRequests: 120,
    windowMs: 60 * 60 * 1000,
    endpoint: 'cloudinary-signed-url-user',
  });
  if (!userLimit.allowed) {
    const base = rateLimitResponseForKey(userLimit);
    return {
      ...base,
      headers: addSecurityHeaders({ ...base.headers, ...corsHeaders }),
    };
  }

  const signed = {};
  const errors = {};
  const defaultTtl = auth.role === 'technician' ? 900 : 3600;
  const ttl = Math.min(Math.max(Number(body.ttlSeconds) || defaultTtl, 300), auth.role === 'technician' ? 1800 : 86400);
  const jobId = UUID_RE.test(String(body.jobId || '').trim()) ? String(body.jobId).trim() : null;

  let techDb = null;
  if (auth.role === 'technician') {
    techDb = getServiceDb();
    // Missing service role must not blank technician photos — skip ACL, still sign.
  }

  for (const raw of urls.slice(0, 25)) {
    if (typeof raw !== 'string' || !raw.includes('res.cloudinary.com')) {
      signed[raw] = raw;
      continue;
    }
    const parsed = extractPublicIdFromUrl(raw);
    if (!parsed) {
      errors[raw] = 'Could not parse Cloudinary URL';
      continue;
    }
    const config = configForCloudName(parsed.cloudName);
    if (!config) {
      errors[raw] = 'Unknown Cloudinary account';
      continue;
    }
    if (techDb) {
      const allowed = await technicianMayAccessCloudinaryAsset(techDb, auth.userId, {
        publicId: parsed.publicId,
        jobId,
      });
      // No jobId: in-progress uploads are not on a job row yet — still sign.
      // jobId present: only that job's technician may sign.
      if (!allowed && jobId) {
        errors[raw] = 'Forbidden';
        continue;
      }
    }
    try {
      signed[raw] = buildSignedUrl(config, parsed.publicId, ttl);
    } catch (e) {
      errors[raw] = e.message || 'Sign failed';
    }
  }

  return {
    statusCode: 200,
    headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    body: JSON.stringify({ signed, errors, expiresInSeconds: ttl }),
  };
};
