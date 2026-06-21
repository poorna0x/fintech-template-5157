// Public 1×1 GIF pixel — records email open via opaque tracking token (no auth).
// Rate-limited; always returns the same transparent GIF.

const { TRANSPARENT_GIF, recordEmailOpen, isUuid } = require('./email-tracking');
const { checkRateLimit } = require('./rate-limiter');

function pixelResponse() {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
      Expires: '0',
    },
    body: TRANSPARENT_GIF.toString('base64'),
    isBase64Encoded: true,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  if (event.httpMethod === 'HEAD') {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      },
      body: '',
    };
  }

  const limit = checkRateLimit(event, {
    maxRequests: 120,
    windowMs: 60_000,
    endpoint: 'email-open-track',
  });
  if (!limit.allowed) {
    return pixelResponse();
  }

  const token = event.queryStringParameters?.t;
  if (token && isUuid(token)) {
    try {
      await recordEmailOpen(token);
    } catch (err) {
      console.warn('[email-open-track]', err && err.message);
    }
  }

  return pixelResponse();
};
