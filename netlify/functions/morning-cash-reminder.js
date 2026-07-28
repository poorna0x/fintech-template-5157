// Scheduled: every day at 8:30 AM IST (03:00 UTC — see netlify.toml).
// Re-pushes technicians who still owe yesterday's cash (admin tapped No on
// the 9 PM cash check). Rows come from technician_cash_pending.

const { createClient } = require('@supabase/supabase-js');
const { getMessaging } = require('./fcm-helper');
const { sendCashHandoverReminder } = require('./cash-handover-push');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Yesterday's IST calendar date as yyyy-mm-dd. */
function istYesterdayLabel() {
  const ist = new Date(Date.now() + IST_OFFSET_MS - 24 * 60 * 60 * 1000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`;
}

exports.handler = async () => {
  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    console.error('[morning-cash-reminder] missing Supabase env');
    return { statusCode: 500, body: 'Server misconfigured' };
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const yesterday = istYesterdayLabel();

  // Pending rows for yesterday's collection that haven't had the morning nudge.
  const { data: rows, error } = await db
    .from('technician_cash_pending')
    .select('id,technician_id,amount_inr,cash_date')
    .eq('cash_date', yesterday)
    .is('morning_sent_at', null);

  if (error) {
    // Table may not exist yet — run scripts/add-technician-cash-pending.sql.
    console.error('[morning-cash-reminder] query failed', error.message);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: error.message }) };
  }

  if (!rows?.length) {
    return { statusCode: 200, body: JSON.stringify({ sent: 0, reason: 'none_pending', date: yesterday }) };
  }

  const messaging = await getMessaging(db);
  let pushed = 0;
  const nowIso = new Date().toISOString();

  for (const row of rows) {
    try {
      const { sent, tokens } = await sendCashHandoverReminder(
        db,
        messaging,
        row.technician_id,
        row.amount_inr,
        { forYesterday: true }
      );
      if (tokens === 0) {
        console.warn('[morning-cash-reminder] no token for', row.technician_id);
        continue;
      }
      if (sent === 0) {
        console.warn('[morning-cash-reminder] stale tokens for', row.technician_id);
        continue;
      }
      await db
        .from('technician_cash_pending')
        .update({ morning_sent_at: nowIso })
        .eq('id', row.id);
      pushed += 1;
    } catch (err) {
      console.warn(
        '[morning-cash-reminder] push failed for',
        row.technician_id,
        err?.message || err
      );
    }
  }

  console.log(`[morning-cash-reminder] ${yesterday}: ${pushed}/${rows.length} technician(s) reminded`);
  return {
    statusCode: 200,
    body: JSON.stringify({ date: yesterday, pending: rows.length, sent: pushed }),
  };
};
