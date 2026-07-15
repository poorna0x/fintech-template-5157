// Wake a technician's Android app for a live-location request.
// Admin-only. Sends a silent, high-priority FCM data message so the app can
// start its GPS watcher even when Android has frozen it in the background.
//
// The Firebase service-account credential lives in the app_secrets table
// (key 'firebase_service_account', readable only via the service role) —
// NOT in an env var, because a ~2.5KB value pushes the total function env
// over AWS Lambda's 4KB limit and breaks deploys of every function.

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { authorizeAdminBearer } = require('./admin-auth-guard');

let messagingPromise = null;

function getMessaging(db) {
  if (!messagingPromise) {
    messagingPromise = (async () => {
      const admin = require('firebase-admin');
      if (!admin.apps.length) {
        let raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
        if (!raw) {
          const { data, error } = await db
            .from('app_secrets')
            .select('value')
            .eq('key', 'firebase_service_account')
            .maybeSingle();
          if (error || !data?.value) {
            throw new Error('firebase_service_account secret not found in app_secrets');
          }
          raw = data.value;
        }
        admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
      }
      return admin.messaging();
    })();
    // Allow a retry on the next invocation if init failed.
    messagingPromise.catch(() => {
      messagingPromise = null;
    });
  }
  return messagingPromise;
}

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

  const technicianId = String(body.technicianId || '').trim();
  if (!technicianId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'technicianId required' }) };
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: row, error: rowErr } = await db
    .from('technician_live_locations')
    .select('fcm_token,is_tracking')
    .eq('technician_id', technicianId)
    .maybeSingle();

  if (rowErr) {
    console.error('[send-location-ping] lookup failed', rowErr.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Lookup failed' }) };
  }
  if (!row) {
    return { statusCode: 200, headers, body: JSON.stringify({ sent: false, reason: 'no_row' }) };
  }
  if (!row.fcm_token) {
    return { statusCode: 200, headers, body: JSON.stringify({ sent: false, reason: 'no_token' }) };
  }

  try {
    const messaging = await getMessaging(db);
    await messaging.send({
      token: row.fcm_token,
      data: { type: 'location_request' },
      android: { priority: 'high' },
    });
    return { statusCode: 200, headers, body: JSON.stringify({ sent: true }) };
  } catch (err) {
    const code = err?.errorInfo?.code || err?.code || '';
    // Stale/uninstalled token — clear it so we stop trying.
    if (String(code).includes('registration-token-not-registered')) {
      await db
        .from('technician_live_locations')
        .update({ fcm_token: null })
        .eq('technician_id', technicianId);
      return { statusCode: 200, headers, body: JSON.stringify({ sent: false, reason: 'stale_token' }) };
    }
    console.error('[send-location-ping] send failed', err?.message || err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Push send failed' }) };
  }
};
