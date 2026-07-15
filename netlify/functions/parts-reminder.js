// Scheduled: every day at 10:10 PM IST (16:40 UTC — see netlify.toml).
// Reminds technicians who completed jobs today to log every part they used,
// so inventory and job costs stay accurate.

const { createClient } = require('@supabase/supabase-js');
const { getMessaging, pruneTechnicianFcmTokens, isStaleTokenError } = require('./fcm-helper');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

exports.handler = async () => {
  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    console.error('[parts-reminder] missing Supabase env');
    return { statusCode: 500, body: 'Server misconfigured' };
  }
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const ist = new Date(Date.now() + IST_OFFSET_MS);
  const dayStartUtc = new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS
  );

  // Only technicians who actually worked today need the reminder.
  const { data: doneToday, error } = await db
    .from('jobs')
    .select('assigned_technician_id')
    .eq('status', 'COMPLETED')
    .gte('completed_at', dayStartUtc.toISOString())
    .not('assigned_technician_id', 'is', null);
  if (error) {
    console.error('[parts-reminder] jobs query failed', error.message);
    return { statusCode: 500, body: 'Query failed' };
  }

  const technicianIds = [...new Set((doneToday || []).map((j) => j.assigned_technician_id))];
  if (technicianIds.length === 0) {
    return { statusCode: 200, body: JSON.stringify({ sent: 0, reason: 'no_completed_jobs' }) };
  }

  // Every device of every technician who worked today (multi-device table
  // + legacy single-token column, deduped per technician).
  const tokensByTech = new Map(technicianIds.map((id) => [id, new Set()]));
  const { data: deviceRows, error: deviceErr } = await db
    .from('technician_push_tokens')
    .select('technician_id,token')
    .in('technician_id', technicianIds);
  if (deviceErr) {
    console.warn('[parts-reminder] technician_push_tokens lookup failed:', deviceErr.message);
  }
  for (const row of deviceRows || []) {
    if (row.token) tokensByTech.get(row.technician_id)?.add(row.token);
  }
  const { data: legacyRows } = await db
    .from('technician_live_locations')
    .select('technician_id,fcm_token')
    .in('technician_id', technicianIds)
    .not('fcm_token', 'is', null);
  for (const row of legacyRows || []) {
    if (row.fcm_token) tokensByTech.get(row.technician_id)?.add(row.fcm_token);
  }

  const messaging = await getMessaging(db);
  let sent = 0;
  for (const [technicianId, tokenSet] of tokensByTech) {
    const stale = [];
    for (const token of tokenSet) {
      try {
        await messaging.send({
          token,
          notification: {
            title: 'Add all used parts',
            body: "Make sure every part you used today is added to your completed jobs.",
          },
          data: { type: 'job_notification' },
          android: {
            priority: 'high',
            notification: {
              channelId: 'job_alerts_v2',
              defaultSound: true,
              color: '#F59E0B',
              tag: 'parts-reminder',
            },
          },
        });
        sent += 1;
      } catch (err) {
        if (isStaleTokenError(err)) stale.push(token);
        else console.error('[parts-reminder] send failed', err?.message || err);
      }
    }
    await pruneTechnicianFcmTokens(db, technicianId, stale);
  }

  console.log(`[parts-reminder] sent ${sent} reminder(s) across ${technicianIds.length} technician(s)`);
  return { statusCode: 200, body: JSON.stringify({ sent }) };
};
