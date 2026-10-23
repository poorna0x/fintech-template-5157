// Receive a location upload from the technician app's NATIVE push handler.
// This path runs when Android delivers a location-request push while the
// webview/JS is dead (app killed), so there is no Supabase session to use.
// Auth: the one-time nonce that send-location-ping stored on the row and
// included in the FCM push — only that technician's device has it.

const { createClient } = require('@supabase/supabase-js');
const { decideLocationWrite, previousFromRow, isMissingRiskColumn } = require('./location-risk');
const { notifyAdminsOfMockLocation } = require('./mock-location-admin-push');

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
    .select('ping_nonce,ping_requested_at,is_tracking,latitude,longitude,accuracy,fix_time,updated_at')
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

  // Recomputed here. body.riskScore / body.reasons are ignored on purpose.
  const decision = decideLocationWrite(body, previousFromRow(row), Date.now());
  if (!decision.accepted) {
    if (decision.assessment.isMockLocation) {
      try {
        await notifyAdminsOfMockLocation(db, technicianId);
      } catch (err) {
        console.warn('[upload-tech-location] mock alert failed', err?.message || err);
      }
    }
    console.warn('[upload-tech-location] reading not used', {
      technician: technicianId.slice(0, 8),
      level: decision.assessment.riskLevel,
      mock: decision.assessment.isMockLocation,
      reasons: decision.assessment.reasons,
    });
    const { error: riskErr } = await db
      .from('technician_live_locations')
      .update(decision.riskPatch)
      .eq('technician_id', technicianId);
    if (riskErr && isMissingRiskColumn(riskErr)) {
      console.warn(
        '[upload-tech-location] location risk columns missing; run scripts/add-technician-location-risk.sql'
      );
    } else if (riskErr) {
      console.error('[upload-tech-location] risk update failed', riskErr.message);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Update failed' }) };
    }
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        accepted: false,
        riskLevel: decision.assessment.riskLevel,
        reasons: decision.assessment.reasons,
      }),
    };
  }

  const fixIso = decision.fixIso;

  let update = db
    .from('technician_live_locations')
    .update(decision.coordinatePatch)
    .eq('technician_id', technicianId);
  if (fixIso) {
    // The cached last-known and the fresh fix race over the network; never
    // let an older measurement overwrite a newer one.
    update = update.or(`fix_time.is.null,fix_time.lte.${fixIso}`);
  }
  // Do NOT chain .select().maybeSingle() here: when the older-fix guard
  // matches 0 rows, object-mode Accept headers can surface as an error and
  // the phone treats the upload as failed (breaks exact live location).
  let { error: updErr } = await update;
  if (updErr && isMissingRiskColumn(updErr)) {
    console.warn(
      '[upload-tech-location] location risk columns missing; run scripts/add-technician-location-risk.sql'
    );
    const slim = { ...decision.coordinatePatch };
    delete slim.location_mock;
    delete slim.location_risk_score;
    delete slim.location_risk_level;
    delete slim.location_risk_reasons;
    delete slim.location_risk_checked_at;
    let retry = db.from('technician_live_locations').update(slim).eq('technician_id', technicianId);
    if (fixIso) retry = retry.or(`fix_time.is.null,fix_time.lte.${fixIso}`);
    const second = await retry;
    updErr = second.error;
  }

  if (updErr) {
    console.error('[upload-tech-location] update failed', updErr.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Update failed' }) };
  }

  // Best-effort mirror: exact GPS fix only (measured at/after the ping).
  // Never fails the upload if this write has a problem.
  const isExact =
    Number.isFinite(fixTime) &&
    fixTime > 0 &&
    requestedAt > 0 &&
    fixTime >= requestedAt - 30_000;
  if (isExact) {
    const { error: mirrorErr } = await db
      .from('technicians')
      .update({
        current_location: {
          latitude,
          longitude,
          lastUpdated: new Date().toISOString(),
          accuracy: Number.isFinite(accuracy) ? accuracy : null,
        },
      })
      .eq('id', technicianId);
    if (mirrorErr) {
      console.error('[upload-tech-location] current_location mirror failed', mirrorErr.message);
    }
  }

  return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
};
