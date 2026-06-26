// Expand Google Maps short links (maps.app.goo.gl) — public, rate-limited.
const { getCorsHeaders, isOriginAllowed } = require('./cors-helper');
const { checkRateLimit } = require('./rate-limiter');
const { addSecurityHeaders } = require('./security-headers');

const MAX_URL_LEN = 2048;
const MAX_REDIRECTS = 12;

const trim = (s) => (s && typeof s === 'string' ? s.trim() : '');

function getGoogleMapsServerKey() {
  return trim(process.env.GOOGLE_MAPS_API_KEY) || trim(process.env.VITE_GOOGLE_MAPS_API_KEY) || null;
}

/** Geocode a named /place/... URL when it has no !3d/!4d coordinates (common for museums, apartments). */
async function geocodePlaceNameWithGoogle(placeName) {
  const apiKey = getGoogleMapsServerKey();
  if (!apiKey || !placeName) return null;

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', placeName);
  url.searchParams.set('region', 'in');
  url.searchParams.set('key', apiKey);

  try {
    const response = await fetch(url.toString());
    if (!response.ok) return null;
    const data = await response.json();
    if (data.status !== 'OK' || !data.results?.[0]?.geometry?.location) return null;
    const { lat, lng } = data.results[0].geometry.location;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { latitude: lat, longitude: lng };
  } catch {
    return null;
  }
}

const USER_AGENTS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
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
    host === 'maps.google.com' ||
    host === 'consent.google.com' ||
    host === 'accounts.google.com'
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

function isMapsDestinationUrl(input) {
  try {
    const u = new URL(String(input || '').trim());
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return host.includes('google.') && (u.pathname.includes('/maps') || host === 'maps.app.goo.gl');
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
      if (nested && isMapsDestinationUrl(nested)) {
        return nested;
      }
    }
    if (u.hostname.includes('accounts.google.com') || u.hostname.includes('consent.google.com')) {
      const cont = u.searchParams.get('continue');
      if (cont) {
        const decoded = decodeURIComponent(cont);
        if (isMapsDestinationUrl(decoded)) return decoded;
      }
    }
  } catch {
    // ignore
  }
  return url;
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function extractContinueUrlFromHtml(html) {
  if (!html) return null;
  const patterns = [
    /continue\\x3d(https?:\\\/\\\/[^&"']+)/i,
    /continue=(https?:\/\/[^&"']+)/i,
    /"continue":"(https?:[^"]+)"/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match) continue;
    const candidate = decodeHtmlEntities(match[1]).replace(/\\\//g, '/');
    if (isMapsDestinationUrl(candidate)) return candidate;
  }
  return null;
}

function extractMapsUrlFromHtml(html) {
  if (!html || typeof html !== 'string') return null;

  const continueUrl = extractContinueUrlFromHtml(html);
  if (continueUrl && extractCoordinatesFromUrl(continueUrl)) return continueUrl;

  const candidates = [];
  const patterns = [
    /property="og:url"\s+content="([^"]+)"/i,
    /content="([^"]+)"\s+property="og:url"/i,
    /rel="canonical"\s+href="([^"]+)"/i,
    /href="(https:\/\/(?:www\.)?google\.com\/maps[^"]+)"/gi,
    /"(https:\/\/(?:www\.)?google\.com\/maps[^"]+)"/gi,
    /\[(null,null,)?(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,\d+)?\]/g,
  ];

  for (let i = 0; i < 4; i += 1) {
    const pattern = patterns[i];
    const matches = html.matchAll(pattern);
    for (const match of matches) {
      const candidate = decodeHtmlEntities(match[1] || match[0] || '');
      if (candidate.includes('google.com/maps')) {
        candidates.push(candidate);
      }
    }
  }

  const coordMatches = [...html.matchAll(patterns[4])];
  if (coordMatches.length > 0) {
    const last = coordMatches[coordMatches.length - 1];
    const lat = last[2] || last[1];
    const lng = last[3] || last[2];
    if (lat && lng) {
      return `https://www.google.com/maps?q=${lat},${lng}`;
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
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-IN,en;q=0.9',
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) break;
      const next = new URL(location, current).href;
      if (!isAllowedMapsHost(new URL(next).hostname)) break;
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
        'Accept-Language': 'en-IN,en;q=0.9',
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
  const variants = [cleaned, `${cleaned}?_imcp=1`];

  for (const variant of variants) {
    for (const userAgent of USER_AGENTS) {
      const manual = await fetchWithManualRedirects(variant, userAgent);
      if (extractCoordinatesFromUrl(manual)) return manual;

      const automatic = await fetchWithAutoRedirects(variant, userAgent);
      if (extractCoordinatesFromUrl(automatic)) return automatic;
    }
  }

  return unwrapGoogleUrlWrapper(cleaned);
}

function extractPlaceNameFromUrl(url) {
  try {
    const match = normalizeUrlForParsing(url).match(/\/place\/([^/@?]+)/);
    if (!match) return null;
    const raw = decodeURIComponent(match[1].replace(/\+/g, ' ')).trim();
    if (!raw || /^-?\d/.test(raw)) return null;
    return raw;
  } catch {
    return null;
  }
}

async function resolveMapsUrl(inputUrl) {
  const expandedUrl = await followRedirects(inputUrl);
  const coords = extractCoordinatesFromUrl(expandedUrl);
  const stillShort =
    expandedUrl.includes('maps.app.goo.gl') || expandedUrl.includes('goo.gl/maps');
  const placeName = extractPlaceNameFromUrl(expandedUrl);

  return { expandedUrl, coords, stillShort, placeName };
}

exports.handler = async (event) => {
  const requestOrigin = event.headers.origin || event.headers.Origin;
  const corsHeaders = getCorsHeaders(requestOrigin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: addSecurityHeaders(corsHeaders), body: '' };
  }

  // Public read-only endpoint — rate limit + URL allowlist. Same-origin mobile
  // Safari often omits Origin; do not require it here.
  if (requestOrigin && !isOriginAllowed(requestOrigin)) {
    return jsonResponse(403, corsHeaders, { error: 'Forbidden: Origin not allowed' });
  }

  if (!['GET', 'POST'].includes(event.httpMethod)) {
    return jsonResponse(405, corsHeaders, { error: 'Method not allowed' });
  }

  const rateLimit = checkRateLimit(event, {
    maxRequests: 60,
    windowMs: 60_000,
    endpoint: 'resolve-maps-link',
  });
  if (!rateLimit.allowed) {
    return jsonResponse(429, corsHeaders, {
      error: 'Too many requests. Please try again shortly.',
    });
  }

  let inputUrl = '';
  if (event.httpMethod === 'GET') {
    inputUrl = sanitizeUrl((event.queryStringParameters || {}).url);
  } else {
    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return jsonResponse(400, corsHeaders, { error: 'Invalid JSON' });
    }
    inputUrl = sanitizeUrl(body.url);
  }

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
    let { expandedUrl, coords, stillShort, placeName } = await resolveMapsUrl(inputUrl);

    // Named places (museums, apartment listings) often expand without lat/lng in the URL.
    if (!coords && !stillShort && placeName) {
      coords = await geocodePlaceNameWithGoogle(placeName);
    }

    if (!coords || stillShort) {
      return jsonResponse(422, corsHeaders, {
        error:
          'Could not expand this short link from Google. If you shared from Maps, copy the whole share text (place name + link), not just the URL.',
        expandedUrl,
        originalUrl: inputUrl,
        ...(placeName ? { placeName } : {}),
      });
    }

    return jsonResponse(200, corsHeaders, {
      expandedUrl,
      originalUrl: inputUrl,
      latitude: coords.latitude,
      longitude: coords.longitude,
      ...(placeName ? { placeName } : {}),
    });
  } catch (error) {
    console.error('resolve-maps-link error:', error);
    return jsonResponse(500, corsHeaders, { error: 'Failed to resolve link' });
  }
};

exports.extractCoordinatesFromUrl = extractCoordinatesFromUrl;
exports.followRedirects = followRedirects;
