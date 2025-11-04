// Netlify Function for ALTCHA server-side verification using official altcha-lib
// Polyfill Web Crypto API for Node 18 compatibility
const nodeCrypto = require('crypto');
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = {
    getRandomValues: (arr) => {
      const bytes = nodeCrypto.randomBytes(arr.length);
      for (let i = 0; i < arr.length; i++) {
        arr[i] = bytes[i];
      }
      return arr;
    },
    subtle: {
      digest: async (algorithm, data) => {
        const hash = nodeCrypto.createHash(algorithm.toLowerCase().replace('-', ''));
        return hash.update(Buffer.from(data)).digest();
      }
    }
  };
  console.log('✅ Web Crypto API polyfilled');
}

let createChallenge, verifySolution;
try {
  const altchaLib = require('altcha-lib');
  createChallenge = altchaLib.createChallenge;
  verifySolution = altchaLib.verifySolution;
  console.log('✅ altcha-lib loaded successfully');
} catch (error) {
  console.error('❌ Error loading altcha-lib:', error.message);
  console.error('Stack:', error.stack);
  throw error;
}

// HMAC key for signing challenges
// IMPORTANT: In production, ALWAYS use ALTCHA_HMAC_KEY environment variable!
// Generate a secure 64-byte key: openssl rand -hex 32
// This is a placeholder only - NEVER use in production without env var
const HMAC_KEY = process.env.ALTCHA_HMAC_KEY || 'PLACEHOLDER-DO-NOT-USE-IN-PRODUCTION-GENERATE-REAL-KEY';

// SECURITY: Warn if using placeholder key in production
if (process.env.CONTEXT === 'production' && HMAC_KEY === 'PLACEHOLDER-DO-NOT-USE-IN-PRODUCTION-GENERATE-REAL-KEY') {
  console.error('⚠️ SECURITY WARNING: Using placeholder HMAC key in production!');
  console.error('⚠️ Set ALTCHA_HMAC_KEY environment variable in Netlify dashboard');
  console.error('⚠️ Generate key with: openssl rand -hex 32');
}

// Simple in-memory store for challenges (in production, use Redis or database)
const challengeStore = new Map();

const { getCorsHeaders, isOriginAllowed } = require('./cors-helper');
const { rateLimiters } = require('./rate-limiter');

// GET request: Generate challenge using official altcha-lib
async function handleGet(event, corsHeaders) {
  try {
    // SECURITY: Validate and limit complexity to prevent DoS attacks
    let complexity = parseInt(event.queryStringParameters?.complexity || '14', 10);
    
    // Clamp complexity between 10 and 16 to prevent resource exhaustion
    // Too low ( < 10): Too easy to solve, defeats purpose
    // Too high ( > 16): Could cause DoS by consuming too much CPU
    if (isNaN(complexity) || complexity < 10) {
      complexity = 10;
    } else if (complexity > 16) {
      complexity = 16;
    }
    
    // Create challenge using official altcha-lib
    const challenge = await createChallenge({
      algorithm: 'SHA-256',
      maxnumber: Math.pow(2, complexity),
      expires: new Date(Date.now() + 20 * 60 * 1000), // 20 minutes from now (ALTCHA recommendation)
      hmacKey: HMAC_KEY,
    });

    // Ensure all required fields are present
    // ALTCHA widget requires: algorithm, challenge, salt, signature, maxnumber
    const response = {
      algorithm: challenge.algorithm,
      challenge: challenge.challenge,
      salt: challenge.salt,
      signature: challenge.signature,
      maxnumber: challenge.maxnumber,
    };

    // Store challenge for verification and replay attack prevention
    challengeStore.set(challenge.salt, {
      challenge: challenge.challenge,
      salt: challenge.salt,
      expires: Date.now() + 20 * 60 * 1000, // 20 minutes
      used: false, // Track if challenge has been used
    });

    // Clean up expired challenges periodically
    if (challengeStore.size > 1000) {
      const now = Date.now();
      for (const [key, value] of challengeStore.entries()) {
        if (value.expires < now) {
          challengeStore.delete(key);
        }
      }
    }

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('ALTCHA challenge generation error:', error);
    return {
      statusCode: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: 'Failed to generate challenge',
        // SECURITY: Don't expose internal error details in production
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      }),
    };
  }
}

// POST request: Verify payload using official altcha-lib
async function handlePost(event, corsHeaders) {
  try {
    // Parse request body
    let payload;
    const rawBody = event.body || '';
    
    // Try to parse as JSON first (we're sending { payload: "..." })
    try {
      const body = JSON.parse(rawBody);
      payload = body.payload;
    } catch (e) {
      // If not JSON, assume it's the payload string directly
      payload = rawBody;
    }

    if (!payload || (typeof payload === 'string' && payload.trim() === '')) {
      return {
        statusCode: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          verified: false,
          error: 'Missing payload',
        }),
      };
    }

    // Verify using official altcha-lib
    // verifySolution accepts either string (base64 encoded) or Payload object
    // ALTCHA widget sends payload as base64-encoded string
    let verified = false;
    let salt = null;
    
    try {
      console.log('POST received, payload length:', payload.length);
      console.log('Payload preview:', payload.substring(0, 100));
      
      // Parse payload to get salt for replay attack prevention
      try {
        const payloadData = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
        salt = payloadData.salt;
        console.log('Salt extracted:', salt ? salt.substring(0, 50) + '...' : 'none');
      } catch (e) {
        console.log('Could not extract salt:', e.message);
        // If parsing fails, salt will remain null
      }
      
      // SECURITY: Check if this challenge has already been used (replay attack prevention)
      // SECURITY: Check if challenge has expired
      if (salt && challengeStore.has(salt)) {
        const storedChallenge = challengeStore.get(salt);
        const now = Date.now();
        
        // Check if challenge has expired
        if (storedChallenge && storedChallenge.expires < now) {
          console.log('Expired challenge detected');
          challengeStore.delete(salt); // Clean up expired challenge
          return {
            statusCode: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              verified: false,
              error: 'Challenge expired',
            }),
          };
        }
        
        // Check if challenge has already been used
        if (storedChallenge && storedChallenge.used) {
          console.log('Replay attack detected - challenge already used');
          return {
            statusCode: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              verified: false,
              error: 'Challenge already used',
            }),
          };
        }
      } else if (salt) {
        // Challenge not found in store - might be expired or invalid
        // This could happen if:
        // 1. Challenge expired and was cleaned up
        // 2. Serverless function was restarted (new container)
        // 3. Invalid/forged challenge
        console.log('Challenge not found in store - may be expired or invalid');
        return {
          statusCode: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            verified: false,
            error: 'Invalid or expired challenge',
          }),
        };
      }
      
      console.log('Calling verifySolution with HMAC_KEY:', HMAC_KEY.length, 'bytes');
      verified = await verifySolution(payload, HMAC_KEY, true);
      console.log('Verification result:', verified);
    } catch (verifyError) {
      console.error('verifySolution error:', verifyError.message);
      console.error('Stack:', verifyError.stack);
      return {
        statusCode: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          verified: false,
          error: 'Verification process failed',
          details: verifyError.message,
        }),
      };
    }

    console.log('Verification status:', verified);

    if (verified) {
      console.log('Challenge verified successfully!');
      // Mark challenge as used to prevent replay attacks
      if (salt && challengeStore.has(salt)) {
        const storedChallenge = challengeStore.get(salt);
        if (storedChallenge) {
          storedChallenge.used = true;
          challengeStore.set(salt, storedChallenge);
          console.log('Challenge marked as used');
        }
      }
      
      return {
        statusCode: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ verified: true }),
      };
    } else {
      console.log('Verification failed - invalid proof-of-work solution');
      return {
        statusCode: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          verified: false,
          error: 'Invalid proof-of-work solution',
        }),
      };
    }
  } catch (error) {
    console.error('ALTCHA verification error:', error);
    console.error('Error stack:', error.stack);
    return {
      statusCode: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        verified: false,
        error: 'Verification failed',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      }),
    };
  }
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

  // SECURITY: Rate limiting (abuse protection)
  const rateLimitResult = rateLimiters.altcha(event);
  if (rateLimitResult) {
    return {
      ...rateLimitResult,
      headers: {
        ...rateLimitResult.headers,
        ...corsHeaders
      }
    };
  }

  try {
    if (event.httpMethod === 'GET') {
      return await handleGet(event, corsHeaders);
    }

    if (event.httpMethod === 'POST') {
      return await handlePost(event, corsHeaders);
    }

    // Method not allowed
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (error) {
    console.error('ALTCHA function error:', error);
    
    return {
      statusCode: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        verified: false,
        error: 'Internal server error',
        details: error.message,
      }),
    };
  }
};
