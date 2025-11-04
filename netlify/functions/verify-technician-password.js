// Netlify Function for secure technician password verification
// Uses bcrypt for secure password hashing and comparison
const bcrypt = require('bcryptjs');

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Parse request body
    const { password, hashedPassword } = JSON.parse(event.body || '{}');

    // Validate input
    if (!password || !hashedPassword) {
      return {
        statusCode: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          verified: false,
          error: 'Missing required fields: password and hashedPassword',
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

