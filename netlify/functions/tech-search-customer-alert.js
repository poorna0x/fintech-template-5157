// Admin oversight: when a technician search returns any matches, notify every
// admin device with the query they typed. Tapping the push opens admin search
// with that same query (tech_search deep link).
//
// Auth: technician Supabase JWT. ACTIVE technician check. Origin enforced in
// production. Per-technician rate limit caps spam/egress.

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { verifyStaffBearerToken, readBearerToken } = require('./admin-auth-guard');
const { getMessaging, isStaleTokenError, getAdminFcmTokens, pruneAdminFcmTokens } = require('./fcm-helper');
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

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const token = readBearerToken(event);
  const session = await verifyStaffBearerToken(token);
  if (!session.ok || session.role !== 'technician') {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }
  const technicianId = session.userId;

  const query = String(body.query || '').trim().slice(0, 80);
  const resultCount = Math.max(0, Math.min(100, Number(body.resultCount) || 0));
  if (!query || resultCount < 1) {
    return { statusCode: 200, headers, body: JSON.stringify({ sent: 0, reason: 'no_results' }) };
  }

  const limit = checkRateLimitForKey(technicianId, {
    maxRequests: 40,
    windowMs: 3_600_000,
    endpoint: 'tech-search-alert',
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

  const { data: tech } = await db
    .from('technicians')
    .select('full_name, account_status')
    .eq('id', technicianId)
    .maybeSingle();
  if (!tech || tech.account_status !== 'ACTIVE') {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Inactive technician' }) };
  }

  const tokens = await getAdminFcmTokens(db, 'tech_search');
  if (tokens.length === 0) {
    return { statusCode: 200, headers, body: JSON.stringify({ sent: 0, reason: 'no_tokens' }) };
  }

  const techName = tech.full_name || 'Technician';
  const resultLabel = resultCount === 1 ? '1 result' : `${resultCount} results`;

  try {
    const messaging = await getMessaging(db);
    const res = await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: `${techName} searched customers`,
        body: `"${query}" — ${resultLabel}`,
      },
      data: {
        type: 'tech_search',
        query,
        // Reuse tech_call deep-link path (admin searches this string).
        phone: query,
        techName,
        technicianId: String(technicianId),
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'job_alerts_v2',
          defaultSound: true,
          color: '#0369A1',
          tag: `tech_search_${technicianId}_${query.slice(0, 24)}`,
        },
      },
    });

    const stale = [];
    res.responses.forEach((r, i) => {
      if (!r.success && isStaleTokenError(r.error)) stale.push(tokens[i]);
    });
    if (stale.length > 0) {
      await pruneAdminFcmTokens(db, stale);
    }

    return { statusCode: 200, headers, body: JSON.stringify({ sent: res.successCount }) };
  } catch (err) {
    console.error('[tech-search-customer-alert] send failed', err?.message || err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Push send failed' }) };
  }
};
