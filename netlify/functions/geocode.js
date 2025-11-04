// Netlify Function for geocoding (address lookup)
const { getCorsHeaders, isOriginAllowed } = require('./cors-helper');

exports.handler = async (event, context) => {
  const requestOrigin = event.headers.origin || event.headers.Origin;
  const corsHeaders = getCorsHeaders(requestOrigin);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  // SECURITY: Check if origin is allowed
  if (requestOrigin && !isOriginAllowed(requestOrigin)) {
    return {
      statusCode: 403,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: 'Forbidden: Origin not allowed',
      }),
    };
  }

  // Only allow GET and POST requests
  if (!['GET', 'POST'].includes(event.httpMethod)) {
    return {
      statusCode: 405,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    let lat, lon, query;

    if (event.httpMethod === 'GET') {
      // For reverse geocoding (coordinates to address)
      const params = new URLSearchParams(event.queryStringParameters || {});
      lat = params.get('lat');
      lon = params.get('lon');
      
      if (!lat || !lon) {
        return {
          statusCode: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ error: 'Missing lat or lon parameters' }),
        };
      }
    } else {
      // For forward geocoding (address to coordinates)
      const { query: searchQuery } = JSON.parse(event.body);
      query = searchQuery;
      
      if (!query) {
        return {
          statusCode: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ error: 'Missing query parameter' }),
        };
      }
    }

    let url;
    if (lat && lon) {
      // Reverse geocoding
      url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&extratags=1&namedetails=1&accept-language=en`;
    } else {
      // Forward geocoding
      url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=in&limit=5&addressdetails=1`;
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'HydrogenRO/1.0 (contact@hydrogenro.com)'
      }
    });

    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.status}`);
    }

    const data = await response.json();

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    };

  } catch (error) {
    console.error('Geocoding error:', error);
    
    return {
      statusCode: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        error: 'Geocoding failed',
        details: error.message 
      }),
    };
  }
};
