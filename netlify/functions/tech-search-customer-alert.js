// Admin oversight: when a technician opens a customer from the in-app search
// (manual lookup, not a phone call), notify every admin device. Tapping the
// push opens that customer in the admin app via the shared tech_call deep link.
//
// Auth: the technician's Supabase JWT (Authorization: Bearer). We verify the
// token maps to an ACTIVE technician — this runs in the foreground with a live
// session, so unlike the silent call flow we don't need FCM-token auth.
// Origin is enforced in production; per-technician rate limit caps spam/egress.

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { verifyStaffBearerToken, readBearerToken } = require('./admin-auth-guard');
const { getMessaging, isStaleTokenError } = require('./fcm-helper');
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

  // Must be a technician session.
  const token = readBearerToken(event);
  const session = await verifyStaffBearerToken(token);
  if (!session.ok || session.role !== 'technician') {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }
  const technicianId = session.userId;

  const customerId = String(body.customerId || '').trim();
  if (!customerId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'customerId required' }) };
  }

  // Cheap anti-spam: cap per technician (covers repeated opens of many customers).
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

  // Confirm the technician is still ACTIVE (JWT alone can outlive a suspension).
  const { data: tech } = await db
    .from('technicians')
    .select('full_name, account_status')
    .eq('id', technicianId)
    .maybeSingle();
  if (!tech || tech.account_status !== 'ACTIVE') {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Inactive technician' }) };
  }

  const { data: customer } = await db
    .from('customers')
    .select('id, full_name, phone')
    .eq('id', customerId)
    .maybeSingle();
  if (!customer) {
    return { statusCode: 200, headers, body: JSON.stringify({ sent: 0, reason: 'no_customer' }) };
  }

  const { data: tokenRows, error: tokErr } = await db.from('admin_push_tokens').select('token');
  if (tokErr) {
    return { statusCode: 200, headers, body: JSON.stringify({ sent: 0, reason: 'no_table' }) };
  }
  const tokens = (tokenRows || []).map((r) => r.token).filter(Boolean);
  if (tokens.length === 0) {
    return { statusCode: 200, headers, body: JSON.stringify({ sent: 0, reason: 'no_tokens' }) };
  }

  const techName = tech.full_name || 'Technician';
  const phone = customer.phone || '';

  try {
    const messaging = await getMessaging(db);
    const res = await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: `${techName} looked up a customer`,
        body: `${customer.full_name || 'Customer'}${phone ? ` (${phone})` : ''} — tap to open`,
      },
      data: {
        type: 'tech_call',
        phone,
        customerId: String(customer.id),
        technicianId: String(technicianId),
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'job_alerts_v2',
          defaultSound: true,
          color: '#0369A1',
          tag: `tech_search_${technicianId}_${customer.id}`,
        },
      },
    });

    const stale = [];
    res.responses.forEach((r, i) => {
      if (!r.success && isStaleTokenError(r.error)) stale.push(tokens[i]);
    });
    if (stale.length > 0) {
      await db.from('admin_push_tokens').delete().in('token', stale);
    }

    return { statusCode: 200, headers, body: JSON.stringify({ sent: res.successCount }) };
  } catch (err) {
    console.error('[tech-search-customer-alert] send failed', err?.message || err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Push send failed' }) };
  }
};
