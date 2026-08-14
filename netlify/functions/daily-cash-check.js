// Scheduled: every day at 9:00 PM IST (15:30 UTC — see netlify.toml).
// Totals each technician's cash collections for the day (full-cash jobs +
// the cash part of partial payments) and pushes one Yes/No question per
// technician to every admin phone (HRO Admin app): "Has he given the cash?"
// Tapping No fires cash-check-response, which reminds the technician.
//
// The Yes/No reply is authenticated by an HMAC signature embedded in the
// push payload — no state is stored anywhere.

const { createClient } = require('@supabase/supabase-js');
const { getMessaging, isStaleTokenError, getAdminFcmTokens, pruneAdminFcmTokens } = require('./fcm-helper');
const { assertScheduledInvoke } = require('./schedule-guard');
const { requireCashCheckSignSecret, signCashCheck } = require('./cash-check-hmac');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Start of the current IST day + its yyyy-mm-dd label. */
function istToday() {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const d = ist.getUTCDate();
  return {
    startUtc: new Date(Date.UTC(y, m, d) - IST_OFFSET_MS),
    dateLabel: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
  };
}

/** Cash portion of a completed job (0 when paid online). Honors pending_payment.paid_today. */
function cashAmountForJob(job) {
  let reqs = [];
  try {
    const raw = job.requirements;
    if (typeof raw === 'string') reqs = JSON.parse(raw);
    else if (Array.isArray(raw)) reqs = raw;
  } catch {
    reqs = [];
  }
  const pendingRow = reqs.find((r) => r && r.pending_payment && typeof r.pending_payment === 'object');
  const pending = pendingRow?.pending_payment;
  if (pending && !pending.settled_at) {
    const mode = String(pending.paid_today_mode || '').toUpperCase();
    const paid = Number(pending.paid_today) || 0;
    if (mode === 'PARTIAL') {
      const partial = reqs.find((r) => r && r.partial_cash_amount != null);
      const n = Number(partial?.partial_cash_amount);
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
    if (mode === 'CASH') {
      return Number.isFinite(paid) && paid > 0 ? paid : 0;
    }
    return 0;
  }

  const method = String(job.payment_method || '').toUpperCase();
  if (method === 'CASH') {
    const n = Number(job.payment_amount ?? job.actual_cost);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  if (method === 'PARTIAL') {
    const partial = reqs.find((r) => r && r.partial_cash_amount != null);
    const n = Number(partial?.partial_cash_amount);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  return 0;
}

exports.handler = async (event) => {
  const cron = assertScheduledInvoke(event);
  if (!cron.ok) {
    return { statusCode: cron.statusCode, body: cron.body };
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    console.error('[daily-cash-check] missing Supabase env');
    return { statusCode: 500, body: 'Server misconfigured' };
  }
  const hmac = requireCashCheckSignSecret();
  if (!hmac.ok) {
    console.error('[daily-cash-check]', hmac.error);
    return { statusCode: 500, body: 'Server misconfigured' };
  }
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { startUtc, dateLabel } = istToday();

  // Include null payment_method (pending with nothing paid today still has jobs;
  // cashAmountForJob returns 0 for those). Also CASH/PARTIAL for paid-today cash.
  const { data: jobs, error: jobsErr } = await db
    .from('jobs')
    .select('assigned_technician_id,payment_method,payment_amount,actual_cost,requirements')
    .eq('status', 'COMPLETED')
    .gte('completed_at', startUtc.toISOString())
    .not('assigned_technician_id', 'is', null)
    .or('payment_method.in.(CASH,PARTIAL),payment_method.is.null');
  if (jobsErr) {
    console.error('[daily-cash-check] jobs query failed', jobsErr.message);
    return { statusCode: 500, body: 'Query failed' };
  }

  const cashByTechnician = new Map();
  for (const job of jobs || []) {
    const cash = cashAmountForJob(job);
    if (cash <= 0) continue;
    const id = job.assigned_technician_id;
    cashByTechnician.set(id, (cashByTechnician.get(id) || 0) + cash);
  }
  if (cashByTechnician.size === 0) {
    return { statusCode: 200, body: JSON.stringify({ sent: 0, reason: 'no_cash_today' }) };
  }

  const technicianIds = [...cashByTechnician.keys()];
  const [{ data: techs }, adminTokens] = await Promise.all([
    db.from('technicians').select('id,full_name').in('id', technicianIds),
    getAdminFcmTokens(db, 'cash_check'),
  ]);
  if (adminTokens.length === 0) {
    return { statusCode: 200, body: JSON.stringify({ sent: 0, reason: 'no_admin_tokens' }) };
  }
  const nameById = new Map((techs || []).map((t) => [t.id, t.full_name || 'Technician']));

  const siteUrl = (process.env.URL || 'https://hydrogenro.com').replace(/\/$/, '');
  const replyUrl = `${siteUrl}/.netlify/functions/cash-check-response`;

  const messaging = await getMessaging(db);
  let sent = 0;
  const staleTokens = new Set();

  for (const [technicianId, cash] of cashByTechnician) {
    const amount = String(Math.round(cash));
    const techName = nameById.get(technicianId) || 'Technician';
    const sig = signCashCheck(technicianId, dateLabel, amount, hmac.secret);

    // Data-only push: the admin app's native HroMessagingService turns it
    // into a notification with Yes/No action buttons.
    const res = await messaging.sendEachForMulticast({
      tokens: adminTokens,
      data: {
        type: 'cash_check',
        technicianId,
        techName,
        amount,
        date: dateLabel,
        sig,
        replyUrl,
      },
      android: { priority: 'high' },
    });
    sent += res.successCount;
    res.responses.forEach((r, i) => {
      if (!r.success && isStaleTokenError(r.error)) staleTokens.add(adminTokens[i]);
    });
  }

  if (staleTokens.size > 0) {
    await pruneAdminFcmTokens(db, [...staleTokens]);
  }

  console.log(`[daily-cash-check] ${dateLabel}: ${cashByTechnician.size} technician(s), ${sent} push(es)`);
  return { statusCode: 200, body: JSON.stringify({ technicians: cashByTechnician.size, sent }) };
};
