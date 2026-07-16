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
  // Epoch ms of when the GPS fix was measured (may predate the upload).
  const fixTime = Number(body.fixTime);

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

  const fixIso = Number.isFinite(fixTime) && fixTime > 0 ? new Date(fixTime).toISOString() : null;

  const nowIso = new Date().toISOString();
  let update = db
    .from('technician_live_locations')
    .update({
      latitude,
      longitude,
      accuracy: Number.isFinite(accuracy) ? accuracy : null,
      ...(fixIso ? { fix_time: fixIso } : {}),
      updated_at: nowIso,
    })
    .eq('technician_id', technicianId);
  if (fixIso) {
    // The cached last-known and the fresh fix race over the network; never
    // let an older measurement overwrite a newer one.
    update = update.or(`fix_time.is.null,fix_time.lte.${fixIso}`);
  }
  // Confirm a row was written — older-fix rejection returns ok with 0 rows.
  const { data: updated, error: updErr } = await update.select('technician_id').maybeSingle();

  if (updErr) {
    console.error('[upload-tech-location] update failed', updErr.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Update failed' }) };
  }

  // Only the GPS-measured ("exact") fix — not the phone's cached first reply —
  // is mirrored into technicians.current_location for measure-distance / assign.
  const isExact =
    Number.isFinite(fixTime) &&
    fixTime > 0 &&
    requestedAt > 0 &&
    fixTime >= requestedAt - 30_000;
  if (updated && isExact) {
    const { error: mirrorErr } = await db
      .from('technicians')
      .update({
        current_location: {
          latitude,
          longitude,
          lastUpdated: nowIso,
          accuracy: Number.isFinite(accuracy) ? accuracy : null,
        },
      })
      .eq('id', technicianId);
    if (mirrorErr) {
      // Live row is already correct; don't fail the phone upload over mirror.
      console.error('[upload-tech-location] current_location mirror failed', mirrorErr.message);
    }
  }

  return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
};
