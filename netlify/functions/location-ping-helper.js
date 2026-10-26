/**
 * Shared FCM location wake. Used by admin send-location-ping and the family
 * office-status page (after the kill switch has already passed).
 */
const crypto = require('crypto');
const { getMessaging, sendToTechnicianDevices } = require('./fcm-helper');

const PING_MIN_INTERVAL_MS = 2 * 60 * 1000;

function pingRequestedAgeMs(pingRequestedAt, nowMs) {
  if (!pingRequestedAt) return Number.POSITIVE_INFINITY;
  const t = new Date(pingRequestedAt).getTime();
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, nowMs - t);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string} technicianId
 * @param {{ force?: boolean, pingRequestedAt?: string | null }} [opts]
 * @returns {Promise<{ sent: boolean, reason?: string, skipped?: boolean }>}
 */
async function sendTechnicianLocationPing(db, technicianId, opts = {}) {
  const id = String(technicianId || '').trim();
  if (!id) return { sent: false, reason: 'no_id' };

  const now = Date.now();
  if (!opts.force && pingRequestedAgeMs(opts.pingRequestedAt, now) < PING_MIN_INTERVAL_MS) {
    return { sent: false, skipped: true, reason: 'throttled' };
  }

  let row = opts.liveRow || null;
  if (!row) {
    const { data, error: rowErr } = await db
      .from('technician_live_locations')
      .select('is_tracking, ping_requested_at')
      .eq('technician_id', id)
      .maybeSingle();
    if (rowErr) {
      console.error('[location-ping-helper] lookup failed', rowErr.message);
      return { sent: false, reason: 'lookup_failed' };
    }
    row = data;
  }
  if (!row) return { sent: false, reason: 'no_row' };
  if (!row.is_tracking) return { sent: false, reason: 'sharing_off' };

  if (
    !opts.force &&
    pingRequestedAgeMs(row.ping_requested_at, now) < PING_MIN_INTERVAL_MS
  ) {
    return { sent: false, skipped: true, reason: 'throttled' };
  }

  const nonce = crypto.randomUUID();
  const { error: nonceErr } = await db
    .from('technician_live_locations')
    .update({ ping_nonce: nonce, ping_requested_at: new Date(now).toISOString() })
    .eq('technician_id', id);
  if (nonceErr) {
    console.error('[location-ping-helper] nonce save failed', nonceErr.message);
  }

  const siteUrl = (
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.VITE_PUBLIC_SITE_URL ||
    'https://hydrogenro.com'
  ).replace(/\/$/, '');

  try {
    const messaging = await getMessaging(db);
    const { sent, tokens } = await sendToTechnicianDevices(
      db,
      messaging,
      id,
      (token) => ({
        token,
        data: {
          type: 'location_request',
          technicianId: id,
          uploadUrl: `${siteUrl}/.netlify/functions/upload-tech-location`,
          ...(nonceErr ? {} : { nonce }),
        },
        android: { priority: 'high' },
      }),
      'location_ping'
    );
    if (tokens === 0) return { sent: false, reason: 'no_token' };
    if (sent === 0) return { sent: false, reason: 'stale_token' };
    return { sent: true };
  } catch (err) {
    console.error('[location-ping-helper] send failed', err?.message || err);
    return { sent: false, reason: 'push_failed' };
  }
}

module.exports = {
  PING_MIN_INTERVAL_MS,
  pingRequestedAgeMs,
  sendTechnicianLocationPing,
};
