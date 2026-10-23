// Technician app reports that Android marked the current fix as mock.
// Auth: technician Supabase JWT. The alert itself is deduped in
// mock-location-admin-push (only the first report while the flag is clear).

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { verifyStaffBearerToken, readBearerToken } = require('./admin-auth-guard');
const { notifyAdminsOfMockLocation } = require('./mock-location-admin-push');
const { checkRateLimitForKey, rateLimitResponseForKey } = require('./rate-limiter');

exports.handler = async (event) => {
  const corsHeaders = getCorsHeaders(event.headers.origin || event.headers.Origin);
  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (shouldRejectMissingOrigin(event)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  const token = readBearerToken(event);
  const session = await verifyStaffBearerToken(token);
  if (!session.ok || session.role !== 'technician') {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const limit = checkRateLimitForKey(session.userId, {
    maxRequests: 12,
    windowMs: 60 * 60 * 1000,
    endpoint: 'report-tech-mock-location',
  });
  if (!limit.allowed) {
    const rl = rateLimitResponseForKey(limit);
    return { ...rl, headers: { ...rl.headers, ...corsHeaders } };
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const result = await notifyAdminsOfMockLocation(db, session.userId);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ...result }) };
  } catch (err) {
    console.error('[report-tech-mock-location] failed', err?.message || err);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, sent: 0, reason: 'failed' }) };
  }
};
