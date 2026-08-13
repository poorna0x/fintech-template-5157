// Nightly: refresh current IST month WhatsApp usage snapshot (cold + session + estimate).
// Schedule: 10:35 PM IST = 17:05 UTC (see netlify.toml).

const { createClient } = require('@supabase/supabase-js');
const { assertScheduledInvoke } = require('./schedule-guard');

function currentIstMonthKey() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value || '1970';
  const m = parts.find((p) => p.type === 'month')?.value || '01';
  return `${y}-${m}`;
}

exports.handler = async (event) => {
  const cron = assertScheduledInvoke(event);
  if (!cron.ok) {
    return { statusCode: cron.statusCode, body: cron.body };
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    console.error('[whatsapp-usage-monthly-rollup] missing Supabase env');
    return { statusCode: 500, body: 'Server misconfigured' };
  }

  const monthKey = currentIstMonthKey();
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await db.rpc('whatsapp_usage_monthly_refresh', {
    p_month_key: monthKey,
  });

  if (error) {
    console.error('[whatsapp-usage-monthly-rollup] RPC failed', error.message);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: error.message }) };
  }

  console.log('[whatsapp-usage-monthly-rollup] saved', monthKey, JSON.stringify(data));
  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, month_key: monthKey, snapshot: data }),
  };
};
