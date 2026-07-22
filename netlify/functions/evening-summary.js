// Scheduled: every day at 10:00 PM IST (16:30 UTC — see netlify.toml).
// One-glance day summary pushed to all admin phones (HRO Admin app):
// "9 completed · ₹12,400 collected (₹4,300 cash) · 2 jobs still open"

const { createClient } = require('@supabase/supabase-js');
const { getMessaging, isStaleTokenError, getAdminFcmTokens, pruneAdminFcmTokens } = require('./fcm-helper');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function rupees(n) {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

exports.handler = async () => {
  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    console.error('[evening-summary] missing Supabase env');
    return { statusCode: 500, body: 'Server misconfigured' };
  }
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const ist = new Date(Date.now() + IST_OFFSET_MS);
  const dayStartUtc = new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS
  );

  const [{ data: completed, error: compErr }, { count: openCount }, tokens] =
    await Promise.all([
      db
        .from('jobs')
        .select('payment_method,payment_amount,actual_cost,requirements')
        .eq('status', 'COMPLETED')
        .gte('completed_at', dayStartUtc.toISOString()),
      db
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .in('status', ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS']),
      getAdminFcmTokens(db, 'day_summary'),
    ]);
  if (compErr) {
    console.error('[evening-summary] jobs query failed', compErr.message);
    return { statusCode: 500, body: 'Query failed' };
  }
  if (tokens.length === 0) {
    return { statusCode: 200, body: JSON.stringify({ sent: 0, reason: 'no_tokens' }) };
  }

  let total = 0;
  let cash = 0;
  for (const job of completed || []) {
    const amount = Number(job.payment_amount ?? job.actual_cost);
    if (Number.isFinite(amount) && amount > 0) total += amount;

    const method = String(job.payment_method || '').toUpperCase();
    if (method === 'CASH') {
      if (Number.isFinite(amount) && amount > 0) cash += amount;
    } else if (method === 'PARTIAL') {
      try {
        const raw = job.requirements;
        const reqs = typeof raw === 'string' ? JSON.parse(raw) : Array.isArray(raw) ? raw : [];
        const partial = reqs.find((r) => r && r.partial_cash_amount != null);
        const c = Number(partial?.partial_cash_amount);
        if (Number.isFinite(c) && c > 0) cash += c;
      } catch {
        // ignore malformed requirements
      }
    }
  }

  const done = (completed || []).length;
  const open = openCount || 0;
  const title = done > 0 ? `Today: ${done} job${done === 1 ? '' : 's'} completed` : 'Today: no jobs completed';
  const parts = [];
  if (total > 0) parts.push(`${rupees(total)} collected${cash > 0 ? ` (${rupees(cash)} cash)` : ''}`);
  parts.push(`${open} job${open === 1 ? '' : 's'} still open`);
  const message = parts.join(' · ');

  const messaging = await getMessaging(db);
  const res = await messaging.sendEachForMulticast({
    tokens,
    notification: { title, body: message },
    data: { type: 'day_summary' },
    android: {
      priority: 'high',
      notification: {
        channelId: 'job_alerts_v2',
        defaultSound: true,
        color: '#2563EB',
        tag: 'evening-summary',
      },
    },
  });

  const stale = [];
  res.responses.forEach((r, i) => {
    if (!r.success && isStaleTokenError(r.error)) stale.push(tokens[i]);
  });
  if (stale.length > 0) {
    await pruneAdminFcmTokens(db, stale);
  }

  console.log(`[evening-summary] ${title} — ${message} → ${res.successCount} phone(s)`);
  return { statusCode: 200, body: JSON.stringify({ sent: res.successCount }) };
};
