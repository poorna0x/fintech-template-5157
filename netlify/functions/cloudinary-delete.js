// Netlify Function: delete image from Cloudinary using server-side API secret
// Uses Basic Auth (no signature) to avoid encoding/whitespace issues
const { getCorsHeaders, isOriginAllowed } = require('./cors-helper');
const { addSecurityHeaders } = require('./security-headers');

// Prefer CLOUDINARY_* (server-only); fall back to VITE_* so Netlify works without adding new vars.
// Trim all values - Netlify env can have trailing newlines which break signature.
function getCloudinaryConfig(useSecondary) {
  const trim = (s) => (s && typeof s === 'string' ? s.trim() : s);
  if (useSecondary) {
    const cloudName = trim(process.env.CLOUDINARY_SECONDARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_SECONDARY_CLOUD_NAME);
    const apiKey = trim(process.env.CLOUDINARY_SECONDARY_API_KEY || process.env.VITE_CLOUDINARY_SECONDARY_API_KEY);
    const apiSecret = trim(process.env.CLOUDINARY_SECONDARY_API_SECRET || process.env.VITE_CLOUDINARY_SECONDARY_API_SECRET);
    return cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null;
  }
  const cloudName = trim(process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME);
  const apiKey = trim(process.env.CLOUDINARY_API_KEY || process.env.VITE_CLOUDINARY_API_KEY);
  const apiSecret = trim(process.env.CLOUDINARY_API_SECRET || process.env.VITE_CLOUDINARY_API_SECRET);
  return cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null;
}

// Use Basic Auth (no signature) - recommended for server-side; avoids signature encoding issues
function buildAuthHeader(apiKey, apiSecret) {
  const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  return `Basic ${credentials}`;
}

exports.handler = async (event, context) => {
  const requestOrigin = event.headers.origin || event.headers.Origin;
  const corsHeaders = getCorsHeaders(requestOrigin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: addSecurityHeaders(corsHeaders), body: '' };
  }

  if (requestOrigin && !isOriginAllowed(requestOrigin)) {
    return {
      statusCode: 403,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Forbidden: Origin not allowed' }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json', Allow: 'POST, OPTIONS' }),
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ deleted: false, error: 'Invalid JSON body' }),
    };
  }

  const { publicId: rawPublicId, useSecondary = false } = body;
  if (!rawPublicId || typeof rawPublicId !== 'string' || !rawPublicId.trim()) {
    return {
      statusCode: 400,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ deleted: false, error: 'Missing or invalid publicId' }),
    };
  }

  const id = rawPublicId.trim();

  const tryDestroyWithConfig = async (idToTry, config) => {
    const formBody = new URLSearchParams({
      public_id: idToTry,
      invalidate: 'true',
    }).toString();
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${config.cloudName}/image/destroy`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': buildAuthHeader(config.apiKey, config.apiSecret),
        },
        body: formBody,
      }
    );
    return response.json();
  };

  const tryDestroy = async (idToTry, useSecondaryAccount) => {
    const config = getCloudinaryConfig(!!useSecondaryAccount);
    if (!config) return null;
    return tryDestroyWithConfig(idToTry, config);
  };

  try {
    let config = getCloudinaryConfig(!!useSecondary);
    if (!config) {
      console.warn('[cloudinary-delete] No config: set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in Netlify env (scope: All or Functions)');
      return {
        statusCode: 503,
        headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
        body: JSON.stringify({ deleted: false, error: 'Cloudinary delete not configured (set CLOUDINARY_* in Netlify env, then redeploy)' }),
      };
    }
    // Safe debug: confirm which cloud we're using (no secrets logged)
    if (process.env.NODE_ENV !== 'production') {
      console.log('[cloudinary-delete] cloud:', config.cloudName, 'apiKey length:', config.apiKey.length, 'apiSecret length:', config.apiSecret.length);
    }

    let result = await tryDestroyWithConfig(id, config);
    if (process.env.NODE_ENV !== 'production') {
      console.log('[cloudinary-delete] try', id, 'useSecondary:', useSecondary, 'result:', result.result, result.error?.message || '');
    }

    if (result.result === 'ok') {
      return {
        statusCode: 200,
        headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
        body: JSON.stringify({ deleted: true }),
      };
    }

    const isNotFound = /not found|invalid|unknown/i.test(result.error?.message || '');

    // 1) Retry with filename-only (no folder) - dynamic folder mode
    if (isNotFound && id.includes('/')) {
      const idWithoutFolder = id.split('/').pop();
      if (idWithoutFolder) {
        result = await tryDestroyWithConfig(idWithoutFolder, config);
        if (result?.result === 'ok') {
          return {
            statusCode: 200,
            headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
            body: JSON.stringify({ deleted: true }),
          };
        }
      }
    }

    // 2) Retry with the other account in case photo was uploaded to the other cloud
    if (isNotFound) {
      const otherConfig = getCloudinaryConfig(!useSecondary);
      if (otherConfig) {
        result = await tryDestroyWithConfig(id, otherConfig);
        if (result?.result === 'ok') {
          return {
            statusCode: 200,
            headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
            body: JSON.stringify({ deleted: true }),
          };
        }
        if (id.includes('/')) {
          const idWithoutFolder = id.split('/').pop();
          if (idWithoutFolder) {
            result = await tryDestroyWithConfig(idWithoutFolder, otherConfig);
            if (result?.result === 'ok') {
              return {
                statusCode: 200,
                headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
                body: JSON.stringify({ deleted: true }),
              };
            }
          }
        }
      }
    }

    const rawMessage = result?.error?.message || 'Cloudinary destroy failed';
    const friendlyMessage = /not found|invalid|unknown/i.test(rawMessage)
      ? 'Image not found on Cloudinary (wrong ID or already deleted).'
      : rawMessage;

    return {
      statusCode: 200,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        deleted: false,
        error: friendlyMessage,
      }),
    };
  } catch (err) {
    console.error('Cloudinary delete error:', err);
    return {
      statusCode: 500,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        deleted: false,
        error: process.env.NODE_ENV === 'development' ? err.message : 'Delete failed',
      }),
    };
  }
};
