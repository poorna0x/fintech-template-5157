// Called by the HRO Admin app when the admin taps Yes/No on a cash-check
// notification (nightly today, or morning follow-up for yesterday's pending).
//
// No: remind the technician + queue morning follow-up (technician_cash_pending).
// Yes: clear any pending row for that tech/date (cash received).
//
// HMAC signature from the push authenticates the reply (no session).

const { createClient } = require('@supabase/supabase-js');
const { getMessaging } = require('./fcm-helper');
const { sendCashHandoverReminder } = require('./cash-handover-push');
const { verifyCashCheckSig } = require('./cash-check-hmac');

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
  // Default "no" keeps older Admin APKs (No-only POST) working.
  const response = String(body.response || 'no').trim().toLowerCase();
  if (!technicianId || !date || !amount || !sig) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing fields' }) };
  }
  if (response !== 'yes' && response !== 'no') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid response' }) };
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  if (!verifyCashCheckSig(technicianId, date, amount, sig)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Bad signature' }) };
  }
  // Night ask may be answered after midnight; morning ask uses yesterday's date.
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

  // Yes = cash received — drop any pending morning follow-up for this tech/day.
  if (response === 'yes') {
    try {
      const { error: delErr } = await db
        .from('technician_cash_pending')
        .delete()
        .eq('technician_id', technicianId)
        .eq('cash_date', date);
      if (delErr) {
        console.warn('[cash-check-response] pending clear failed:', delErr.message);
      }
    } catch (err) {
      console.warn('[cash-check-response] pending clear error:', err?.message || err);
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, response: 'yes' }) };
  }

  // No = still unpaid — queue morning admin/tech follow-up + remind tech now.
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
