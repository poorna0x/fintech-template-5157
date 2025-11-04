// Netlify Function for secure technician password hashing
// Uses bcrypt for secure password hashing
const bcrypt = require('bcryptjs');
const { getCorsHeaders, isOriginAllowed } = require('./cors-helper');
const { rateLimiters } = require('./rate-limiter');

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

  // SECURITY: Rate limiting (DoS protection - bcrypt is CPU-intensive)
  const rateLimitResult = rateLimiters.hashing(event);
  if (rateLimitResult) {
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
      headers: addSecurityHeaders({
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Allow': 'POST',
      }),
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
          error: 'Invalid JSON in request body',
        }),
      };
    }

    const { password } = parsedBody;

    // SECURITY: Validate input types and presence
    if (!password || typeof password !== 'string' || password.trim() === '') {
      return {
        statusCode: 400,
        headers: addSecurityHeaders({
          ...corsHeaders,
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          error: 'Missing or invalid password field',
        }),
      };
    }

    // Hash password using bcrypt with salt rounds of 10
    // Higher rounds = more secure but slower
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        hashedPassword: hashedPassword,
      }),
    };
  } catch (error) {
    console.error('Password hashing error:', error);
    return {
      statusCode: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      }),
    };
  }
};

