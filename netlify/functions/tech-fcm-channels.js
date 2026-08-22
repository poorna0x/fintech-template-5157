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

module.exports = {
  TECH_FCM_CHANNEL_ASSIGN,
  TECH_FCM_CHANNEL_GENERAL,
  techChannelForJobEvent,
};
