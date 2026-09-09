// Scheduled: every day at 8:30 AM IST (03:00 UTC — see netlify.toml).
// For technicians still owed yesterday's cash (admin tapped No at 9 PM):
//  1) Push the technician again to hand over yesterday's cash
//  2) Ask admins Yes/No: "Has he handed over yesterday's remaining cash?"
// Yes clears technician_cash_pending; No re-pushes the technician.

const { createClient } = require('@supabase/supabase-js');
const {
  getMessaging,
  isStaleTokenError,
  getAdminFcmTokens,
  pruneAdminFcmTokens,
} = require('./fcm-helper');
const { sendCashHandoverReminder } = require('./cash-handover-push');
const { assertScheduledInvoke } = require('./schedule-guard');
const { requireCashCheckSignSecret, signCashCheck } = require('./cash-check-hmac');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Yesterday's IST calendar date as yyyy-mm-dd. */
function istYesterdayLabel() {
  const ist = new Date(Date.now() + IST_OFFSET_MS - 24 * 60 * 60 * 1000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`;
}

exports.handler = async (event) => {
  const cron = assertScheduledInvoke(event);
  if (!cron.ok) {
    return { statusCode: cron.statusCode, body: cron.body };
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    console.error('[morning-cash-reminder] missing Supabase env');
    return { statusCode: 500, body: 'Server misconfigured' };
  }
  const hmac = requireCashCheckSignSecret();
  if (!hmac.ok) {
    console.error('[morning-cash-reminder]', hmac.error);
    return { statusCode: 500, body: 'Server misconfigured' };
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const yesterday = istYesterdayLabel();
  const weekAgo = (() => {
    const ist = new Date(Date.now() + IST_OFFSET_MS - 7 * 24 * 60 * 60 * 1000);
    return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`;
  })();

  // Any unpaid cash still queued (admin said No). Include older dates so a
  // morning "No" (which resets morning_sent_at) is asked again the next day.
  const { data: rows, error } = await db
    .from('technician_cash_pending')
    .select('id,technician_id,amount_inr,cash_date')
    .is('morning_sent_at', null)
    .gte('cash_date', weekAgo)
    .lte('cash_date', yesterday);

  if (error) {
    // Table may not exist yet — run scripts/add-technician-cash-pending.sql.
    console.error('[morning-cash-reminder] query failed', error.message);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: error.message }) };
  }

  if (!rows?.length) {
    return { statusCode: 200, body: JSON.stringify({ sent: 0, reason: 'none_pending', date: yesterday }) };
  }

  const technicianIds = [...new Set(rows.map((r) => r.technician_id))];
  const [{ data: techs }, adminTokens, messaging] = await Promise.all([
    db.from('technicians').select('id,full_name').in('id', technicianIds),
    getAdminFcmTokens(db, 'cash_check'),
    getMessaging(db),
  ]);
  const nameById = new Map((techs || []).map((t) => [t.id, t.full_name || 'Technician']));

  const siteUrl = (process.env.URL || 'https://hydrogenro.com').replace(/\/$/, '');
  const replyUrl = `${siteUrl}/.netlify/functions/cash-check-response`;

  let techPushed = 0;
  let adminPushed = 0;
  const staleTokens = new Set();
  const nowIso = new Date().toISOString();

  for (const row of rows) {
    const amountInr = Math.round(Number(row.amount_inr) || 0);
    if (amountInr <= 0) continue;
    const amount = String(amountInr);
    const cashDate = String(row.cash_date || yesterday).slice(0, 10);
    const techName = nameById.get(row.technician_id) || 'Technician';
    const isYesterday = cashDate === yesterday;

    // 1) Remind the technician.
    try {
      const { sent, tokens } = await sendCashHandoverReminder(
        db,
        messaging,
        row.technician_id,
        amountInr,
        { forYesterday: true }
      );
      if (tokens === 0) {
        console.warn('[morning-cash-reminder] no token for', row.technician_id);
      } else if (sent === 0) {
        console.warn('[morning-cash-reminder] stale tokens for', row.technician_id);
      } else {
        techPushed += 1;
      }
    } catch (err) {
      console.warn(
        '[morning-cash-reminder] tech push failed for',
        row.technician_id,
        err?.message || err
      );
    }

    // 2) Ask admins Yes/No about remaining cash (signed for that cash_date).
    if (adminTokens.length > 0) {
      try {
        const sig = signCashCheck(row.technician_id, cashDate, amount, hmac.secret);
        const rupees = amount.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        const whenLabel = isYesterday ? 'yesterday' : cashDate;
        const res = await messaging.sendEachForMulticast({
          tokens: adminTokens,
          data: {
            type: 'cash_check',
            technicianId: row.technician_id,
            techName,
            amount,
            date: cashDate,
            sig,
            replyUrl,
            title: `Cash still due — ${techName}`,
            body: `${techName} still owes ₹${rupees} from ${whenLabel}. Has he handed it over?`,
          },
          android: { priority: 'high' },
        });
        adminPushed += res.successCount;
        res.responses.forEach((r, i) => {
          if (!r.success && isStaleTokenError(r.error)) staleTokens.add(adminTokens[i]);
        });
      } catch (err) {
        console.warn(
          '[morning-cash-reminder] admin ask failed for',
          row.technician_id,
          err?.message || err
        );
      }
    }

    await db
      .from('technician_cash_pending')
      .update({ morning_sent_at: nowIso })
      .eq('id', row.id);
  }

  if (staleTokens.size > 0) {
    await pruneAdminFcmTokens(db, [...staleTokens]);
  }

  console.log(
    `[morning-cash-reminder] ${yesterday}: tech=${techPushed}/${rows.length}, admin=${adminPushed}`
  );
  return {
    statusCode: 200,
    body: JSON.stringify({
      date: yesterday,
      pending: rows.length,
      techSent: techPushed,
      adminSent: adminPushed,
    }),
  };
};
