/**
 * Public /review/{token} get + submit. IP + per-token rate limits (production).
 * Service-role RPCs only — anon/authenticated must not EXECUTE these RPCs on PostgREST.
 */
require('./supabase-ws-polyfill');
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, isOriginAllowed } = require('./cors-helper');
const {
  isRateLimitEnabled,
  checkRateLimit,
  checkRateLimitForKey,
  rateLimitResponseForKey,
} = require('./rate-limiter');

function rateLimitsOn() {
  if (typeof isRateLimitEnabled === 'function') return isRateLimitEnabled();
  const ctx = process.env.CONTEXT;
  return Boolean(ctx && ctx !== 'dev');
}

function limited(event, corsHeaders, ipOpts, key, keyOpts) {
  if (!rateLimitsOn()) return null;
  const ip = checkRateLimit(event, ipOpts);
  if (!ip.allowed) {
    const base = rateLimitResponseForKey(ip);
    return { ...base, headers: { ...corsHeaders, ...base.headers } };
  }
  if (key) {
    const tok = checkRateLimitForKey(key, keyOpts);
    if (!tok.allowed) {
      const base = rateLimitResponseForKey(tok);
      return { ...base, headers: { ...corsHeaders, ...base.headers } };
    }
  }
  return null;
}

exports.handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin;
  const corsHeaders = getCorsHeaders(origin);
  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if ((event.body || '').length > 12_000) {
    return { statusCode: 413, headers, body: JSON.stringify({ error: 'Payload too large' }) };
  }
  // Token is the auth. Do not 403 missing Origin (mobile Safari / WhatsApp in-app).
  if (origin && !isOriginAllowed(origin)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const action = String(body.action || '').trim().toLowerCase();
  const token = String(body.token || '').trim();
  if (token.length < 12 || token.length > 48) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'invalid' }) };
  }
  if (action !== 'get' && action !== 'submit') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'action required' }) };
  }
  let rating = null;
  if (action === 'submit') {
    rating = Math.round(Number(body.rating));
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'rating' }) };
    }
  }

  const blocked =
    action === 'get'
      ? limited(
          event,
          corsHeaders,
          { maxRequests: 40, windowMs: 60_000, endpoint: 'job-review-public-get-ip' },
          `get:${token}`,
          { maxRequests: 20, windowMs: 60_000, endpoint: 'job-review-public-get-token' }
        )
      : limited(
          event,
          corsHeaders,
          { maxRequests: 12, windowMs: 60_000, endpoint: 'job-review-public-submit-ip' },
          `submit:${token}`,
          { maxRequests: 6, windowMs: 15 * 60_000, endpoint: 'job-review-public-submit-token' }
        );
  if (blocked) return blocked;

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (action === 'get') {
    const { data, error } = await db.rpc('get_job_review_invite', { p_token: token });
    if (error) {
      console.warn('[job-review-public] get', error.message);
      return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'failed' }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify(data || { ok: false, error: 'failed' }) };
  }

  const comment = String(body.comment || '').trim().slice(0, 1000);
  const { data, error } = await db.rpc('submit_job_review', {
    p_token: token,
    p_rating: rating,
    p_comment: comment,
  });
  if (error) {
    console.warn('[job-review-public] submit', error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'failed' }) };
  }
  return { statusCode: 200, headers, body: JSON.stringify(data || { ok: false, error: 'failed' }) };
};
