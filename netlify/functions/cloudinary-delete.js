// Netlify Function: delete image from Cloudinary using server-side API secret.
// Uses Basic Auth (no signature) to avoid encoding/whitespace issues.
//
// SECURITY: This endpoint is admin/technician-only. It requires:
//   1. A valid Supabase access token (Authorization: Bearer ... or body.accessToken)
//   2. An allowed Origin
//   3. Per-IP and per-user rate limits
//   4. A strict publicId format (no shell/path injection, length-bounded)
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, isOriginAllowed } = require('./cors-helper');
const { addSecurityHeaders } = require('./security-headers');
const {
  checkRateLimit,
  checkRateLimitForKey,
  rateLimitResponseForKey,
} = require('./rate-limiter');

// Cloudinary public_id rules + our app conventions:
//   - allow letters, digits, underscore, hyphen, slash, dot
//   - max 200 chars (Cloudinary max is 255; we cap below to leave headroom)
//   - reject leading/trailing slashes and any double-slash, "../", or NUL byte
const PUBLIC_ID_RE = /^[A-Za-z0-9._\-/]{1,200}$/;
function isValidPublicId(id) {
  if (typeof id !== 'string') return false;
  if (!PUBLIC_ID_RE.test(id)) return false;
  if (id.startsWith('/') || id.endsWith('/')) return false;
  if (id.includes('//') || id.includes('..') || id.includes('\u0000')) return false;
  return true;
}

// Server-only Cloudinary config. We intentionally do NOT fall back to VITE_* —
// those would also be inlined into the public browser bundle by Vite.
// Trim all values: Netlify env can have trailing newlines which break Basic Auth.
function getCloudinaryConfig(useSecondary) {
  const trim = (s) => (s && typeof s === 'string' ? s.trim() : s);
  if (useSecondary) {
    const cloudName = trim(process.env.CLOUDINARY_SECONDARY_CLOUD_NAME);
    const apiKey = trim(process.env.CLOUDINARY_SECONDARY_API_KEY);
    const apiSecret = trim(process.env.CLOUDINARY_SECONDARY_API_SECRET);
    return cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null;
  }
  const cloudName = trim(process.env.CLOUDINARY_CLOUD_NAME);
  const apiKey = trim(process.env.CLOUDINARY_API_KEY);
  const apiSecret = trim(process.env.CLOUDINARY_API_SECRET);
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

  // Per-IP brute-force / abuse limit (best-effort; per-Lambda-instance only).
  const ipLimit = checkRateLimit(event, {
    maxRequests: 60,
    windowMs: 60_000,
    endpoint: 'cloudinary-delete-ip',
  });
  if (!ipLimit.allowed) {
    return {
      ...rateLimitResponseForKey(ipLimit),
      headers: addSecurityHeaders({
        ...rateLimitResponseForKey(ipLimit).headers,
        ...corsHeaders,
      }),
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

  // --- AUTHENTICATION: require a valid Supabase access token (admin or technician) ---
  const accessToken =
    body.accessToken ||
    (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
  if (!accessToken) {
    return {
      statusCode: 401,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ deleted: false, error: 'Unauthorized' }),
    };
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const anonKey = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
  if (!supabaseUrl || !anonKey) {
    return {
      statusCode: 503,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ deleted: false, error: 'Server misconfigured' }),
    };
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser(accessToken);
  if (userErr || !userData?.user) {
    return {
      statusCode: 401,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ deleted: false, error: 'Unauthorized' }),
    };
  }

  const role =
    userData.user.app_metadata?.role ||
    userData.user.user_metadata?.role ||
    'admin';
  if (role !== 'admin' && role !== 'technician') {
    return {
      statusCode: 403,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ deleted: false, error: 'Forbidden' }),
    };
  }

  // Per-user limit (shared with IP limit). Tighter than IP because each authenticated
  // user is a single principal and deletes should not happen in bursts.
  const userLimit = checkRateLimitForKey(`cloudinary-delete-user:${userData.user.id}`, {
    maxRequests: 100,
    windowMs: 60 * 60 * 1000,
    endpoint: 'cloudinary-delete-user',
  });
  if (!userLimit.allowed) {
    return {
      ...rateLimitResponseForKey(userLimit),
      headers: addSecurityHeaders({
        ...rateLimitResponseForKey(userLimit).headers,
        ...corsHeaders,
      }),
    };
  }

  const { publicId: rawPublicId, useSecondary = false } = body;
  if (!rawPublicId || typeof rawPublicId !== 'string') {
    return {
      statusCode: 400,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ deleted: false, error: 'Missing or invalid publicId' }),
    };
  }
  const id = rawPublicId.trim();
  if (!isValidPublicId(id)) {
    return {
      statusCode: 400,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ deleted: false, error: 'Invalid publicId format' }),
    };
  }
  if (typeof useSecondary !== 'boolean') {
    return {
      statusCode: 400,
      headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
      body: JSON.stringify({ deleted: false, error: 'Invalid useSecondary flag' }),
    };
  }

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
