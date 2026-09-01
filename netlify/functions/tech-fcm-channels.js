/**
 * Android notification channel ids for the technician APK.
 *
 * - Assign / reassign keep the classic tech_alert sound (job_alerts_v2).
 * - All other technician pushes use universfield_notification (tech_general_v1).
 * Channels are created natively in NotificationChannels.java — never from JS.
 */

const TECH_FCM_CHANNEL_ASSIGN = 'job_alerts_v2';
const TECH_FCM_CHANNEL_GENERAL = 'tech_general_v1';

/** Classic assign sound only for assigned / reassigned. */
function techChannelForJobEvent(event) {
  const e = String(event || '')
    .trim()
    .toLowerCase();
  if (e === 'assigned' || e === 'reassigned') return TECH_FCM_CHANNEL_ASSIGN;
  return TECH_FCM_CHANNEL_GENERAL;
}

/**
 * High-priority Android FCM so Doze / Samsung App Sleep delivers now instead
 * of batching. ttl 1h lets FCM retry if the phone is briefly offline.
 */
function androidUrgentPush(extra) {
  const extraObj = extra && typeof extra === 'object' ? extra : {};
  return {
    priority: 'high',
    ttl: 60 * 60 * 1000,
    directBootOk: true,
    ...extraObj,
  };
}

/** Tray tag: unique per job so a second assign does not collapse the first. */
function jobAlertTag(event, jobId, explicitTag) {
  const explicit = String(explicitTag || '').trim();
  if (/^[\w.-]{1,64}$/.test(explicit)) return explicit;
  const ev =
    String(event || 'alert')
      .trim()
      .toLowerCase()
      .replace(/[^\w.-]/g, '')
      .slice(0, 24) || 'alert';
  const id = String(jobId || '')
    .trim()
    .replace(/[^\w.-]/g, '')
    .slice(0, 36);
  return (id ? `job_alert_${ev}_${id}` : `job_alert_${ev}`).slice(0, 64);
}

function androidOsJobNotification({ channelId, tag, color, collapseKey }) {
  return androidUrgentPush({
    collapseKey: String(collapseKey || tag || 'job_alert').slice(0, 64),
    notification: {
      channelId,
      defaultSound: true,
      defaultVibrateTimings: true,
      notificationPriority: 'PRIORITY_MAX',
      visibility: 'public',
      tag: String(tag || 'job_alert').slice(0, 64),
      ...(color ? { color: String(color) } : {}),
    },
  });
}

module.exports = {
  TECH_FCM_CHANNEL_ASSIGN,
  TECH_FCM_CHANNEL_GENERAL,
  techChannelForJobEvent,
  androidUrgentPush,
  androidOsJobNotification,
  jobAlertTag,
};
