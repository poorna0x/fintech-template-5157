// Scheduled: every Monday at 2:00 AM IST (Sunday 20:30 UTC — see netlify.toml).
// Purges short-lived operational rows via purge_ephemeral_data() RPC.
// One DB round trip: indexed DELETEs + post-delete verification counts.

const { createClient } = require('@supabase/supabase-js');
const { assertScheduledInvoke } = require('./schedule-guard');

const RETENTION_DAYS = 7;

exports.handler = async (event) => {
  const cron = assertScheduledInvoke(event);
  if (!cron.ok) {
    return { statusCode: cron.statusCode, body: cron.body };
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    console.error('[ephemeral-data-cleanup] missing Supabase env');
    return { statusCode: 500, body: 'Server misconfigured' };
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await db.rpc('purge_ephemeral_data', {
    p_retention_days: RETENTION_DAYS,
  });

  if (error) {
    console.error('[ephemeral-data-cleanup] RPC failed', error.message);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: error.message }) };
  }

  let compliance = null;
  try {
    const { data: cData, error: cErr } = await db.rpc('purge_compliance_retention');
    if (cErr) {
      console.warn('[ephemeral-data-cleanup] compliance purge', cErr.message);
    } else {
      compliance = cData;
    }
  } catch (err) {
    console.warn('[ephemeral-data-cleanup] compliance purge', err?.message || err);
  }

  const report = { ...(data || {}), compliance };
  const verified = report.verified === true;

  if (!verified) {
    console.error('[ephemeral-data-cleanup] stale rows remain after purge', report);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, verified: false, report }),
    };
  }

  console.log('[ephemeral-data-cleanup] purge complete', JSON.stringify(report));
  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, verified: true, report }),
  };
};
