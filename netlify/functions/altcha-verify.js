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
const HMAC_KEY = process.env.ALTCHA_HMAC_KEY || 'your-secret-hmac-key-change-in-production';

// Simple in-memory store for challenges (in production, use Redis or database)
const challengeStore = new Map();

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// GET request: Generate challenge using official altcha-lib
async function handleGet(event) {
  try {
    const complexity = parseInt(event.queryStringParameters?.complexity || '14', 10);
    
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
        details: error.message,
      }),
    };
  }
}

// POST request: Verify payload using official altcha-lib
async function handlePost(event) {
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
      
      // Check if this challenge has already been used (replay attack prevention)
      if (salt && challengeStore.has(salt)) {
        const storedChallenge = challengeStore.get(salt);
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
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  try {
    if (event.httpMethod === 'GET') {
      return await handleGet(event);
    }

    if (event.httpMethod === 'POST') {
      return await handlePost(event);
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
