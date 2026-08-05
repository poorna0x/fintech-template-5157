// Wake a technician's Android app for a live-location request.
// Admin-only. Sends a silent, high-priority FCM data message so the app can
// start its GPS watcher even when Android has frozen it in the background.
//
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { authorizeAdminBearer } = require('./admin-auth-guard');
const { sendTechnicianLocationPing } = require('./location-ping-core');

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

  const result = await sendTechnicianLocationPing(db, technicianId);
  if (result.reason === 'lookup_failed') {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Lookup failed' }) };
  }
  if (result.reason === 'push_failed') {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Push send failed' }) };
  }
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      sent: result.sent,
      ...(result.reason ? { reason: result.reason } : {}),
      ...(result.devices != null ? { devices: result.devices } : {}),
    }),
  };
};
