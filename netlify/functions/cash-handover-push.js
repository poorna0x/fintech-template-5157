// Shared: push "hand over cash" to a technician's devices.
const { sendToTechnicianDevices } = require('./fcm-helper');

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {import('firebase-admin').messaging.Messaging} messaging
 * @param {string} technicianId
 * @param {string|number} amountInr
 * @param {{ forYesterday?: boolean }} [opts]
 */
async function sendCashHandoverReminder(db, messaging, technicianId, amountInr, opts = {}) {
  const amount = Number(amountInr);
  const rupees = `₹${(Number.isFinite(amount) ? amount : 0).toLocaleString('en-IN')}`;
  const whose = opts.forYesterday ? "yesterday's" : "today's";
  const title = 'Cash pending — hand over to office';
  const body = `Please hand over ${whose} cash collection of ${rupees} to the office.`;
  const result = await sendToTechnicianDevices(
    db,
    messaging,
    technicianId,
    (token) => ({
      token,
      notification: {
        title,
        body,
      },
      data: { type: 'job_notification', event: 'cash_handover' },
      android: {
        priority: 'high',
        notification: {
          channelId: 'job_alerts_v2',
          defaultSound: true,
          color: '#DC2626',
          tag: opts.forYesterday ? 'cash-reminder-morning' : 'cash-reminder',
        },
      },
    }),
    'cash_handover'
  );
  try {
    const { maybeSendTechnicianPushWhatsApp } = require('./tech-push-whatsapp-helper');
    await maybeSendTechnicianPushWhatsApp(db, {
      technicianId,
      category: 'cash_handover',
      title,
      body,
    });
  } catch {
    /* never block cash push */
  }
  return result;
}

module.exports = { sendCashHandoverReminder };
