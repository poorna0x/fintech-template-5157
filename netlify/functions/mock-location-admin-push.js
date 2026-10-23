/**
 * One admin push when a technician phone first reports a mock location.
 * A later sample while the flag is already set does not send again.
 * A genuine fix clears the flag, so the next mock location alerts again.
 * Push failure must not fail the location upload.
 */
const { getMessaging, getAdminFcmTokens, sendAdminMulticast } = require('./fcm-helper');

function isFirstMockReport(isMockLocation, alreadyMock) {
  return isMockLocation === true && alreadyMock !== true;
}

async function notifyAdminsOfMockLocation(db, technicianId) {
  const id = String(technicianId || '').trim();
  if (!id) return { sent: 0, reason: 'no_id' };

  const now = new Date().toISOString();
  const { data: claimed, error: claimErr } = await db
    .from('technician_live_locations')
    .update({
      location_mock: true,
      location_risk_score: 80,
      location_risk_level: 'confirmed',
      location_risk_reasons: 'mock_provider',
      location_risk_checked_at: now,
      updated_at: now,
    })
    .eq('technician_id', id)
    .eq('location_mock', false)
    .select('technician_id');

  if (claimErr) {
    console.warn('[mock-location] could not claim alert', claimErr.message);
    return { sent: 0, reason: 'claim_failed' };
  }
  if (!Array.isArray(claimed) || claimed.length === 0) {
    return { sent: 0, reason: 'already_flagged' };
  }

  const { data: tech } = await db
    .from('technicians')
    .select('full_name')
    .eq('id', id)
    .maybeSingle();
  const techName = String(tech?.full_name || 'A technician')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'A technician';

  const tokens = await getAdminFcmTokens(db, 'mock_location');
  if (tokens.length === 0) return { sent: 0, reason: 'no_tokens' };

  try {
    const messaging = await getMessaging(db);
    const res = await sendAdminMulticast(db, messaging, {
      tokens,
      notification: {
        title: 'Mock location',
        body: `${techName} is using a mock location. The live map was not updated.`,
      },
      data: {
        type: 'mock_location',
        technicianId: id,
        techName,
        tag: `mock_loc_${id}`,
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'job_alerts_v2',
          defaultSound: true,
          color: '#0369A1',
          tag: `mock_loc_${id}`,
        },
      },
    });
    return { sent: res.successCount || 0 };
  } catch (err) {
    console.error('[mock-location] admin push failed', err?.message || err);
    return { sent: 0, reason: 'push_failed' };
  }
}

module.exports = {
  isFirstMockReport,
  notifyAdminsOfMockLocation,
};
