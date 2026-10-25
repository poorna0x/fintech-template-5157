// Scheduled: 8:35 AM IST (03:05 UTC — see netlify.toml).
// If an admin tapped No on last night's parts check, ask Yes/No once more.
// The row is deleted after that ask. A morning No is not stored.

const { createClient } = require('@supabase/supabase-js');
const {
  getMessaging,
  isStaleTokenError,
  getAdminFcmTokens,
  sendAdminMulticast,
  pruneAdminFcmTokens,
} = require('./fcm-helper');
const { assertScheduledInvoke } = require('./schedule-guard');
const { requireCashCheckSignSecret, signPartsCheck } = require('./cash-check-hmac');
const { clearPartsCheckPending, readPartsCheckPending } = require('./parts-check-pending');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istDateLabel(offsetDays) {
  const ist = new Date(Date.now() + IST_OFFSET_MS + offsetDays * 24 * 60 * 60 * 1000);
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
    console.error('[morning-parts-check] missing Supabase env');
    return { statusCode: 500, body: 'Server misconfigured' };
  }
  const hmac = requireCashCheckSignSecret();
  if (!hmac.ok) {
    console.error('[morning-parts-check]', hmac.error);
    return { statusCode: 500, body: 'Server misconfigured' };
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const yesterday = istDateLabel(-1);
  let pending;
  try {
    pending = await readPartsCheckPending(db);
  } catch (err) {
    console.error('[morning-parts-check] read failed', err?.message || err);
    return { statusCode: 500, body: 'Query failed' };
  }

  if (!pending) {
    return { statusCode: 200, body: JSON.stringify({ sent: 0, reason: 'none_pending' }) };
  }
  if (pending.workDate !== yesterday) {
    if (pending.workDate < yesterday) {
      try {
        await clearPartsCheckPending(db);
      } catch (err) {
        console.warn('[morning-parts-check] stale clear failed', err?.message || err);
      }
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ sent: 0, reason: 'not_yesterday', workDate: pending.workDate }),
    };
  }

  const adminTokens = await getAdminFcmTokens(db, 'parts_reminder');
  if (adminTokens.length === 0) {
    return { statusCode: 200, body: JSON.stringify({ sent: 0, reason: 'no_admin_tokens' }) };
  }

  const siteUrl = (process.env.URL || 'https://hydrogenro.com').replace(/\/$/, '');
  const replyUrl = `${siteUrl}/.netlify/functions/parts-check-response`;
  const sig = signPartsCheck(yesterday, 'morning', hmac.secret);
  const messaging = await getMessaging(db);
  const res = await sendAdminMulticast(db, messaging, {
    tokens: adminTokens,
    data: {
      type: 'parts_check',
      ask: 'morning',
      date: yesterday,
      sig,
      replyUrl,
      title: 'Parts check — yesterday',
      body: "Yesterday's parts were not confirmed. Are they logged now?",
    },
    android: { priority: 'high' },
  });

  const stale = [];
  res.responses.forEach((r, i) => {
    if (!r.success && isStaleTokenError(r.error)) stale.push(adminTokens[i]);
  });
  if (stale.length > 0) await pruneAdminFcmTokens(db, stale);

  if (res.successCount > 0) {
    try {
      await clearPartsCheckPending(db);
    } catch (err) {
      console.error('[morning-parts-check] clear after ask failed', err?.message || err);
      return { statusCode: 500, body: 'Asked, but could not clear the follow-up' };
    }
  }

  console.log(`[morning-parts-check] ${yesterday}: admin=${res.successCount}`);
  return {
    statusCode: 200,
    body: JSON.stringify({ date: yesterday, sent: res.successCount }),
  };
};
