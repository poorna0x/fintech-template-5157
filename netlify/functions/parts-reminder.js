// Scheduled: every day at 10:10 PM IST (16:40 UTC — see netlify.toml).
// Reminds technicians who completed jobs today to log every part they used,
// so inventory and job costs stay accurate.

const { createClient } = require('@supabase/supabase-js');
const { getMessaging, clearTechnicianFcmToken, isStaleTokenError } = require('./fcm-helper');

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

  const { data: tokenRows } = await db
    .from('technician_live_locations')
    .select('technician_id,fcm_token')
    .in('technician_id', technicianIds)
    .not('fcm_token', 'is', null);

  const messaging = await getMessaging(db);
  let sent = 0;
  for (const row of tokenRows || []) {
    try {
      await messaging.send({
        token: row.fcm_token,
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
      if (isStaleTokenError(err)) await clearTechnicianFcmToken(db, row.technician_id);
      else console.error('[parts-reminder] send failed', err?.message || err);
    }
  }

  console.log(`[parts-reminder] reminded ${sent}/${technicianIds.length} technician(s)`);
  return { statusCode: 200, body: JSON.stringify({ sent }) };
};
