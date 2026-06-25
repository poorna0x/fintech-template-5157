// Expand Google Maps short links (maps.app.goo.gl) server-side — staff-only, rate-limited.
const { getCorsHeaders, isOriginAllowed, shouldRejectMissingOrigin } = require('./cors-helper');
const { checkRateLimit } = require('./rate-limiter');
const { addSecurityHeaders } = require('./security-headers');
const { verifyStaffBearerToken, readAccessTokenFromEvent } = require('./admin-auth-guard');

const MAX_URL_LEN = 2048;
const MAX_REDIRECTS = 10;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
];

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
    host.endsWith('.google.co.in') ||
    host === 'maps.google.com'
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

function sanitizeUrl(input) {
  return String(input || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

function normalizeUrlForParsing(url) {
  try {
    return decodeURIComponent(sanitizeUrl(url));
  } catch {
    return sanitizeUrl(url);
  }
}

function extractCoordinatesFromUrl(url) {
  const value = normalizeUrlForParsing(url);
  if (!value) return null;

  const tryPair = (latRaw, lngRaw) => {
    const latitude = parseFloat(latRaw);
    const longitude = parseFloat(lngRaw);
    if (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    ) {
      return { latitude, longitude };
    }
    return null;
  };

  const patterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g,
    /\/place\/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /\/search\/(-?\d+(?:\.\d+)?),\+?(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&]query=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&]ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&]center=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
  ];

  const preciseMatches = [...value.matchAll(patterns[0])];
  if (preciseMatches.length > 0) {
    const last = preciseMatches[preciseMatches.length - 1];
    const coords = tryPair(last[1], last[2]);
    if (coords) return coords;
  }

  for (let i = 1; i < patterns.length; i += 1) {
    const match = value.match(patterns[i]);
    if (match) {
      const coords = tryPair(match[1], match[2]);
      if (coords) return coords;
    }
  }

  return null;
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

function extractMapsUrlFromHtml(html) {
  if (!html || typeof html !== 'string') return null;

  const candidates = [];
  const patterns = [
    /property="og:url"\s+content="([^"]+)"/i,
    /content="([^"]+)"\s+property="og:url"/i,
    /rel="canonical"\s+href="([^"]+)"/i,
    /href="(https:\/\/(?:www\.)?google\.com\/maps[^"]+)"/gi,
    /"(https:\/\/(?:www\.)?google\.com\/maps[^"]+)"/gi,
  ];

  for (const pattern of patterns) {
    const matches = html.matchAll(pattern);
    for (const match of matches) {
      const candidate = (match[1] || match[0] || '').replace(/&amp;/g, '&');
      if (candidate.includes('google.com/maps') && isAllowedMapsUrl(candidate.split('?')[0])) {
        candidates.push(candidate);
      }
    }
  }

  for (const candidate of candidates) {
    if (extractCoordinatesFromUrl(candidate)) return candidate;
  }

  return candidates[0] || null;
}

async function fetchWithManualRedirects(startUrl, userAgent) {
  let current = startUrl;

  for (let i = 0; i < MAX_REDIRECTS; i++) {
    current = unwrapGoogleUrlWrapper(current);

    const response = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': userAgent,
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

    if (response.status >= 200 && response.status < 300) {
      const finalUrl = unwrapGoogleUrlWrapper(response.url || current);
      if (extractCoordinatesFromUrl(finalUrl)) {
        return finalUrl;
      }

      const html = await response.text();
      const fromHtml = extractMapsUrlFromHtml(html);
      if (fromHtml) return fromHtml;

      return finalUrl;
    }

    break;
  }

  return unwrapGoogleUrlWrapper(current);
}

async function fetchWithAutoRedirects(startUrl, userAgent) {
  try {
    const response = await fetch(startUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    const finalUrl = unwrapGoogleUrlWrapper(response.url || startUrl);
    if (extractCoordinatesFromUrl(finalUrl)) {
      return finalUrl;
    }

    const html = await response.text();
    const fromHtml = extractMapsUrlFromHtml(html);
    return fromHtml || finalUrl;
  } catch {
    return startUrl;
  }
}

async function followRedirects(startUrl) {
  const cleaned = sanitizeUrl(startUrl);

  for (const userAgent of USER_AGENTS) {
    const manual = await fetchWithManualRedirects(cleaned, userAgent);
    if (extractCoordinatesFromUrl(manual)) return manual;

    const automatic = await fetchWithAutoRedirects(cleaned, userAgent);
    if (extractCoordinatesFromUrl(automatic)) return automatic;
  }

  return unwrapGoogleUrlWrapper(cleaned);
}

exports.handler = async (event) => {
  const requestOrigin = event.headers.origin || event.headers.Origin;
  const corsHeaders = getCorsHeaders(requestOrigin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: addSecurityHeaders(corsHeaders), body: '' };
  }

  if (shouldRejectMissingOrigin(event)) {
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

  const inputUrl = sanitizeUrl(body.url);
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
    const coords = extractCoordinatesFromUrl(expandedUrl);
    const stillShort =
      expandedUrl.includes('maps.app.goo.gl') || expandedUrl.includes('goo.gl/maps');

    if (!coords || stillShort) {
      return jsonResponse(422, corsHeaders, {
        error:
          'Google could not expand this short link. Open it in the Maps app, then copy the full URL from your browser address bar.',
        expandedUrl,
        originalUrl: inputUrl,
      });
    }

    return jsonResponse(200, corsHeaders, {
      expandedUrl,
      originalUrl: inputUrl,
      latitude: coords.latitude,
      longitude: coords.longitude,
    });
  } catch (error) {
    console.error('resolve-maps-link error:', error);
    return jsonResponse(500, corsHeaders, { error: 'Failed to resolve link' });
  }
};

// Exported for quick node smoke tests
exports.extractCoordinatesFromUrl = extractCoordinatesFromUrl;
