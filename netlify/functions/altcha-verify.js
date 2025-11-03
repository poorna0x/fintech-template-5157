// Netlify Function for ALTCHA server-side verification
// ALTCHA uses a challenge-response system with proof-of-work

// Simple in-memory store for challenges (in production, use Redis or database)
const challengeStore = new Map();

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Generate a challenge for ALTCHA
function generateChallenge(complexity = 20) {
  // Complexity determines difficulty: 2^complexity = maxNumber
  // Lower complexity = easier, higher = harder
  const maxNumber = Math.pow(2, complexity);
  const salt = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  const number = Math.floor(Math.random() * maxNumber);
  
  // Store challenge with expiration (5 minutes)
  const challenge = {
    salt,
    number,
    maxNumber,
    complexity,
    timestamp: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
  };
  
  challengeStore.set(salt, challenge);
  
  // Clean up expired challenges periodically
  if (challengeStore.size > 1000) {
    const now = Date.now();
    for (const [key, value] of challengeStore.entries()) {
      if (value.expiresAt < now) {
        challengeStore.delete(key);
      }
    }
  }
  
  return {
    algorithm: 'SHA-256',
    salt,
    maxNumber,
    // Don't include the solution number - client must find it
  };
}

// Verify ALTCHA payload
async function verifyPayload(payload) {
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
    const { salt, number, algorithm } = decoded;
    
    // Get stored challenge
    const challenge = challengeStore.get(salt);
    if (!challenge) {
      return { verified: false, error: 'Challenge not found or expired' };
    }
    
    // Check expiration (5 minutes)
    if (challenge.expiresAt < Date.now()) {
      challengeStore.delete(salt);
      return { verified: false, error: 'Challenge expired' };
    }
    
    // Verify the proof-of-work by checking if the hash is valid
    const crypto = require('crypto');
    const message = `${salt}:${number}`;
    const hash = crypto.createHash('sha256').update(message).digest('hex');
    
    // Convert first 8 hex characters to number (0-2^32)
    const hashNum = parseInt(hash.substring(0, 8), 16);
    
    if (hashNum < challenge.maxNumber && number < challenge.maxNumber * 2) {
      // Remove used challenge (prevent replay)
      challengeStore.delete(salt);
      return { verified: true };
    }
    
    return { verified: false, error: 'Invalid proof-of-work solution' };
  } catch (error) {
    console.error('ALTCHA verification error:', error);
    return { verified: false, error: 'Verification failed' };
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
    // GET request: Generate challenge
    if (event.httpMethod === 'GET') {
      const complexity = parseInt(event.queryStringParameters?.complexity || '20', 10);
      const challenge = generateChallenge(complexity);
      
      return {
        statusCode: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(challenge),
      };
    }

    // POST request: Verify payload
    if (event.httpMethod === 'POST') {
      const { payload } = JSON.parse(event.body || '{}');
      
      if (!payload) {
        return {
          statusCode: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ verified: false, error: 'Missing payload' }),
        };
      }

      const result = await verifyPayload(payload);
      
      return {
        statusCode: result.verified ? 200 : 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(result),
      };
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
