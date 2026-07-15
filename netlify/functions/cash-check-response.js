// Called by the HRO Admin app when the admin taps "No" on the nightly
// cash-check notification (see daily-cash-check.js). Verifies the HMAC
// signature from the original push, then reminds the technician with a
// visible push: "Please hand over today's cash."
//
// No session auth — the notification tap happens outside the webview — so
// the HMAC signature (signed with the service key, never exposed) is the
// credential. It's only valid for that technician/date/amount and expires
// with the date check below.

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const {
  getMessaging,
  getTechnicianFcmToken,
  clearTechnicianFcmToken,
  isStaleTokenError,
} = require('./fcm-helper');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istDateLabel(offsetDays) {
  const ist = new Date(Date.now() + IST_OFFSET_MS + offsetDays * 24 * 60 * 60 * 1000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`;
}

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
  const date = String(body.date || '').trim();
  const amount = String(body.amount || '').trim();
  const sig = String(body.sig || '').trim();
  if (!technicianId || !date || !amount || !sig) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing fields' }) };
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  const expected = crypto
    .createHmac('sha256', serviceKey)
    .update(`cash-check|${technicianId}|${date}|${amount}`)
    .digest('hex');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Bad signature' }) };
  }
  // The 9 PM question may be answered after midnight; allow today + yesterday.
  if (date !== istDateLabel(0) && date !== istDateLabel(-1)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Expired' }) };
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const token = await getTechnicianFcmToken(db, technicianId).catch(() => null);
  if (!token) {
    return { statusCode: 200, headers, body: JSON.stringify({ sent: false, reason: 'no_token' }) };
  }

  const rupees = `₹${Number(amount).toLocaleString('en-IN')}`;
  try {
    const messaging = await getMessaging(db);
    await messaging.send({
      token,
      notification: {
        title: 'Cash pending — hand over to office',
        body: `Please hand over today's cash collection of ${rupees} to the office.`,
      },
      data: { type: 'job_notification' },
      android: {
        priority: 'high',
        notification: {
          channelId: 'job_alerts_v2',
          defaultSound: true,
          color: '#DC2626',
          tag: 'cash-reminder',
        },
      },
    });
    return { statusCode: 200, headers, body: JSON.stringify({ sent: true }) };
  } catch (err) {
    if (isStaleTokenError(err)) {
      await clearTechnicianFcmToken(db, technicianId);
      return { statusCode: 200, headers, body: JSON.stringify({ sent: false, reason: 'stale_token' }) };
    }
    console.error('[cash-check-response] send failed', err?.message || err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Push send failed' }) };
  }
};
