// Netlify Function for secure technician password verification
// Uses bcrypt for secure password hashing and comparison
const bcrypt = require('bcryptjs');
const { getCorsHeaders, isOriginAllowed } = require('./cors-helper');
const { rateLimiters } = require('./rate-limiter');
const { addSecurityHeaders } = require('./security-headers');

exports.handler = async (event, context) => {
  const requestOrigin = event.headers.origin || event.headers.Origin;
  const corsHeaders = getCorsHeaders(requestOrigin);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
        headers: addSecurityHeaders(corsHeaders),
      body: '',
    };
  }

  // SECURITY: Rate limiting (brute force protection)
  console.log('[Rate Limit] Checking rate limit...');
  const rateLimitResult = rateLimiters.password(event);
  console.log('[Rate Limit] Result:', rateLimitResult ? `BLOCKED (${rateLimitResult.statusCode})` : 'ALLOWED (null)');
  if (rateLimitResult) {
    console.log('[Rate Limit] Blocking request:', rateLimitResult.statusCode);
    return {
      ...rateLimitResult,
      headers: {
        ...rateLimitResult.headers,
        ...corsHeaders
      }
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
        headers: addSecurityHeaders(corsHeaders),
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // SECURITY: Validate request body exists
    if (!event.body || typeof event.body !== 'string') {
      return {
        statusCode: 400,
        headers: addSecurityHeaders({
          ...corsHeaders,
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          verified: false,
          error: 'Missing request body',
        }),
      };
    }

    // Parse request body
    let parsedBody;
    try {
      parsedBody = JSON.parse(event.body);
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: addSecurityHeaders({
          ...corsHeaders,
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          verified: false,
          error: 'Invalid JSON in request body',
        }),
      };
    }

    const { password, hashedPassword } = parsedBody;

    // SECURITY: Validate input types and presence
    if (!password || typeof password !== 'string' || password.trim() === '') {
      return {
        statusCode: 400,
        headers: addSecurityHeaders({
          ...corsHeaders,
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          verified: false,
          error: 'Missing or invalid password field',
        }),
      };
    }

    if (!hashedPassword || typeof hashedPassword !== 'string' || hashedPassword.trim() === '') {
      return {
        statusCode: 400,
        headers: addSecurityHeaders({
          ...corsHeaders,
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          verified: false,
          error: 'Missing or invalid hashedPassword field',
        }),
      };
    }

    // Verify password using bcrypt
    // bcrypt.compare() is secure against timing attacks
    const isMatch = await bcrypt.compare(password, hashedPassword);

    if (isMatch) {
      return {
        statusCode: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          verified: true,
        }),
      };
    } else {
      return {
        statusCode: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          verified: false,
          error: 'Invalid password',
        }),
      };
    }
  } catch (error) {
    console.error('Password verification error:', error);
    return {
      statusCode: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        verified: false,
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      }),
    };
  }
};

