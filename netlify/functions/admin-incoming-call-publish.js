// Publish an incoming call to the shared admin board so every admin page can
// auto-search the caller for the next 1.5 minutes. The admin phone that rings
// POSTs { token, number } here (native, works with the app killed). We insert
// one row (service role) and prune stale rows so the table stays tiny.
//
// Auth: the device's FCM token must exist in admin_push_tokens — same trust
// model as tech-call-customer-alert. No Supabase JWT is available at ring time
// (app may be killed), so origin checks don't apply.

const { createClient } = require('@supabase/supabase-js');
const { checkRateLimit, checkRateLimitForKey, rateLimitResponseForKey } = require('./rate-limiter');
const { findCustomerByPhoneDigits } = require('./customer-phone-lookup');

const HEADERS = { 'Content-Type': 'application/json' };

/** Any format → bare 10-digit Indian number ('' when too short to match). */
function normalizePhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.length >= 12 && digits.startsWith('91')) digits = digits.slice(2);
  digits = digits.replace(/^0+/, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const ipLimit = checkRateLimit(event, {
    maxRequests: 120,
    windowMs: 3_600_000,
    endpoint: 'admin-call-publish-ip',
  });
  if (!ipLimit.allowed) return rateLimitResponseForKey(ipLimit);

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const deviceToken = String(body.token || '').trim();
  const phone = normalizePhone(body.number);
  if (deviceToken.length < 20) {
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }
  if (!phone) {
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: false, reason: 'bad_number' }) };
  }

  const tokenLimit = checkRateLimitForKey(deviceToken, {
    maxRequests: 60,
    windowMs: 3_600_000,
    endpoint: 'admin-call-publish-token',
  });
  if (!tokenLimit.allowed) return rateLimitResponseForKey(tokenLimit);

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Authenticate: FCM token must belong to a registered admin device.
  const { data: adminRow } = await db
    .from('admin_push_tokens')
    .select('token, call_alerts_enabled')
    .eq('token', deviceToken)
    .maybeSingle();
  if (!adminRow) {
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }
  // Device Tracker → Detect calls off — ignore even if the APK still posts.
  if (adminRow.call_alerts_enabled === false) {
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: false, reason: 'call_detect_off' }) };
  }

  // Only publish known customers — unknown callers stay local to the phone that
  // rang (it shows the "not found / send WhatsApp intro" prompt); no point
  // broadcasting an unknown number to every admin.
  const customer = await findCustomerByPhoneDigits(db, phone, 'id');
  if (!customer) {
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: false, reason: 'no_customer' }) };
  }

  const { error: insErr } = await db.from('admin_incoming_calls').insert({ phone });
  if (insErr) {
    console.error('[admin-incoming-call-publish] insert failed', insErr.message);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Insert failed' }) };
  }

  // Keep the table tiny — anything older than an hour is useless (1.5-min window).
  await db
    .from('admin_incoming_calls')
    .delete()
    .lt('created_at', new Date(Date.now() - 3_600_000).toISOString());

  return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
};
