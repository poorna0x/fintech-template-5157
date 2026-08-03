// Scheduled every minute: fire Auto Ask OTP for jobs whose on-site dwell
// (7 min after GPS near) has elapsed — even if the technician app is closed.
//
// Phone still arms otp_onsite_detected_at when near; this cron owns the push
// so technicians get the notification in the background instead of only on open.

const { createClient } = require('@supabase/supabase-js');
const { assertScheduledInvoke } = require('./schedule-guard');
const {
  ACTIVE_STATUSES,
  DWELL_MS,
  parseRequirements,
  getOtpRequirement,
  hasOtpEntered,
  sendOtpAsk,
} = require('./otp-auto-ask-helper');

const BATCH_LIMIT = 25;

exports.handler = async (event) => {
  const cron = assertScheduledInvoke(event);
  if (!cron.ok) {
    return { statusCode: cron.statusCode, body: cron.body };
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    console.error('[flush-auto-ask-otp] missing Supabase env');
    return { statusCode: 500, body: 'Server misconfigured' };
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const dwellCutoff = new Date(Date.now() - DWELL_MS).toISOString();

  // Only jobs already armed by GPS (near), dwell elapsed, not yet auto-asked.
  const { data: dueJobs, error } = await db
    .from('jobs')
    .select(
      'id, status, assigned_technician_id, requirements, customer_id, otp_onsite_detected_at'
    )
    .is('otp_auto_asked_at', null)
    .not('otp_onsite_detected_at', 'is', null)
    .lte('otp_onsite_detected_at', dwellCutoff)
    .in('status', [...ACTIVE_STATUSES])
    .not('assigned_technician_id', 'is', null)
    .order('otp_onsite_detected_at', { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    console.error('[flush-auto-ask-otp] query failed', error.message);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  if (!dueJobs?.length) {
    return {
      statusCode: 200,
      body: JSON.stringify({ checked: 0, asked: 0, skipped: 0 }),
    };
  }

  let asked = 0;
  let sent = 0;
  let skipped = 0;
  const results = [];

  for (const job of dueJobs) {
    const requirements = parseRequirements(job.requirements);
    const otpReq = getOtpRequirement(requirements);
    const alreadyEntered = hasOtpEntered(otpReq);

    // Stamp auto-asked so this job leaves the due set (avoid minute spam).
    if (!otpReq || alreadyEntered) {
      const reason = !otpReq ? 'otp_not_required' : 'otp_already_entered';
      await db
        .from('jobs')
        .update({ otp_auto_asked_at: new Date().toISOString() })
        .eq('id', job.id)
        .is('otp_auto_asked_at', null);
      skipped += 1;
      results.push({ jobId: job.id, skipped: true, reason });
      continue;
    }

    const technicianId = job.assigned_technician_id;
    if (!technicianId) {
      skipped += 1;
      results.push({ jobId: job.id, reason: 'no_technician' });
      continue;
    }

    try {
      const result = await sendOtpAsk(db, {
        jobId: job.id,
        technicianId,
        customerId: job.customer_id,
      });
      if (result.asked) {
        asked += 1;
        if (result.sent) sent += 1;
      } else {
        skipped += 1;
      }
      results.push({ jobId: job.id, ...result });
    } catch (err) {
      console.error('[flush-auto-ask-otp] job failed', job.id, err?.message || err);
      results.push({
        jobId: job.id,
        error: err instanceof Error ? err.message : 'failed',
      });
    }
  }

  console.log('[flush-auto-ask-otp]', {
    due: dueJobs.length,
    asked,
    sent,
    skipped,
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
      checked: dueJobs.length,
      asked,
      sent,
      skipped,
      results,
    }),
  };
};
