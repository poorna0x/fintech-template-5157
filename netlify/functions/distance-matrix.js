// Netlify Function for Google Distance Matrix API
// Calculates distance and duration between multiple origins and destinations
// Optimized for free tier usage with caching
const { getCorsHeaders, isOriginAllowed } = require('./cors-helper');

// Simple in-memory cache (in production, use Redis or similar)
const distanceCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

// Generate cache key
function getCacheKey(origins, destinations, mode = 'driving') {
  return `${origins.join('|')}_${destinations.join('|')}_${mode}`;
}

// Check if cache entry is still valid
function isCacheValid(timestamp) {
  return Date.now() - timestamp < CACHE_TTL;
}

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

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
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
    console.log('📍 Distance Matrix function called:', {
      method: event.httpMethod,
      hasBody: !!event.body,
      bodyType: typeof event.body,
      bodyLength: event.body?.length || 0,
      bodyPreview: typeof event.body === 'string' ? event.body.substring(0, 200) : 'N/A'
    });

    // Parse request body - handle both string and already parsed
    let bodyData;
    if (typeof event.body === 'string') {
      try {
        bodyData = JSON.parse(event.body);
        console.log('✅ Parsed request body:', {
          hasOrigins: !!bodyData.origins,
          originsCount: bodyData.origins?.length || 0,
          hasDestinations: !!bodyData.destinations,
          destinationsCount: bodyData.destinations?.length || 0,
          hasApiKey: !!bodyData.apiKey,
          mode: bodyData.mode
        });
      } catch (parseError) {
        console.error('❌ Failed to parse request body:', parseError);
        console.error('Raw body:', event.body);
        return {
          statusCode: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            error: 'Invalid JSON in request body',
            details: parseError.message 
          }),
        };
      }
    } else {
      bodyData = event.body;
    }

    const { origins, destinations, mode = 'driving', apiKey } = bodyData;

    if (!origins || !Array.isArray(origins) || origins.length === 0) {
      return {
        statusCode: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Missing or invalid origins array' }),
      };
    }

    if (!destinations || !Array.isArray(destinations) || destinations.length === 0) {
      return {
        statusCode: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Missing or invalid destinations array' }),
      };
    }

    if (!apiKey) {
      return {
        statusCode: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Missing Google Maps API key' }),
      };
    }

    // Check cache first
    const cacheKey = getCacheKey(origins, destinations, mode);
    const cached = distanceCache.get(cacheKey);
    if (cached && isCacheValid(cached.timestamp)) {
      return {
        statusCode: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...cached.data,
          cached: true,
        }),
      };
    }

    // Format origins and destinations for Google API
    // Accept both "lat,lng" strings and {lat, lng} objects
    const formatLocation = (loc) => {
      if (typeof loc === 'string') return loc;
      if (loc.latitude && loc.longitude) return `${loc.latitude},${loc.longitude}`;
      if (loc.lat && loc.lng) return `${loc.lat},${loc.lng}`;
      return null;
    };

    const formattedOrigins = origins.map(formatLocation).filter(Boolean);
    const formattedDestinations = destinations.map(formatLocation).filter(Boolean);

    if (formattedOrigins.length === 0 || formattedDestinations.length === 0) {
      return {
        statusCode: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Invalid location format' }),
      };
    }

    // Google Distance Matrix API endpoint
    // Free tier: 40,000 elements per month
    // Each request can have up to 25 origins × 25 destinations = 625 elements
    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
    url.searchParams.append('origins', formattedOrigins.join('|'));
    url.searchParams.append('destinations', formattedDestinations.join('|'));
    url.searchParams.append('mode', mode); // driving, walking, bicycling, transit
    url.searchParams.append('units', 'metric'); // metric or imperial
    url.searchParams.append('key', apiKey);

    console.log('🌐 Calling Google Distance Matrix API:', {
      originsCount: formattedOrigins.length,
      destinationsCount: formattedDestinations.length,
      mode: mode,
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey?.length || 0
    });

    const response = await fetch(url.toString());
    
    console.log('📡 Google API response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    if (!response.ok) {
      throw new Error(`Google Distance Matrix API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return {
        statusCode: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          error: 'Distance Matrix API error',
          status: data.status,
          error_message: data.error_message,
        }),
      };
    }

    // Process and format the response
    const results = {
      status: data.status,
      origins: data.origin_addresses || [],
      destinations: data.destination_addresses || [],
      rows: data.rows.map((row, originIndex) => ({
        originIndex,
        elements: row.elements.map((element, destIndex) => ({
          destinationIndex: destIndex,
          status: element.status,
          distance: element.distance
            ? {
                value: element.distance.value, // in meters
                text: element.distance.text, // human-readable
              }
            : null,
          duration: element.duration
            ? {
                value: element.duration.value, // in seconds
                text: element.duration.text, // human-readable
              }
            : null,
          duration_in_traffic: element.duration_in_traffic
            ? {
                value: element.duration_in_traffic.value,
                text: element.duration_in_traffic.text,
              }
            : null,
        })),
      })),
      cached: false,
    };

    // Cache the result
    distanceCache.set(cacheKey, {
      data: results,
      timestamp: Date.now(),
    });

    // Clean up old cache entries (keep cache size manageable)
    if (distanceCache.size > 100) {
      const now = Date.now();
      for (const [key, value] of distanceCache.entries()) {
        if (!isCacheValid(value.timestamp)) {
          distanceCache.delete(key);
        }
      }
    }

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(results),
    };

  } catch (error) {
    console.error('Distance Matrix error:', error);
    console.error('Error stack:', error.stack);

    return {
      statusCode: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: 'Distance calculation failed',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      }),
    };
  }
};

