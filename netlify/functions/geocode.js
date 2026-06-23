// Netlify Function for geocoding (Nominatim proxy) — staff-only, rate-limited.
const { getCorsHeaders, isOriginAllowed, isProduction } = require('./cors-helper');
const { checkRateLimit } = require('./rate-limiter');
const { addSecurityHeaders } = require('./security-headers');
const { verifyStaffBearerToken, readAccessTokenFromEvent } = require('./admin-auth-guard');

const MAX_QUERY_LEN = 300;

function jsonResponse(statusCode, corsHeaders, body) {
  return {
    statusCode,
    headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  };
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
      lat = params.lat;
      lon = params.lon;

      if (!lat || !lon) {
        return jsonResponse(400, corsHeaders, { error: 'Missing lat or lon parameters' });
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

    let url;
    if (lat && lon) {
      url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=18&addressdetails=1&extratags=1&namedetails=1&accept-language=en`;
    } else {
      url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=in&limit=5&addressdetails=1`;
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'HydrogenRO/1.0 (contact@hydrogenro.com)',
      },
    });

    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.status}`);
    }

    const data = await response.json();

    return {
      statusCode: 200,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    };
  } catch (error) {
    console.error('Geocoding error:', error);

    return jsonResponse(500, corsHeaders, {
      error: 'Geocoding failed',
    });
  }
};
