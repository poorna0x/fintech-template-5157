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
      headers: corsHeaders,
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
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Parse request body
    const { password } = JSON.parse(event.body || '{}');

    // Validate input
    if (!password || typeof password !== 'string') {
      return {
        statusCode: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
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

