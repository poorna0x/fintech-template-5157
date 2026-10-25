// Scheduled: every day at 9:00 PM IST (15:30 UTC — see netlify.toml).
// Each technician overlay: first job start → last job completed, km,
// last-job → office folded into the end clock. Admins load the same
// digest on demand from Settings (no admin FCM).

const { createClient } = require('@supabase/supabase-js');
const { getMessaging, sendToTechnicianDevices } = require('./fcm-helper');
const { assertScheduledInvoke } = require('./schedule-guard');
const { collectTechFieldDay } = require('./tech-field-day-helper');

exports.handler = async (event) => {
  const cron = assertScheduledInvoke(event);
  if (!cron.ok) {
    return { statusCode: cron.statusCode, body: cron.body };
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    console.error('[tech-worked-hours] missing Supabase env');
    return { statusCode: 500, body: 'Server misconfigured' };
  }
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let day;
  try {
    day = await collectTechFieldDay(db, Date.now());
  } catch (err) {
    console.error('[tech-worked-hours] collect failed', err?.message || err);
    return { statusCode: 500, body: 'Query failed' };
  }

  if (!day.rows.length) {
    return { statusCode: 200, body: JSON.stringify({ sent: 0, reason: 'no_jobs' }) };
  }

  const messaging = await getMessaging(db);
  let sent = 0;
  let skipped = 0;

  for (const row of day.rows) {
    if (!row.overlayBody) {
      skipped += 1;
      continue;
    }
    if (row.pushEnabled === false) {
      skipped += 1;
      continue;
    }

    const title = 'Worked hours today';
    const overlayResult = await sendToTechnicianDevices(
      db,
      messaging,
      row.technicianId,
      (token) => ({
        token,
        data: {
          type: 'tech_nudge',
          msgTitle: title,
          msgBody: row.overlayBody,
          tag: 'tech-worked-hours',
          color: '#2563EB',
          showOverlay: '1',
        },
        android: { priority: 'high' },
      }),
      'worked_hours'
    );
    sent += overlayResult.sent;

    try {
      const { maybeSendTechnicianPushWhatsApp } = require('./tech-push-whatsapp-helper');
      await maybeSendTechnicianPushWhatsApp(db, {
        technicianId: row.technicianId,
        category: 'worked_hours',
        title,
        body: row.overlayBody,
      });
    } catch {
      /* never block the hours push */
    }
  }

  console.log(`[tech-worked-hours] tech push ${sent}, skipped ${skipped}, techs ${day.rows.length}`);
  return {
    statusCode: 200,
    body: JSON.stringify({
      sent,
      skipped,
      techs: day.rows.length,
    }),
  };
};
