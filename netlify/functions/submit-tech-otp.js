// Receive an OTP typed directly into the Android notification's inline
// reply field (OtpReplyReceiver in the native app). The webview/JS may be
// dead, so there is no Supabase session — the one-time nonce that
// send-otp-request stored on the row and included in the push is the auth.

const { createClient } = require('@supabase/supabase-js');

// The native app sends no Origin header, so no CORS/origin checks here.
const NONCE_MAX_AGE_MS = 30 * 60 * 1000;

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const requestId = String(body.requestId || '').trim();
  const nonce = String(body.nonce || '').trim();
  const otp = String(body.otp || '').trim();

  if (!requestId || !nonce) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing fields' }) };
  }
  if (!/^\d{4}$/.test(otp)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'OTP must be 4 digits' }) };
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
    .from('technician_otp_requests')
    .select('id,reply_nonce,created_at')
    .eq('id', requestId)
    .maybeSingle();

  if (rowErr) {
    console.error('[submit-tech-otp] lookup failed', rowErr.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Lookup failed' }) };
  }

  const createdAt = row?.created_at ? new Date(row.created_at).getTime() : 0;
  const nonceValid =
    row != null &&
    row.reply_nonce != null &&
    row.reply_nonce === nonce &&
    Date.now() - createdAt < NONCE_MAX_AGE_MS;

  if (!nonceValid) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  // Re-submitting within the window overwrites (lets the technician correct
  // a typo); the admin dialog updates live either way.
  const { error: updErr } = await db
    .from('technician_otp_requests')
    .update({ otp, submitted_at: new Date().toISOString() })
    .eq('id', requestId);

  if (updErr) {
    console.error('[submit-tech-otp] update failed', updErr.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Update failed' }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
};
