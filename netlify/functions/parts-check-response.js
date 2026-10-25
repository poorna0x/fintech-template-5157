// Admin APK Yes/No on the parts-check notification.
// Evening No: remember that day so tomorrow morning asks once.
// Morning No: do not save anything. Yes: drop a queued morning ask.

const { createClient } = require('@supabase/supabase-js');
const { verifyPartsCheckSig } = require('./cash-check-hmac');
const { clearPartsCheckPending, readPartsCheckPending, savePartsCheckEveningNo } = require('./parts-check-pending');

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

  const date = String(body.date || '').trim();
  const ask = String(body.ask || '').trim().toLowerCase();
  const sig = String(body.sig || '').trim();
  const response = String(body.response || '').trim().toLowerCase();
  if (!date || !sig || (ask !== 'evening' && ask !== 'morning')) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing fields' }) };
  }
  if (response !== 'yes' && response !== 'no') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid response' }) };
  }
  if (!verifyPartsCheckSig(date, ask, sig)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Bad signature' }) };
  }

  const today = istDateLabel(0);
  const yesterday = istDateLabel(-1);
  if (ask === 'evening' && date !== today) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Expired' }) };
  }
  if (ask === 'morning' && date !== yesterday) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Expired' }) };
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    if (ask === 'morning') {
      // One morning question only. Yes or No both drop the row; No is not saved.
      const pending = await readPartsCheckPending(db);
      if (pending && pending.workDate === date) await clearPartsCheckPending(db);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, response, ask }) };
    }

    if (response === 'yes') {
      const pending = await readPartsCheckPending(db);
      if (pending && pending.workDate === date) await clearPartsCheckPending(db);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, response: 'yes', ask }) };
    }

    await savePartsCheckEveningNo(db, date);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, response: 'no', ask, queued: true }) };
  } catch (err) {
    console.error('[parts-check-response]', err?.message || err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Could not save the answer' }) };
  }
};
