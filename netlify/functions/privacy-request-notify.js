/**
 * Soft-fail FCM to admin phones when a privacy / DSAR request is submitted.
 */
const {
  getMessaging,
  getAdminFcmTokens,
  pruneAdminFcmTokens,
  isStaleTokenError,
} = require('./fcm-helper');

const COLOR = '#0F766E'; // teal

function labelRequestType(type) {
  const t = String(type || 'request').replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {{ id: string, requestType?: string, brand?: string, name?: string, phone?: string }} details
 */
async function notifyAdminsPrivacyRequest(db, details) {
  try {
    const tokens = [...new Set(await getAdminFcmTokens(db, 'privacy_request'))];
    if (tokens.length === 0) return { sent: 0, reason: 'no_tokens' };

    const typeLabel = labelRequestType(details.requestType);
    const brand = String(details.brand || 'hydrogenro');
    const name = String(details.name || '').trim();
    const phone = String(details.phone || '').replace(/\D/g, '').slice(-10);
    const who = name || (phone ? `···${phone.slice(-4)}` : 'Customer');
    const title = `Privacy request · ${typeLabel}`;
    const body = `${who} · ${brand}${phone ? ` · ${phone}` : ''}`;

    const messaging = await getMessaging(db);
    const res = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: {
        type: 'privacy_request',
        kind: 'settings',
        panel: 'privacy-center',
        requestId: String(details.id || ''),
        color: COLOR,
        tag: `privacy_req_${details.id || phone || 'new'}`,
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'job_alerts_v2',
          defaultSound: true,
          color: COLOR,
          tag: `privacy_req_${details.id || phone || 'new'}`,
        },
      },
    });

    const stale = [];
    res.responses.forEach((r, i) => {
      if (!r.success && isStaleTokenError(r.error)) stale.push(tokens[i]);
    });
    if (stale.length) await pruneAdminFcmTokens(db, stale);

    const sent = res.successCount || 0;
    console.log('[privacy-request-notify] sent', sent, 'of', tokens.length);
    return { sent, failed: res.failureCount || 0 };
  } catch (err) {
    console.warn('[privacy-request-notify] soft-fail', err?.message || err);
    return { sent: 0, reason: 'error' };
  }
}

module.exports = { notifyAdminsPrivacyRequest };
