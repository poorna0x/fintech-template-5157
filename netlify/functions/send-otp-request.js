// Send an OTP-request push to a technician's Android app.
// Admin-only. Data-only high-priority message: the app's native handler
// (HroMessagingService) builds a notification with an inline "Enter OTP"
// reply field, so the technician can answer without opening the app.
// The reply is authenticated by a one-time nonce stored on the request row.

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

  const requestId = String(body.requestId || '').trim();
  const technicianId = String(body.technicianId || '').trim();
  const customerName = String(body.customerName || '').trim().slice(0, 80);
  if (!requestId || !technicianId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'requestId and technicianId required' }) };
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // One-time secret: the notification reply echoes it back to submit-tech-otp
  // as proof it came from a device that received this push. All the
  // technician's devices get the same nonce; whichever replies first wins.
  const nonce = require('crypto').randomUUID();
  const { data: updated, error: nonceErr } = await db
    .from('technician_otp_requests')
    .update({ reply_nonce: nonce })
    .eq('id', requestId)
    .eq('technician_id', technicianId)
    .select('id');
  if (nonceErr || !updated?.length) {
    console.error('[send-otp-request] nonce save failed', nonceErr?.message || 'no matching row');
    return { statusCode: 200, headers, body: JSON.stringify({ sent: false, reason: 'nonce_failed' }) };
  }

  const siteUrl = (process.env.URL || '').replace(/\/$/, '');

  try {
    const messaging = await getMessaging(db);
    const { sent, tokens } = await sendToTechnicianDevices(db, messaging, technicianId, (token) => ({
      token,
      data: {
        type: 'otp_request',
        requestId,
        nonce,
        ...(customerName ? { customerName } : {}),
        submitUrl: `${siteUrl}/.netlify/functions/submit-tech-otp`,
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
    console.error('[send-otp-request] send failed', err?.message || err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Push send failed' }) };
  }
};
