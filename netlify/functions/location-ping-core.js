// Shared: wake a technician Android app for a live-location upload.
const { getMessaging, sendToTechnicianDevices } = require('./fcm-helper');

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string} technicianId
 * @returns {Promise<{ sent: boolean, reason?: string, devices?: number }>}
 */
async function sendTechnicianLocationPing(db, technicianId) {
  const techId = String(technicianId || '').trim();
  if (!techId) return { sent: false, reason: 'no_technician' };

  const { data: row, error: rowErr } = await db
    .from('technician_live_locations')
    .select('is_tracking')
    .eq('technician_id', techId)
    .maybeSingle();

  if (rowErr) {
    console.error('[location-ping] lookup failed', rowErr.message);
    return { sent: false, reason: 'lookup_failed' };
  }
  if (!row) return { sent: false, reason: 'no_row' };
  if (!row.is_tracking) return { sent: false, reason: 'sharing_off' };

  const nonce = require('crypto').randomUUID();
  const { error: nonceErr } = await db
    .from('technician_live_locations')
    .update({ ping_nonce: nonce, ping_requested_at: new Date().toISOString() })
    .eq('technician_id', techId);

  if (nonceErr) {
    console.error('[location-ping] nonce save failed', nonceErr.message);
  }

  const siteUrl = (process.env.URL || '').replace(/\/$/, '');

  try {
    const messaging = await getMessaging(db);
    const { sent, tokens } = await sendToTechnicianDevices(
      db,
      messaging,
      techId,
      (token) => ({
        token,
        data: {
          type: 'location_request',
          technicianId: techId,
          ...(nonceErr ? {} : { nonce }),
          ...(siteUrl ? { uploadUrl: `${siteUrl}/.netlify/functions/upload-tech-location` } : {}),
        },
        android: { priority: 'high' },
      }),
      'location_ping'
    );

    if (tokens === 0) return { sent: false, reason: 'no_token' };
    if (sent === 0) return { sent: false, reason: 'stale_token' };
    return { sent: true, devices: sent };
  } catch (err) {
    console.error('[location-ping] send failed', err?.message || err);
    return { sent: false, reason: 'push_failed' };
  }
}

module.exports = { sendTechnicianLocationPing };
