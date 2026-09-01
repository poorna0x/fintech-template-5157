// Signed, short-lived Cloudinary delivery URLs for payment receipts / bills.
// Requires Supabase JWT (admin or technician). Secrets stay server-side.
const crypto = require('crypto');
const { getCorsHeaders, isOriginAllowed } = require('./cors-helper');
const { addSecurityHeaders } = require('./security-headers');
const { verifyStaffBearerToken, readAccessTokenFromEvent } = require('./admin-auth-guard');
const { resolveCloudinaryConfig } = require('./cloudinary-secrets');

async function configForCloudName(cloudName) {
  const primary = await resolveCloudinaryConfig(false);
  const secondary = await resolveCloudinaryConfig(true);
  if (primary?.cloudName === cloudName) return primary;
  if (secondary?.cloudName === cloudName) return secondary;
  return null;
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

  const signed = {};
  const errors = {};
  const ttl = Math.min(Math.max(Number(body.ttlSeconds) || 3600, 300), 86400);

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
    const config = await configForCloudName(parsed.cloudName);
    if (!config) {
      errors[raw] = 'Unknown Cloudinary account';
      continue;
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
