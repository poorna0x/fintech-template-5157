// Scheduled: every day at 9:15 PM IST (15:45 UTC — see netlify.toml).
// Asks admins whether today's technician expenses and business expenses were
// all recorded. Yes dismisses; No opens Payments → Add expense (admin APK).

const { createClient } = require('@supabase/supabase-js');
const { getMessaging, isStaleTokenError, getAdminFcmTokens, pruneAdminFcmTokens } = require('./fcm-helper');
const { assertScheduledInvoke } = require('./schedule-guard');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istTodayLabel() {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ist.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const REVIEWS = [
  {
    kind: 'technician',
    title: 'Technician expenses — today',
    body: 'Were all technician expenses for today added in Payments?',
  },
  {
    kind: 'business',
    title: 'Business expenses — today',
    body: 'Were all business expenses for today added in Payments?',
  },
];

exports.handler = async (event) => {
  const cron = assertScheduledInvoke(event);
  if (!cron.ok) {
    return { statusCode: cron.statusCode, body: cron.body };
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    console.error('[daily-expense-review] missing Supabase env');
    return { statusCode: 500, body: 'Server misconfigured' };
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const dateLabel = istTodayLabel();
  const tokens = await getAdminFcmTokens(db, 'cash_check');
  if (tokens.length === 0) {
    return { statusCode: 200, body: JSON.stringify({ sent: 0, reason: 'no_admin_tokens', date: dateLabel }) };
  }

  let messaging;
  try {
    messaging = await getMessaging(db);
  } catch (err) {
    console.error('[daily-expense-review] FCM init failed', err?.message || err);
    return { statusCode: 500, body: 'FCM init failed' };
  }

  let sent = 0;
  const staleTokens = new Set();

  for (const review of REVIEWS) {
    const res = await messaging.sendEachForMulticast({
      tokens,
      data: {
        type: 'expense_review',
        kind: review.kind,
        title: review.title,
        body: review.body,
        date: dateLabel,
        addExpense: review.kind,
      },
      android: { priority: 'high' },
    });
    sent += res.successCount;
    res.responses.forEach((r, i) => {
      if (!r.success && isStaleTokenError(r.error)) staleTokens.add(tokens[i]);
    });
  }

  if (staleTokens.size > 0) {
    await pruneAdminFcmTokens(db, [...staleTokens]);
  }

  console.log(`[daily-expense-review] ${dateLabel}: ${REVIEWS.length} review(s), ${sent} push(es)`);
  return {
    statusCode: 200,
    body: JSON.stringify({ date: dateLabel, reviews: REVIEWS.length, sent }),
  };
};
