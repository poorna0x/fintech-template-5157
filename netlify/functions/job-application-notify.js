/**
 * Soft-fail FCM to admin phones when someone applies on elevenro.com/careers.
 */
const {
  getMessaging,
  getAdminFcmTokens,
  sendAdminMulticast,
  pruneAdminFcmTokens,
  isStaleTokenError,
} = require('./fcm-helper');

const COLOR = '#0284C7';

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {{ id: string, name?: string, phone?: string, area?: string }} details
 */
async function notifyAdminsJobApplication(db, details) {
  try {
    const tokens = [...new Set(await getAdminFcmTokens(db, 'job_application'))];
    if (tokens.length === 0) return { sent: 0, reason: 'no_tokens' };

    const name = String(details.name || '').trim() || 'Someone';
    const phone = String(details.phone || '').replace(/\D/g, '').slice(-10);
    const area = String(details.area || '').trim();
    const tail = phone ? `···${phone.slice(-4)}` : '';
    const title = 'New job application';
    const body = [name, tail, area].filter(Boolean).join(' · ');
    const tag = `job_app_${details.id || phone || 'new'}`;

    const messaging = await getMessaging(db);
    const res = await sendAdminMulticast(db, messaging, {
      tokens,
      notification: { title, body },
      data: {
        type: 'job_application',
        kind: 'settings',
        panel: 'job-applications',
        applicationId: String(details.id || ''),
        color: COLOR,
        tag,
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'job_alerts_v2',
          defaultSound: true,
          color: COLOR,
          tag,
        },
      },
    });

    const stale = [];
    res.responses.forEach((r, i) => {
      if (!r.success && isStaleTokenError(r.error)) stale.push(tokens[i]);
    });
    if (stale.length) await pruneAdminFcmTokens(db, stale);

    const sent = res.successCount || 0;
    console.log('[job-application-notify] sent', sent, 'of', tokens.length);
    return { sent, failed: res.failureCount || 0 };
  } catch (err) {
    console.warn('[job-application-notify] soft-fail', err?.message || err);
    return { sent: 0, reason: 'error' };
  }
}

module.exports = { notifyAdminsJobApplication };
