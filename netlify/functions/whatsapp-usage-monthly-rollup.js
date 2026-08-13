// Nightly: refresh current IST month WhatsApp usage snapshot (cold + session + estimate).
// On the 1st–3rd, also freeze the previous month so history stays complete.
// Schedule: 10:35 PM IST = 17:05 UTC (see netlify.toml).

const { createClient } = require('@supabase/supabase-js');
const { assertScheduledInvoke } = require('./schedule-guard');

function istParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === 'year')?.value || '1970');
  const m = Number(parts.find((p) => p.type === 'month')?.value || '01');
  const d = Number(parts.find((p) => p.type === 'day')?.value || '01');
  return { year: y, month: m, day: d };
}

function monthKeyFromParts(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function previousMonthKey(year, month) {
  if (month <= 1) return monthKeyFromParts(year - 1, 12);
  return monthKeyFromParts(year, month - 1);
}

async function refreshMonth(db, monthKey) {
  const { data, error } = await db.rpc('whatsapp_usage_monthly_refresh', {
    p_month_key: monthKey,
  });
  if (error) {
    console.error('[whatsapp-usage-monthly-rollup] RPC failed', monthKey, error.message);
    return { ok: false, month_key: monthKey, error: error.message };
  }
  console.log('[whatsapp-usage-monthly-rollup] saved', monthKey, JSON.stringify(data));
  return { ok: true, month_key: monthKey, snapshot: data };
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

  const { year, month, day } = istParts();
  const monthKey = monthKeyFromParts(year, month);
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const current = await refreshMonth(db, monthKey);
  if (!current.ok) {
    return { statusCode: 500, body: JSON.stringify(current) };
  }

  const snapshots = [current];
  if (day <= 3) {
    snapshots.push(await refreshMonth(db, previousMonthKey(year, month)));
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, snapshots }),
  };
};
