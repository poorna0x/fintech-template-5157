// Called by the HRO Admin app when the admin taps "No" on the nightly
// cash-check notification (see daily-cash-check.js). Verifies the HMAC
// signature from the original push, then reminds the technician with a
// visible push: "Please hand over today's cash."
//
// Also stores a pending row so morning-cash-reminder can push again at
// 8:30 AM IST the next day.
//
// No session auth — the notification tap happens outside the webview — so
// the HMAC signature (signed with the service key, never exposed) is the
// credential. It's only valid for that technician/date/amount and expires
// with the date check below.

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { getMessaging } = require('./fcm-helper');
const { sendCashHandoverReminder } = require('./cash-handover-push');

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

  const amountInr = Math.round(Number(amount));
  if (!Number.isFinite(amountInr) || amountInr <= 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid amount' }) };
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Queue for next-morning 8:30 AM IST reminder (scripts/add-technician-cash-pending.sql).
  try {
    const { error: upsertErr } = await db.from('technician_cash_pending').upsert(
      {
        technician_id: technicianId,
        cash_date: date,
        amount_inr: amountInr,
        morning_sent_at: null,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'technician_id,cash_date' }
    );
    if (upsertErr) {
      console.warn('[cash-check-response] pending upsert failed:', upsertErr.message);
    }
  } catch (err) {
    console.warn('[cash-check-response] pending upsert error:', err?.message || err);
  }

  try {
    const messaging = await getMessaging(db);
    const forYesterday = date === istDateLabel(-1);
    const { sent, tokens } = await sendCashHandoverReminder(
      db,
      messaging,
      technicianId,
      amountInr,
      { forYesterday }
    );
    if (tokens === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ sent: false, reason: 'no_token' }) };
    }
    if (sent === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ sent: false, reason: 'stale_token' }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ sent: true, devices: sent }) };
  } catch (err) {
    console.error('[cash-check-response] send failed', err?.message || err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Push send failed' }) };
  }
};
