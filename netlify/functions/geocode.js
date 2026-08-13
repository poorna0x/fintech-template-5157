// Netlify Function for geocoding via Google Geocoding API — staff-only, rate-limited.
const { getCorsHeaders, isOriginAllowed, shouldRejectMissingOrigin } = require('./cors-helper');
const { checkRateLimit } = require('./rate-limiter');
const { addSecurityHeaders } = require('./security-headers');
const { verifyStaffBearerToken, readAccessTokenFromEvent } = require('./admin-auth-guard');

const MAX_QUERY_LEN = 300;

const trim = (s) => (s && typeof s === 'string' ? s.trim() : '');

function getGoogleMapsServerKey() {
  return trim(process.env.GOOGLE_MAPS_API_KEY) || trim(process.env.VITE_GOOGLE_MAPS_API_KEY) || null;
}

function jsonResponse(statusCode, corsHeaders, body) {
  return {
    statusCode,
    headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  };
}

function parseCoord(value) {
  const n = parseFloat(String(value ?? '').trim());
  if (!Number.isFinite(n)) return null;
  return n;
}

function isValidLatLng(lat, lon) {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/** Nominatim-compatible shape for existing callers: [{ lat, lon, display_name }] */
function mapGoogleResults(results) {
  if (!Array.isArray(results)) return [];
  return results.map((r) => ({
    lat: String(r.geometry.location.lat),
    lon: String(r.geometry.location.lng),
    display_name: r.formatted_address,
    place_id: r.place_id,
  }));
}

async function googleGeocodeRequest(params) {
  const apiKey = getGoogleMapsServerKey();
  if (!apiKey) {
    throw new Error('Geocoding is not configured (set GOOGLE_MAPS_API_KEY on Netlify)');
  }

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set('key', apiKey);

  const response = await fetch(url.toString(), {
    headers: {
      Referer: 'https://hydrogenro.com/',
      'User-Agent': 'HydrogenRO-CRM/1.0',
    },
  });
  if (!response.ok) {
    throw new Error(`Google Geocoding API error: ${response.status}`);
  }

  const data = await response.json();
  if (data.status === 'ZERO_RESULTS') return [];
  if (data.status !== 'OK') {
    throw new Error(data.error_message || `Google Geocoding status: ${data.status}`);
  }

  return mapGoogleResults(data.results);
}

async function nominatimGeocode(query) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'in');
  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'HydrogenRO-CRM/1.0 (geocode)',
      Accept: 'application/json',
    },
  });
  if (!response.ok) return [];
  const data = await response.json();
  if (!Array.isArray(data) || !data[0]) return [];
  return [
    {
      lat: String(data[0].lat),
      lon: String(data[0].lon),
      display_name: data[0].display_name,
    },
  ];
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

  if (!['GET', 'POST'].includes(event.httpMethod)) {
    return jsonResponse(405, corsHeaders, { error: 'Method not allowed' });
  }

  const rateLimit = checkRateLimit(event, {
    maxRequests: 30,
    windowMs: 60_000,
    endpoint: 'geocode',
  });
  if (!rateLimit.allowed) {
    return jsonResponse(429, corsHeaders, {
      error: 'Too many requests. Please try again shortly.',
    });
  }

  let body = {};
  if (event.httpMethod === 'POST') {
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return jsonResponse(400, corsHeaders, { error: 'Invalid JSON' });
    }
  }

  const token = readAccessTokenFromEvent(event, body);
  const auth = await verifyStaffBearerToken(token);
  if (!auth.ok) {
    const status = auth.error === 'Unauthorized' ? 401 : 403;
    return jsonResponse(status, corsHeaders, { error: auth.error || 'Forbidden' });
  }

  try {
    let lat;
    let lon;
    let query;

    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      lat = parseCoord(params.lat);
      lon = parseCoord(params.lon);

      if (lat === null || lon === null) {
        return jsonResponse(400, corsHeaders, { error: 'Missing or invalid lat/lon parameters' });
      }
      if (!isValidLatLng(lat, lon)) {
        return jsonResponse(400, corsHeaders, { error: 'Invalid lat/lon range' });
      }
    } else {
      query = typeof body.query === 'string' ? body.query.trim() : '';
      if (!query) {
        return jsonResponse(400, corsHeaders, { error: 'Missing query parameter' });
      }
      if (query.length > MAX_QUERY_LEN) {
        return jsonResponse(400, corsHeaders, { error: 'Query too long' });
      }
    }

    let data = [];
    try {
      data =
        lat !== undefined && lon !== undefined
          ? await googleGeocodeRequest({ latlng: `${lat},${lon}`, region: 'in' })
          : await googleGeocodeRequest({ address: query, region: 'in' });
    } catch (googleErr) {
      console.warn('Google geocode failed, trying Nominatim:', googleErr?.message || googleErr);
      if (query) data = await nominatimGeocode(query);
    }

    if ((!data || !data.length) && query) {
      data = await nominatimGeocode(query);
    }

    return {
      statusCode: 200,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    };
  } catch (error) {
    console.error('Geocoding error:', error);
    const message = error instanceof Error ? error.message : 'Geocoding failed';
    if (message.includes('not configured')) {
      return jsonResponse(503, corsHeaders, { error: message });
    }
    return jsonResponse(500, corsHeaders, { error: 'Geocoding failed' });
  }
};
