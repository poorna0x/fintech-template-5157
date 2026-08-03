// Shared: push "technician arrived at customer" to admin phones (HRO Admin app).

const {
  getMessaging,
  getAdminFcmTokens,
  pruneAdminFcmTokens,
  isStaleTokenError,
} = require('./fcm-helper');

const COLOR_ARRIVED = '#2563EB';

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db service-role client
 * @param {{ jobId: string }} opts
 * @returns {Promise<{ sent: number, reason?: string }>}
 */
async function notifyAdminsTechArrived(db, opts) {
  const jobId = String(opts.jobId || '').trim();
  if (!jobId) {
    return { sent: 0, reason: 'invalid' };
  }

  const { data: job, error: jobErr } = await db
    .from('jobs')
    .select(
      'id,job_number,service_sub_type,assigned_technician_id,customer:customers(full_name)'
    )
    .eq('id', jobId)
    .maybeSingle();
  if (jobErr || !job) {
    console.warn('[admin-tech-arrived] job not found', jobId, jobErr?.message);
    return { sent: 0, reason: 'job_not_found' };
  }

  const technicianId = job.assigned_technician_id;
  let techName = 'Technician';
  if (technicianId) {
    const { data: tech } = await db
      .from('technicians')
      .select('full_name')
      .eq('id', technicianId)
      .maybeSingle();
    if (tech?.full_name) techName = tech.full_name;
  }

  const tokens = [...new Set(await getAdminFcmTokens(db, 'job_status'))];
  if (tokens.length === 0) {
    return { sent: 0, reason: 'no_tokens' };
  }

  const customerName = job.customer?.full_name || 'customer';
  const service = String(job.service_sub_type || '').trim();
  const title = `At customer — ${customerName}`;
  const message = service
    ? `${techName} is at the location (${service})`
    : `${techName} is at the location`;
  const collapseTag = `tech_arrived_${jobId}`;

  try {
    const messaging = await getMessaging(db);
    const res = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body: message },
      data: {
        type: 'job_event',
        event: 'tech_arrived',
        jobId: String(jobId),
        tag: collapseTag,
      },
      android: {
        priority: 'high',
        collapseKey: collapseTag,
        notification: {
          channelId: 'job_alerts_v2',
          defaultSound: true,
          color: COLOR_ARRIVED,
          tag: collapseTag,
        },
      },
    });

    const stale = [];
    res.responses.forEach((r, i) => {
      if (!r.success && isStaleTokenError(r.error)) stale.push(tokens[i]);
    });
    if (stale.length > 0) {
      await pruneAdminFcmTokens(db, stale);
    }

    return { sent: res.successCount || 0 };
  } catch (err) {
    console.error('[admin-tech-arrived] send failed', err?.message || err);
    return { sent: 0, reason: 'send_failed' };
  }
}

module.exports = { notifyAdminsTechArrived };
