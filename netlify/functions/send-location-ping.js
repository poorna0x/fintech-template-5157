// Wake a technician's Android app for a live-location request.
// Admin-only. Sends a silent, high-priority FCM data message so the app can
// start its GPS watcher even when Android has frozen it in the background.
//
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { authorizeAdminBearer } = require('./admin-auth-guard');
const { getMessaging, sendToTechnicianDevices } = require('./fcm-helper');

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
    .select('is_tracking')
    .eq('technician_id', technicianId)
    .maybeSingle();

  if (rowErr) {
    console.error('[send-location-ping] lookup failed', rowErr.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Lookup failed' }) };
  }
  if (!row) {
    return { statusCode: 200, headers, body: JSON.stringify({ sent: false, reason: 'no_row' }) };
  }
  if (!row.is_tracking) {
    return { statusCode: 200, headers, body: JSON.stringify({ sent: false, reason: 'sharing_off' }) };
  }

  // One-time nonce: the app's native handler echoes it back to
  // upload-tech-location as proof it received this specific push.
  const nonce = require('crypto').randomUUID();
  const { error: nonceErr } = await db
    .from('technician_live_locations')
    .update({ ping_nonce: nonce, ping_requested_at: new Date().toISOString() })
    .eq('technician_id', technicianId);
  if (nonceErr) {
    // ping_nonce column missing (patch SQL not run yet) — the JS path in the
    // awake app still works, so send the push without native upload support.
    console.error('[send-location-ping] nonce save failed', nonceErr.message);
  }

  const siteUrl = (process.env.URL || '').replace(/\/$/, '');

  try {
    const messaging = await getMessaging(db);
    // Wake every device the technician is logged in on — whichever phone is
    // actually with them responds; uploads just overwrite the same row.
    const { sent, tokens } = await sendToTechnicianDevices(db, messaging, technicianId, (token) => ({
      token,
      data: {
        type: 'location_request',
        technicianId,
        ...(nonceErr ? {} : { nonce }),
        ...(siteUrl ? { uploadUrl: `${siteUrl}/.netlify/functions/upload-tech-location` } : {}),
      },
      android: { priority: 'high' },
    }));
    if (tokens === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ sent: false, reason: 'no_token' }) };
    }
    if (sent === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ sent: false, reason: 'stale_token' }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ sent: true, devices: sent }) };
  } catch (err) {
    console.error('[send-location-ping] send failed', err?.message || err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Push send failed' }) };
  }
};
