// Silent FCM: push call-detect prefs to one admin/tech device so native
// SharedPreferences update even when the phone is backgrounded / app killed.
// Called from Settings → Device Tracker after toggling "Detect calls".

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { authorizeAdminBearer } = require('./admin-auth-guard');
const { getMessaging, isStaleTokenError } = require('./fcm-helper');

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

  const auth = await authorizeAdminBearer(event, body);
  if (!auth.ok) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: auth.error }) };
  }

  const token = String(body.token || '').trim();
  const kind = String(body.kind || '').trim();
  const callAlertsEnabled = body.callAlertsEnabled !== false;
  if (!token || (kind !== 'admin' && kind !== 'technician')) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'token and kind (admin|technician) required' }),
    };
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const table = kind === 'admin' ? 'admin_push_tokens' : 'technician_push_tokens';
  const { data: row } = await db.from(table).select('token').eq('token', token).maybeSingle();
  if (!row?.token) {
    return { statusCode: 200, headers, body: JSON.stringify({ sent: false, reason: 'unknown_token' }) };
  }

  try {
    const messaging = await getMessaging(db);
    // Data-only, high priority — reaches killed apps; no tray notification.
    // Bypass mute/category filters: muted phones must still receive prefs sync.
    await messaging.send({
      token,
      data: {
        type: 'device_prefs',
        callAlertsEnabled: callAlertsEnabled ? 'true' : 'false',
      },
      android: { priority: 'high' },
    });
    return { statusCode: 200, headers, body: JSON.stringify({ sent: true }) };
  } catch (err) {
    if (isStaleTokenError(err)) {
      return { statusCode: 200, headers, body: JSON.stringify({ sent: false, reason: 'stale_token' }) };
    }
    console.error('[sync-device-call-prefs] send failed', err?.message || err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Push send failed' }) };
  }
};
