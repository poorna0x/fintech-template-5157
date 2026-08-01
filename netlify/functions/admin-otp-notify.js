// Shared: push "OTP entered" to all admin phones (HRO Admin app).
// Used by notify-admins (technician JWT) and submit-tech-otp (nonce reply).

const {
  getMessaging,
  getAdminFcmTokens,
  pruneAdminFcmTokens,
  isStaleTokenError,
} = require('./fcm-helper');

const COLOR_OTP = '#D97706';

function resolveLeadSource(job) {
  let reqs = [];
  try {
    const raw = job.requirements;
    if (typeof raw === 'string') reqs = JSON.parse(raw);
    else if (Array.isArray(raw)) reqs = raw;
    else if (raw && typeof raw === 'object') reqs = [raw];
  } catch {
    reqs = [];
  }
  let fromReqs = null;
  for (const r of reqs.flat()) {
    if (r && typeof r === 'object' && r.lead_source) {
      fromReqs = String(r.lead_source).trim();
      if (fromReqs.toLowerCase() === 'other') {
        const custom = reqs.flat().find((x) => x?.lead_source_custom)?.lead_source_custom;
        if (custom && String(custom).trim()) fromReqs = String(custom).trim();
      }
      break;
    }
  }
  const fromColumn = typeof job.lead_source === 'string' ? job.lead_source.trim() : '';
  if (fromReqs && (!fromColumn || fromColumn === 'Direct call')) return fromReqs;
  return fromColumn || fromReqs || 'Direct call';
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db service-role client
 * @param {{ jobId: string, otp: string }} opts
 * @returns {Promise<{ sent: number, reason?: string }>}
 */
async function notifyAdminsOtpEntered(db, opts) {
  const jobId = String(opts.jobId || '').trim();
  const otp = String(opts.otp || '').trim();
  if (!jobId || !/^\d{4}$/.test(otp)) {
    return { sent: 0, reason: 'invalid' };
  }

  const { data: job, error: jobErr } = await db
    .from('jobs')
    .select(
      'id,job_number,service_sub_type,assigned_technician_id,lead_source,requirements,customer:customers(full_name)'
    )
    .eq('id', jobId)
    .maybeSingle();
  if (jobErr || !job) {
    console.warn('[admin-otp-notify] job not found', jobId, jobErr?.message);
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
  const title = `OTP ${otp} — ${customerName}`;
  const lines = [`Entered by ${techName}`];
  const leadSource = resolveLeadSource(job);
  if (leadSource) lines.push(`Lead: ${leadSource}`);
  const message = lines.join('\n');
  // Same job → replace prior OTP alert instead of stacking two trays.
  const collapseTag = `otp_entered_${jobId}`;

  try {
    const messaging = await getMessaging(db);
    const res = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body: message },
      data: {
        type: 'job_event',
        event: 'otp_entered',
        jobId: String(jobId),
        tag: collapseTag,
      },
      android: {
        priority: 'high',
        collapseKey: collapseTag,
        notification: {
          channelId: 'job_alerts_v2',
          defaultSound: true,
          color: COLOR_OTP,
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
    console.error('[admin-otp-notify] send failed', err?.message || err);
    return { sent: 0, reason: 'send_failed' };
  }
}

module.exports = { notifyAdminsOtpEntered };
