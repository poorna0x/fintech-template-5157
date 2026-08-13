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

function validLatLng(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function preferIndiaPair(pairs) {
  if (!pairs.length) return null;
  const india = pairs.filter(
    (p) => p.latitude >= 6 && p.latitude <= 37 && p.longitude >= 68 && p.longitude <= 98
  );
  return (india.length ? india : pairs)[india.length ? india.length - 1 : pairs.length - 1];
}

async function geocodePlaceNameNominatim(placeName) {
  if (!placeName) return null;
  const queries = [placeName];
  const withoutPlus = String(placeName).replace(/^[A-Z0-9]{4,}\+[A-Z0-9]{2,}\s*/i, '').trim();
  if (withoutPlus && withoutPlus !== placeName) queries.push(withoutPlus);

  for (const q of queries) {
    for (const country of ['in', '']) {
      try {
        const url = new URL('https://nominatim.openstreetmap.org/search');
        url.searchParams.set('q', q);
        url.searchParams.set('format', 'json');
        url.searchParams.set('limit', '1');
        if (country) url.searchParams.set('countrycodes', country);
        const response = await fetch(url.toString(), {
          headers: { 'User-Agent': 'HydrogenRO-CRM/1.0 (maps-link-resolve)' },
        });
        if (!response.ok) continue;
        const data = await response.json();
        const lat = parseFloat(data?.[0]?.lat);
        const lng = parseFloat(data?.[0]?.lon);
        if (validLatLng(lat, lng)) return { latitude: lat, longitude: lng };
      } catch {
        /* try next */
      }
    }
  }
  return null;
}

/** Geocode a named place when the short link has no !3d/!4d coordinates. */
async function geocodePlaceNameWithGoogle(placeName) {
  if (!placeName) return null;
  const apiKey = getGoogleMapsServerKey();
  if (apiKey) {
    try {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      url.searchParams.set('address', placeName);
      url.searchParams.set('region', 'in');
      url.searchParams.set('key', apiKey);
      const response = await fetch(url.toString(), {
        headers: {
          Referer: 'https://hydrogenro.com/',
          'User-Agent': 'HydrogenRO-CRM/1.0',
        },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'OK' && data.results?.[0]?.geometry?.location) {
          const { lat, lng } = data.results[0].geometry.location;
          if (validLatLng(lat, lng)) return { latitude: lat, longitude: lng };
        }
      }
    } catch {
      /* try Places / Nominatim */
    }
    try {
      const url = new URL('https://maps.googleapis.com/maps/api/place/findplacefromtext/json');
      url.searchParams.set('input', placeName);
      url.searchParams.set('inputtype', 'textquery');
      url.searchParams.set('fields', 'geometry,name');
      url.searchParams.set('region', 'in');
      url.searchParams.set('key', apiKey);
      const response = await fetch(url.toString(), {
        headers: {
          Referer: 'https://hydrogenro.com/',
          'User-Agent': 'HydrogenRO-CRM/1.0',
        },
      });
      if (response.ok) {
        const data = await response.json();
        const loc = data?.candidates?.[0]?.geometry?.location;
        if (loc && validLatLng(loc.lat, loc.lng)) {
          return { latitude: loc.lat, longitude: loc.lng };
        }
      }
    } catch {
      /* Nominatim */
    }
  }
  return geocodePlaceNameNominatim(placeName);
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
    host === 'g.co' ||
    host === 'share.google' ||
    host.endsWith('.share.google') ||
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
    if (
      host === 'maps.app.goo.gl' ||
      host === 'goo.gl' ||
      host.endsWith('.goo.gl') ||
      host === 'g.co' ||
      host === 'share.google' ||
      host.endsWith('.share.google')
    ) {
      return true;
    }
    if (host === 'maps.google.com' || host.endsWith('.maps.google.com')) return true;
    return host.includes('google.') && (u.pathname.includes('/maps') || u.searchParams.has('cid'));
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

function tryCoordPair(latRaw, lngRaw, minDecimals = 1) {
  const latitude = parseFloat(latRaw);
  const longitude = parseFloat(lngRaw);
  if (!validLatLng(latitude, longitude)) return null;
  const latFrac = String(latRaw).split('.')[1] || '';
  const lngFrac = String(lngRaw).split('.')[1] || '';
  if (latFrac.length < minDecimals || lngFrac.length < minDecimals) return null;
  return { latitude, longitude };
}

function extractCoordinatesFromUrl(url, minDecimals = 1) {
  const value = normalizeUrlForParsing(url);
  if (!value) return null;

  const patterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g,
    /\/place\/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /\/search\/(-?\d+(?:\.\d+)?),\+?(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&]query=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&]ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&]center=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&]destination=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /!8m2!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
  ];

  const preciseMatches = [...value.matchAll(patterns[0])];
  if (preciseMatches.length > 0) {
    const last = preciseMatches[preciseMatches.length - 1];
    const coords = tryCoordPair(last[1], last[2], minDecimals);
    if (coords) return coords;
  }

  for (let i = 1; i < patterns.length; i += 1) {
    const match = value.match(patterns[i]);
    if (match) {
      const coords = tryCoordPair(match[1], match[2], minDecimals);
      if (coords) return coords;
    }
  }

  return null;
}

function extractCoordinatesFromHtml(html) {
  const blob = decodeHtmlEntities(String(html || ''));
  if (!blob) return null;
  const fromUrl = extractCoordinatesFromUrl(blob, 3);
  if (fromUrl) return fromUrl;

  const pairs = [];
  const push = (latRaw, lngRaw) => {
    const latitude = parseFloat(latRaw);
    const longitude = parseFloat(lngRaw);
    if (!validLatLng(latitude, longitude)) return;
    if (!String(latRaw).includes('.') || String(latRaw).split('.')[1].length < 3) return;
    if (!String(lngRaw).includes('.') || String(lngRaw).split('.')[1].length < 3) return;
    pairs.push({ latitude, longitude });
  };

  for (const match of blob.matchAll(/\[null,null,(-?\d+\.\d+),(-?\d+\.\d+)\]/g)) {
    push(match[1], match[2]);
  }
  for (const match of blob.matchAll(/\[\[\[(-?\d+\.\d+),(-?\d+\.\d+)\]/g)) {
    push(match[1], match[2]);
  }
  for (const match of blob.matchAll(/"lat(?:itude)?"\s*:\s*(-?\d+\.\d+)\s*,\s*"lng(?:itude)?"\s*:\s*(-?\d+\.\d+)/gi)) {
    push(match[1], match[2]);
  }
  for (const match of blob.matchAll(/itemprop="latitude"\s+content="(-?\d+\.\d+)"[\s\S]{0,80}itemprop="longitude"\s+content="(-?\d+\.\d+)"/gi)) {
    push(match[1], match[2]);
  }
  for (const match of blob.matchAll(/@(-?\d+\.\d+),(-?\d+\.\d+)/g)) {
    push(match[1], match[2]);
  }
  for (const match of blob.matchAll(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/g)) {
    push(match[1], match[2]);
  }
  return preferIndiaPair(pairs);
}

function cleanMapsTitle(raw) {
  return decodeHtmlEntities(String(raw || ''))
    .replace(/\s*[-–|•]\s*Google Maps.*$/i, '')
    .replace(/\s*[-–|•]\s*Google\.com.*$/i, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isUsefulPlaceName(name) {
  const n = String(name || '').trim();
  if (n.length < 3 || n.length > 180) return false;
  if (/^(google maps|before you continue|consent|welcome to google)$/i.test(n)) return false;
  if (/[{}\[\]<>]|new Set|function\(|pda=|https?:/i.test(n)) return false;
  return /[a-zA-Z\u00C0-\u024F\u0900-\u097F]/.test(n);
}

function extractPlaceNameFromHtml(html) {
  const blob = String(html || '');
  const og =
    blob.match(/property="og:title"\s+content="([^"]+)"/i) ||
    blob.match(/content="([^"]+)"\s+property="og:title"/i);
  if (og) {
    const name = cleanMapsTitle(og[1]);
    if (isUsefulPlaceName(name)) return name;
  }
  const title = blob.match(/<title>([^<]+)<\/title>/i);
  if (title) {
    const name = cleanMapsTitle(title[1]);
    if (isUsefulPlaceName(name)) return name;
  }
  return extractPlaceNameFromUrl(blob);
}

function requestHeaders(userAgent) {
  return {
    'User-Agent': userAgent,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-IN,en;q=0.9',
    Cookie:
      'CONSENT=YES+cb.20210328-17-p0.en+F+123; SOCS=CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjQwMzA1LjA3X3AxGgJlbiACGgYIgA',
  };
}

function unwrapGoogleUrlWrapper(url) {
  let current = String(url || '').trim();
  for (let i = 0; i < 5; i += 1) {
    try {
      const u = new URL(current);
      let next = null;
      if (u.pathname === '/url' || u.pathname === '/urlj') {
        next = u.searchParams.get('q') || u.searchParams.get('url');
      }
      if (
        !next &&
        (u.hostname.includes('accounts.google.com') || u.hostname.includes('consent.google.com'))
      ) {
        next =
          u.searchParams.get('continue') ||
          u.searchParams.get('continueUrl') ||
          u.searchParams.get('ss_prefers');
      }
      if (!next) break;
      try {
        next = decodeURIComponent(next);
      } catch {
        /* already decoded */
      }
      if (!isMapsDestinationUrl(next) && !isAllowedMapsUrl(next)) break;
      current = next;
    } catch {
      break;
    }
  }
  return current;
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/\\u003d/gi, '=')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003a/gi, ':')
    .replace(/\\u002f/gi, '/')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0*61;/g, '=')
    .replace(/&#x3d;/gi, '=')
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

function isShortMapsUrl(url) {
  const value = String(url || '');
  return (
    value.includes('maps.app.goo.gl') ||
    value.includes('goo.gl/maps') ||
    value.includes('share.google/') ||
    /\/\/g\.co\//i.test(value)
  );
}

function pickBetterExpandedUrl(current, candidate) {
  if (!candidate) return current;
  const wrapped = unwrapGoogleUrlWrapper(candidate);
  if (isShortMapsUrl(wrapped)) return current;
  const wrappedCoords = extractCoordinatesFromUrl(wrapped);
  const currentCoords = extractCoordinatesFromUrl(current);
  if (wrappedCoords && !currentCoords) return wrapped;
  if (!current || isShortMapsUrl(current)) return wrapped;
  if (wrapped.includes('/place/') && wrapped.length > String(current).length) return wrapped;
  return current;
}

function matchPatternAll(html, pattern) {
  if (pattern.global) return [...html.matchAll(pattern)];
  const single = html.match(pattern);
  return single ? [single] : [];
}

function extractMapsUrlFromHtml(html) {
  if (!html || typeof html !== 'string') return null;

  const es5Match = html.match(/ES5DGURL\s*=\s*['"](\/maps\/[^'"]+)['"]/i);
  if (es5Match) {
    const fromEs5 = decodeHtmlEntities(
      `https://www.google.com${es5Match[1].replace(/\\x3d/g, '=').replace(/\\\//g, '/')}`
    );
    if (fromEs5.includes('google.com/maps')) return fromEs5;
  }

  const continueUrl = extractContinueUrlFromHtml(html);
  if (continueUrl && extractCoordinatesFromUrl(continueUrl)) return continueUrl;

  const candidates = [];
  const patterns = [
    /property="og:url"\s+content="([^"]+)"/gi,
    /content="([^"]+)"\s+property="og:url"/gi,
    /rel="canonical"\s+href="([^"]+)"/gi,
    /href="(https:\/\/(?:www\.)?google\.com\/maps[^"]+)"/gi,
    /"(https:\/\/(?:www\.)?google\.com\/maps[^"]+)"/gi,
  ];

  for (const pattern of patterns) {
    const matches = matchPatternAll(html, pattern);
    for (const match of matches) {
      const candidate = decodeHtmlEntities(match[1] || match[0] || '');
      if (candidate.includes('google.com/maps')) {
        candidates.push(candidate);
      }
    }
  }

  const htmlCoords = extractCoordinatesFromHtml(html);
  if (htmlCoords) {
    return `https://www.google.com/maps?q=${htmlCoords.latitude},${htmlCoords.longitude}`;
  }

  for (const candidate of candidates) {
    if (extractCoordinatesFromUrl(candidate)) return candidate;
  }

  const named = candidates.find((c) => /\/place\/[^/@?]+/i.test(c) && extractPlaceNameFromUrl(c));
  return named || candidates[0] || null;
}

let lastFollowMeta = { placeName: null, coords: null };

function noteFollowMeta(html, url) {
  const coords = extractCoordinatesFromUrl(url) || extractCoordinatesFromHtml(html);
  const placeName = extractPlaceNameFromUrl(url) || extractPlaceNameFromHtml(html);
  if (coords) lastFollowMeta.coords = coords;
  if (placeName) lastFollowMeta.placeName = placeName;
}

async function fetchWithManualRedirects(startUrl, userAgent) {
  let current = startUrl;

  for (let i = 0; i < MAX_REDIRECTS; i++) {
    current = unwrapGoogleUrlWrapper(current);

    const response = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      headers: requestHeaders(userAgent),
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
        lastFollowMeta.coords = extractCoordinatesFromUrl(finalUrl);
        lastFollowMeta.placeName = extractPlaceNameFromUrl(finalUrl) || lastFollowMeta.placeName;
        return finalUrl;
      }

      const html = await response.text();
      noteFollowMeta(html, finalUrl);
      const fromHtml = extractMapsUrlFromHtml(html);
      if (fromHtml) {
        noteFollowMeta(html, fromHtml);
        return fromHtml;
      }

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
      headers: requestHeaders(userAgent),
    });

    const finalUrl = unwrapGoogleUrlWrapper(response.url || startUrl);
    if (extractCoordinatesFromUrl(finalUrl)) {
      lastFollowMeta.coords = extractCoordinatesFromUrl(finalUrl);
      lastFollowMeta.placeName = extractPlaceNameFromUrl(finalUrl) || lastFollowMeta.placeName;
      return finalUrl;
    }

    const html = await response.text();
    noteFollowMeta(html, finalUrl);
    const fromHtml = extractMapsUrlFromHtml(html);
    if (fromHtml) noteFollowMeta(html, fromHtml);
    return fromHtml || finalUrl;
  } catch {
    return startUrl;
  }
}

async function followRedirects(startUrl) {
  const cleaned = sanitizeUrl(startUrl);
  const hasQuery = cleaned.includes('?');
  const variants = [
    cleaned,
    `${cleaned}${hasQuery ? '&' : '?'}_imcp=1`,
    `${cleaned}${hasQuery ? '&' : '?'}g_st=ic`,
  ];
  lastFollowMeta = { placeName: null, coords: null };
  let best = unwrapGoogleUrlWrapper(cleaned);

  for (const variant of variants) {
    for (const userAgent of USER_AGENTS) {
      try {
        const automatic = await fetchWithAutoRedirects(variant, userAgent);
        best = pickBetterExpandedUrl(best, automatic);
        if (extractCoordinatesFromUrl(automatic) || lastFollowMeta.coords) {
          return lastFollowMeta.coords
            ? `https://www.google.com/maps?q=${lastFollowMeta.coords.latitude},${lastFollowMeta.coords.longitude}`
            : automatic;
        }
        if (!isShortMapsUrl(automatic) && extractPlaceNameFromUrl(automatic)) return automatic;
      } catch {
        // try next strategy
      }

      try {
        const manual = await fetchWithManualRedirects(variant, userAgent);
        best = pickBetterExpandedUrl(best, manual);
        if (extractCoordinatesFromUrl(manual) || lastFollowMeta.coords) {
          return lastFollowMeta.coords
            ? `https://www.google.com/maps?q=${lastFollowMeta.coords.latitude},${lastFollowMeta.coords.longitude}`
            : manual;
        }
        if (!isShortMapsUrl(manual) && extractPlaceNameFromUrl(manual)) return manual;
      } catch {
        // try next strategy
      }
    }
  }

  return best;
}

function extractPlaceNameFromUrl(url) {
  try {
    const parsed = normalizeUrlForParsing(url);
    const placeMatch = parsed.match(/\/place\/([^/@?]+)/);
    if (placeMatch) {
      const raw = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')).trim();
      if (raw && !/^-?\d/.test(raw) && isUsefulPlaceName(raw)) return raw;
    }
    try {
      const u = new URL(parsed);
      const q = u.searchParams.get('q') || u.searchParams.get('query');
      if (q) {
        const cleaned = decodeURIComponent(String(q).replace(/\+/g, ' ')).trim();
        if (!/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(cleaned) && isUsefulPlaceName(cleaned)) {
          return cleaned;
        }
      }
    } catch {
      /* ignore */
    }
    return null;
  } catch {
    return null;
  }
}

async function resolveMapsUrl(inputUrl) {
  const expandedUrl = await followRedirects(inputUrl);
  const coords =
    lastFollowMeta.coords || extractCoordinatesFromUrl(expandedUrl);
  const stillShort = isShortMapsUrl(expandedUrl);
  const placeName =
    lastFollowMeta.placeName || extractPlaceNameFromUrl(expandedUrl);

  return { expandedUrl, coords, stillShort, placeName };
}

function extractMapsUrlFromText(text) {
  const trimmed = sanitizeUrl(text);
  if (!trimmed) return null;
  const MAPS_URL_REGEX =
    /(?:https?:\/\/)?(?:www\.)?(?:google\.[^/\s]+\/maps\S*|maps\.google\.[^/\s]+\S*|maps\.app\.goo\.gl\/\S+|goo\.gl\/maps\/\S+|share\.google\/\S+|g\.co\/\S+)/i;
  const match = trimmed.match(MAPS_URL_REGEX);
  if (!match) return null;
  let url = match[0]
    .replace(/[)>\].,;'"*_~]+$/g, '')
    .replace(/\*+$/g, '');
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

function extractPlaceHintFromShareText(text) {
  const cleaned = sanitizeUrl(text);
  if (!cleaned) return null;
  const url = extractMapsUrlFromText(cleaned);
  const withoutUrl = url ? cleaned.replace(url, '').trim() : cleaned;
  const lines = withoutUrl
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 2 && !line.startsWith('http'));
  const candidates = lines.filter(
    (line) =>
      !/^[\d\s\-+()]+$/.test(line) &&
      !/^maps\.app\.goo\.gl/i.test(line) &&
      line.length <= 200
  );
  if (candidates.length === 0) return null;
  const hint = candidates.slice(0, 2).join(', ');
  if (/bengaluru|bangalore|karnataka/i.test(hint)) return hint;
  return `${hint}, Bengaluru, Karnataka`;
}

/**
 * Resolve a pasted Maps URL or WhatsApp share (place name + short link) to lat/lng.
 * Used by CRM fetch-location, booking bot, and inbox apply-to-customer.
 */
async function resolveMapsShareToCoords(text) {
  const shareText = String(text || '');
  const inputUrl = extractMapsUrlFromText(shareText);
  if (!inputUrl) {
    return { ok: false, error: 'No Google Maps link found' };
  }
  if (!isAllowedMapsUrl(inputUrl)) {
    return { ok: false, error: 'Invalid Google Maps URL' };
  }

  const shareHint = extractPlaceHintFromShareText(shareText);
  let expandedUrl = inputUrl;
  let coords = extractCoordinatesFromUrl(inputUrl);
  let stillShort = isShortMapsUrl(inputUrl);
  let placeName = extractPlaceNameFromUrl(inputUrl) || shareHint || null;

  if (!coords || stillShort) {
    try {
      const resolved = await resolveMapsUrl(inputUrl);
      expandedUrl = resolved.expandedUrl || expandedUrl;
      coords = resolved.coords || coords;
      stillShort = resolved.stillShort;
      placeName = resolved.placeName || placeName;
    } catch (err) {
      console.warn('[resolve-maps-link] follow error', err?.message || err);
    }
  }

  if (!coords && placeName) {
    coords = await geocodePlaceNameWithGoogle(placeName);
  }
  if (!coords && shareHint && shareHint !== placeName) {
    coords = await geocodePlaceNameWithGoogle(shareHint);
  }

  if (!coords) {
    return {
      ok: false,
      error:
        'Could not read this Maps link. Paste the full Google Maps share (place name + link), or send a location pin.',
      expandedUrl,
      originalUrl: inputUrl,
      placeName: placeName || undefined,
    };
  }

  return {
    ok: true,
    latitude: coords.latitude,
    longitude: coords.longitude,
    expandedUrl,
    originalUrl: inputUrl,
    placeName: placeName || null,
  };
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
    let expandedUrl = inputUrl;
    let coords = null;
    let stillShort = true;
    let placeName = null;

    try {
      ({ expandedUrl, coords, stillShort, placeName } = await resolveMapsUrl(inputUrl));
    } catch (resolveError) {
      console.error('resolve-maps-link follow error:', resolveError);
      expandedUrl = sanitizeUrl(inputUrl);
      stillShort = isShortMapsUrl(expandedUrl);
      placeName = extractPlaceNameFromUrl(expandedUrl);
    }

    if (!coords && placeName) {
      coords = await geocodePlaceNameWithGoogle(placeName);
    }

    if (!coords) {
      if (placeName) {
        return jsonResponse(200, corsHeaders, {
          expandedUrl,
          originalUrl: inputUrl,
          placeName,
        });
      }

      return jsonResponse(422, corsHeaders, {
        error:
          'Could not expand this short link from Google. If you shared from Maps, copy the whole share text (place name + link), not just the URL.',
        expandedUrl,
        originalUrl: inputUrl,
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
    const placeName = extractPlaceNameFromUrl(inputUrl);
    return jsonResponse(422, corsHeaders, {
      error: 'Could not resolve this link. Try pasting the full Google Maps share (place name + link).',
      expandedUrl: inputUrl,
      originalUrl: inputUrl,
      ...(placeName ? { placeName } : {}),
    });
  }
};

exports.extractCoordinatesFromUrl = extractCoordinatesFromUrl;
exports.extractMapsUrlFromText = extractMapsUrlFromText;
exports.extractPlaceHintFromShareText = extractPlaceHintFromShareText;
exports.isShortMapsUrl = isShortMapsUrl;
exports.followRedirects = followRedirects;
exports.resolveMapsShareToCoords = resolveMapsShareToCoords;
