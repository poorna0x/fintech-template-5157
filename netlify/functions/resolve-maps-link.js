// Expand Google Maps short links (maps.app.goo.gl) server-side — staff-only, rate-limited.
const { getCorsHeaders, isOriginAllowed, isProduction } = require('./cors-helper');
const { checkRateLimit } = require('./rate-limiter');
const { addSecurityHeaders } = require('./security-headers');
const { verifyStaffBearerToken, readAccessTokenFromEvent } = require('./admin-auth-guard');

const MAX_URL_LEN = 2048;
const MAX_REDIRECTS = 10;

function jsonResponse(statusCode, corsHeaders, body) {
  return {
    statusCode,
    headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  };
}

function isAllowedMapsHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return (
    host === 'maps.app.goo.gl' ||
    host === 'goo.gl' ||
    host.endsWith('.goo.gl') ||
    host === 'google.com' ||
    host.endsWith('.google.com') ||
    host.endsWith('.google.co.in')
  );
}

function isAllowedMapsUrl(input) {
  try {
    const u = new URL(String(input || '').trim());
    if (u.protocol !== 'https:') return false;
    return isAllowedMapsHost(u.hostname);
  } catch {
    return false;
  }
}

function unwrapGoogleUrlWrapper(url) {
  try {
    const u = new URL(url);
    if (u.pathname === '/url') {
      const nested = u.searchParams.get('q') || u.searchParams.get('url');
      if (nested && isAllowedMapsUrl(nested)) {
        return nested;
      }
    }
  } catch {
    // ignore
  }
  return url;
}

async function followRedirects(startUrl) {
  let current = startUrl;

  for (let i = 0; i < MAX_REDIRECTS; i++) {
    current = unwrapGoogleUrlWrapper(current);

    const response = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) break;
      const next = new URL(location, current).href;
      if (!isAllowedMapsUrl(next)) break;
      current = next;
      continue;
    }

    break;
  }

  return unwrapGoogleUrlWrapper(current);
}

exports.handler = async (event) => {
  const requestOrigin = event.headers.origin || event.headers.Origin;
  const corsHeaders = getCorsHeaders(requestOrigin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: addSecurityHeaders(corsHeaders), body: '' };
  }

  if (isProduction() && !requestOrigin) {
    return jsonResponse(403, corsHeaders, { error: 'Forbidden' });
  }

  if (requestOrigin && !isOriginAllowed(requestOrigin)) {
    return jsonResponse(403, corsHeaders, { error: 'Forbidden: Origin not allowed' });
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, corsHeaders, { error: 'Method not allowed' });
  }

  const rateLimit = checkRateLimit(event, {
    maxRequests: 30,
    windowMs: 60_000,
    endpoint: 'resolve-maps-link',
  });
  if (!rateLimit.allowed) {
    return jsonResponse(429, corsHeaders, {
      error: 'Too many requests. Please try again shortly.',
    });
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, corsHeaders, { error: 'Invalid JSON' });
  }

  const token = readAccessTokenFromEvent(event, body);
  const auth = await verifyStaffBearerToken(token);
  if (!auth.ok) {
    const status = auth.error === 'Unauthorized' ? 401 : 403;
    return jsonResponse(status, corsHeaders, { error: auth.error || 'Forbidden' });
  }

  const inputUrl = typeof body.url === 'string' ? body.url.trim() : '';
  if (!inputUrl) {
    return jsonResponse(400, corsHeaders, { error: 'Missing url parameter' });
  }
  if (inputUrl.length > MAX_URL_LEN) {
    return jsonResponse(400, corsHeaders, { error: 'URL too long' });
  }
  if (!isAllowedMapsUrl(inputUrl)) {
    return jsonResponse(400, corsHeaders, { error: 'Invalid Google Maps URL' });
  }

  try {
    const expandedUrl = await followRedirects(inputUrl);
    return jsonResponse(200, corsHeaders, {
      expandedUrl,
      originalUrl: inputUrl,
    });
  } catch (error) {
    console.error('resolve-maps-link error:', error);
    return jsonResponse(500, corsHeaders, { error: 'Failed to resolve link' });
  }
};
