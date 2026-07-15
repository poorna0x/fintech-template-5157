// Receive a location upload from the technician app's NATIVE push handler.
// This path runs when Android delivers a location-request push while the
// webview/JS is dead (app killed), so there is no Supabase session to use.
// Auth: the one-time nonce that send-location-ping stored on the row and
// included in the FCM push — only that technician's device has it.

const { createClient } = require('@supabase/supabase-js');

// The native app sends no Origin header, so no CORS/origin checks here;
// the nonce is the authentication.
const NONCE_MAX_AGE_MS = 10 * 60 * 1000;

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

  const technicianId = String(body.technicianId || '').trim();
  const nonce = String(body.nonce || '').trim();
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const accuracy = body.accuracy != null ? Number(body.accuracy) : null;

  if (!technicianId || !nonce || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing fields' }) };
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
    .select('ping_nonce,ping_requested_at,is_tracking')
    .eq('technician_id', technicianId)
    .maybeSingle();

  if (rowErr) {
    console.error('[upload-tech-location] lookup failed', rowErr.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Lookup failed' }) };
  }

  const requestedAt = row?.ping_requested_at ? new Date(row.ping_requested_at).getTime() : 0;
  const nonceValid =
    row != null &&
    row.is_tracking &&
    row.ping_nonce != null &&
    row.ping_nonce === nonce &&
    Date.now() - requestedAt < NONCE_MAX_AGE_MS;

  if (!nonceValid) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  const { error: updErr } = await db
    .from('technician_live_locations')
    .update({
      latitude,
      longitude,
      accuracy: Number.isFinite(accuracy) ? accuracy : null,
      updated_at: new Date().toISOString(),
    })
    .eq('technician_id', technicianId);

  if (updErr) {
    console.error('[upload-tech-location] update failed', updErr.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Update failed' }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
};
