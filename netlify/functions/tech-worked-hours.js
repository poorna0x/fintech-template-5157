// Scheduled: every day at 9:00 PM IST (15:30 UTC — see netlify.toml).
// Pushes each technician their worked hours: first job start → last job completed today.

const { createClient } = require('@supabase/supabase-js');
const { getMessaging, sendToTechnicianDevices } = require('./fcm-helper');
const { assertScheduledInvoke } = require('./schedule-guard');
const {
  istDayBounds,
  computeTechWorkedHours,
  formatWorkedHoursPushBody,
} = require('./tech-worked-hours-helper');

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

  const nowMs = Date.now();
  const { dayStartUtc, dayEndUtc } = istDayBounds(nowMs);
  const dayStartIso = new Date(dayStartUtc).toISOString();
  const dayEndIso = new Date(dayEndUtc).toISOString();
  const cols = 'id,assigned_technician_id,start_time,completed_at,end_time';

  const [{ data: started, error: startErr }, { data: completed, error: doneErr }] =
    await Promise.all([
      db
        .from('jobs')
        .select(cols)
        .gte('start_time', dayStartIso)
        .lt('start_time', dayEndIso)
        .not('assigned_technician_id', 'is', null),
      db
        .from('jobs')
        .select(cols)
        .or(
          `and(completed_at.gte.${dayStartIso},completed_at.lt.${dayEndIso}),and(end_time.gte.${dayStartIso},end_time.lt.${dayEndIso})`
        )
        .not('assigned_technician_id', 'is', null),
    ]);

  if (startErr || doneErr) {
    console.error('[tech-worked-hours] jobs query failed', startErr?.message || doneErr?.message);
    return { statusCode: 500, body: 'Query failed' };
  }

  const byId = new Map();
  for (const row of [...(started || []), ...(completed || [])]) {
    if (row?.id) byId.set(row.id, row);
  }

  const byTech = new Map();
  for (const job of byId.values()) {
    const techId = job.assigned_technician_id;
    if (!techId) continue;
    if (!byTech.has(techId)) byTech.set(techId, []);
    byTech.get(techId).push(job);
  }

  if (byTech.size === 0) {
    return { statusCode: 200, body: JSON.stringify({ sent: 0, reason: 'no_jobs' }) };
  }

  const messaging = await getMessaging(db);
  let sent = 0;
  let skipped = 0;

  for (const [technicianId, jobs] of byTech.entries()) {
    const summary = computeTechWorkedHours(jobs, nowMs);
    const body = formatWorkedHoursPushBody(summary);
    if (!body) {
      skipped += 1;
      continue;
    }

    const { data: techRow } = await db
      .from('technicians')
      .select('push_notifications_enabled')
      .eq('id', technicianId)
      .maybeSingle();
    if (techRow?.push_notifications_enabled === false) {
      skipped += 1;
      continue;
    }

    const title = 'Worked hours today';
    const overlayResult = await sendToTechnicianDevices(
      db,
      messaging,
      technicianId,
      (token) => ({
        token,
        data: {
          type: 'tech_nudge',
          msgTitle: title,
          msgBody: body,
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
        technicianId,
        category: 'worked_hours',
        title,
        body,
      });
    } catch {
      /* never block the hours push */
    }
  }

  console.log(`[tech-worked-hours] sent ${sent} push(es) across ${byTech.size} technician(s), skipped ${skipped}`);
  return { statusCode: 200, body: JSON.stringify({ sent, skipped, techs: byTech.size }) };
};
