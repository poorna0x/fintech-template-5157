// Scheduled: every day at 10:10 PM IST (16:40 UTC — see netlify.toml).
// Reminds technicians who completed jobs today to log every part they used,
// so inventory and job costs stay accurate. Admins get a companion push so
// they know to double-check the day's parts entries.

const { createClient } = require('@supabase/supabase-js');
const { getMessaging, getAdminFcmTokens, pruneAdminFcmTokens, sendToTechnicianDevices } = require('./fcm-helper');
const { assertScheduledInvoke } = require('./schedule-guard');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

exports.handler = async (event) => {
  const cron = assertScheduledInvoke(event);
  if (!cron.ok) {
    return { statusCode: cron.statusCode, body: cron.body };
  }

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

  // Every device of every technician who worked today — honor per-device prefs.
  const messaging = await getMessaging(db);
  let sent = 0;
  for (const technicianId of technicianIds) {
    const { data: techRow } = await db
      .from('technicians')
      .select('push_notifications_enabled')
      .eq('id', technicianId)
      .maybeSingle();
    if (techRow?.push_notifications_enabled === false) continue;

    const result = await sendToTechnicianDevices(
      db,
      messaging,
      technicianId,
      (token) => ({
        token,
        notification: {
          title: 'Add all used parts',
          body: "Make sure every part you used today is added to your completed jobs.",
        },
        data: { type: 'job_notification' },
        android: {
          priority: 'high',
          notification: {
            channelId: 'tech_general_v1',
            defaultSound: true,
            color: '#F59E0B',
            tag: 'parts-reminder',
          },
        },
      }),
      'parts_reminder'
    );
    sent += result.sent;
    try {
      const { maybeSendTechnicianPushWhatsApp } = require('./tech-push-whatsapp-helper');
      await maybeSendTechnicianPushWhatsApp(db, {
        technicianId,
        category: 'parts_reminder',
        title: 'Add all used parts',
        body: 'Make sure every part you used today is added to your completed jobs.',
      });
    } catch {
      /* never block parts reminder */
    }
  }

  // Companion push to every admin phone: how many jobs finished today, so
  // they know to verify the parts were actually logged.
  let adminSent = 0;
  const adminTokens = await getAdminFcmTokens(db, 'parts_reminder');
  if (adminTokens.length > 0) {
    const jobCount = (doneToday || []).length;
    const res = await messaging.sendEachForMulticast({
      tokens: adminTokens,
      notification: {
        title: 'Check parts entries',
        body: `${jobCount} job${jobCount === 1 ? '' : 's'} completed today by ${technicianIds.length} technician${technicianIds.length === 1 ? '' : 's'} — verify all used parts are logged.`,
      },
      data: { type: 'job_notification' },
      android: {
        priority: 'high',
        notification: {
          channelId: 'job_alerts_v2',
          defaultSound: true,
          color: '#F59E0B',
          tag: 'parts-reminder-admin',
        },
      },
    });
    adminSent = res.successCount;
    const staleAdmin = [];
    res.responses.forEach((r, i) => {
      if (!r.success && isStaleTokenError(r.error)) staleAdmin.push(adminTokens[i]);
    });
    if (staleAdmin.length > 0) {
      await pruneAdminFcmTokens(db, staleAdmin);
    }
  }

  console.log(
    `[parts-reminder] sent ${sent} technician reminder(s) across ${technicianIds.length} technician(s), ${adminSent} admin push(es)`
  );
  return { statusCode: 200, body: JSON.stringify({ sent, adminSent }) };
};
