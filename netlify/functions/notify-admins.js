// Push an "on the way" / "job completed" notification to all admin phones
// (HRO Admin app). Called by the technician app. Auth: technician (or admin)
// session JWT; the job must be assigned to the calling technician.

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { verifyStaffBearerToken, readBearerToken } = require('./admin-auth-guard');
const { getMessaging, isStaleTokenError, sendToTechnicianDevices, getAdminFcmTokens, pruneAdminFcmTokens } = require('./fcm-helper');
const { notifyAdminsOtpEntered } = require('./admin-otp-notify');

const COLOR_EN_ROUTE = '#2563EB'; // blue — on the way
const COLOR_COMPLETED = '#16A34A'; // green — done
const COLOR_BILL_MISSING = '#D97706'; // amber — completed but no bill photo
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** True when jobs.requirements has at least one bill photo URL (UPI/payment ignored). */
function jobHasBillPhotos(job) {
  let reqs = [];
  try {
    const raw = job.requirements;
    if (typeof raw === 'string') reqs = JSON.parse(raw);
    else if (Array.isArray(raw)) reqs = raw;
    else if (raw && typeof raw === 'object') reqs = [raw];
  } catch {
    reqs = [];
  }
  for (const r of reqs.flat()) {
    if (!r || typeof r !== 'object' || !Array.isArray(r.bill_photos)) continue;
    for (const p of r.bill_photos) {
      const url =
        typeof p === 'string'
          ? p
          : p && typeof p === 'object'
            ? String(p.url || p.secure_url || p.src || '')
            : '';
      if (url.trim().startsWith('http')) return true;
    }
  }
  return false;
}

/** yyyy-mm-dd in IST — so admin completed filter matches India calendar day. */
function formatIstDateYmd(date = new Date()) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ist.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Same rules as getLeadSourceFromJob in the web app, minus analytics extras.
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

function formatRupees(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `₹${n.toLocaleString('en-IN')}`;
}

/** Parse jobs.requirements into a flat array of objects. */
function parseRequirements(job) {
  let reqs = [];
  try {
    const raw = job.requirements;
    if (typeof raw === 'string') reqs = JSON.parse(raw);
    else if (Array.isArray(raw)) reqs = raw;
    else if (raw && typeof raw === 'object') reqs = [raw];
  } catch {
    reqs = [];
  }
  return reqs.flat().filter((r) => r && typeof r === 'object');
}

/**
 * Billing lines for the admin "job completed" push.
 * Pending payment jobs: show paid today (cash/online/partial) + still pending —
 * not the full bill as if it were collected.
 */
function buildCompletedBillingLines(job) {
  const reqs = parseRequirements(job);
  const pendingRow = reqs.find((r) => r.pending_payment && typeof r.pending_payment === 'object');
  const pending = pendingRow?.pending_payment;
  const pendingOpen =
    pending &&
    !pending.settled_at &&
    Number(pending.amount_pending) > 0;

  const bill =
    (Number(job.payment_amount) || 0) > 0
      ? Number(job.payment_amount) || 0
      : Number(job.actual_cost) || 0;
  const billLabel = formatRupees(bill);

  if (pendingOpen) {
    const lines = [];
    if (billLabel) lines.push(`Bill: ${billLabel}`);

    const paidToday = Number(pending.paid_today) || 0;
    const mode = String(pending.paid_today_mode || '').toUpperCase();
    const balance = Number(pending.amount_pending) || 0;
    const balanceLabel = formatRupees(balance);

    if (paidToday > 0) {
      if (mode === 'PARTIAL') {
        const partialReq = reqs.find(
          (r) => r.partial_cash_amount != null || r.partial_online_amount != null
        );
        const cash = Number(partialReq?.partial_cash_amount) || 0;
        const online = Number(partialReq?.partial_online_amount) || 0;
        const parts = [];
        if (cash > 0) parts.push(`${formatRupees(cash)} cash`);
        if (online > 0) parts.push(`${formatRupees(online)} online`);
        lines.push(
          parts.length
            ? `Paid today: ${parts.join(' + ')}`
            : `Paid today: ${formatRupees(paidToday)} (partial)`
        );
      } else if (mode === 'CASH') {
        lines.push(`Paid today: ${formatRupees(paidToday)} cash`);
      } else if (mode === 'ONLINE') {
        lines.push(`Paid today: ${formatRupees(paidToday)} online`);
      } else {
        lines.push(`Paid today: ${formatRupees(paidToday)}`);
      }
    } else {
      lines.push('Paid today: nothing');
    }

    if (balanceLabel) {
      const due = String(pending.promised_date || '').trim().slice(0, 10);
      lines.push(
        due
          ? `Still pending: ${balanceLabel} (due ${due})`
          : `Still pending: ${balanceLabel}`
      );
    }
    return { lines, isPending: true };
  }

  const lines = [];
  const amount = formatRupees(job.payment_amount ?? job.actual_cost);
  const rawMethod = String(job.payment_method || '').trim();
  const method =
    rawMethod.toUpperCase() === 'UPI'
      ? 'UPI'
      : rawMethod
        ? rawMethod.charAt(0).toUpperCase() + rawMethod.slice(1).toLowerCase()
        : '';
  if (amount) {
    lines.push(`Billing: ${amount}${method ? ` (${method})` : ''}`);
  }
  return { lines, isPending: false };
}

exports.handler = async (event) => {
  const corsHeaders = getCorsHeaders(event.headers.origin || event.headers.Origin);
  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (shouldRejectMissingOrigin(event)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const auth = await verifyStaffBearerToken(readBearerToken(event));
  if (!auth.ok) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: auth.error }) };
  }

  const jobId = String(body.jobId || '').trim();
  const evt = String(body.event || '').trim();
  const otp = String(body.otp || '').trim();
  if (!jobId || !['en_route', 'completed', 'otp_entered', 'job_created', 'bill_photo_added', 'payment_screenshot_added'].includes(evt)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'jobId and event required' }) };
  }
  if (evt === 'otp_entered' && !/^\d{4}$/.test(otp)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'otp must be 4 digits' }) };
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // The job must exist and (for technician callers) be theirs.
  const { data: job, error: jobErr } = await db
    .from('jobs')
    .select(
      'id,job_number,service_sub_type,assigned_technician_id,assigned_by,completed_by,payment_amount,actual_cost,payment_method,lead_source,requirements,customer:customers(full_name)'
    )
    .eq('id', jobId)
    .maybeSingle();
  if (jobErr || !job) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Job not found' }) };
  }
  if (auth.role === 'technician') {
    // job_created: tech-created jobs are usually PENDING (unassigned) —
    // authorize via assigned_by (set to auth.uid() in technician_create_job).
    // Late bill/payment photo: allow assigned tech or the tech who completed it.
    const allowed =
      evt === 'job_created'
        ? job.assigned_by === auth.userId
        : evt === 'bill_photo_added' || evt === 'payment_screenshot_added'
          ? job.assigned_technician_id === auth.userId ||
            job.completed_by === auth.userId ||
            job.assigned_by === auth.userId
          : job.assigned_technician_id === auth.userId || job.completed_by === auth.userId;
    if (!allowed) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
    }
  }

  // OTP entered (Ask OTP card / Start Work) — shared helper (same push as notification reply).
  if (evt === 'otp_entered') {
    const push = await notifyAdminsOtpEntered(db, { jobId, otp });
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ sent: push.sent, ...(push.reason ? { reason: push.reason } : {}) }),
    };
  }

  const technicianId =
    evt === 'job_created'
      ? job.assigned_by || auth.userId
      : job.assigned_technician_id || job.completed_by || auth.userId;
  const { data: tech } = await db
    .from('technicians')
    .select('full_name')
    .eq('id', technicianId)
    .maybeSingle();

  const tokens = await getAdminFcmTokens(db, 'job_status');
  if (tokens.length === 0) {
    return { statusCode: 200, headers, body: JSON.stringify({ sent: 0, reason: 'no_tokens' }) };
  }

  const techName = tech?.full_name || 'Technician';
  const customerName = job.customer?.full_name || 'customer';
  const service = job.service_sub_type || 'job';
  // Bill photo only (not UPI/payment screenshot) — egress-free: uses requirements already selected.
  const billMissing = evt === 'completed' && !jobHasBillPhotos(job);

  const COLOR_JOB_CREATED = '#0369A1'; // sky — tech created a job for admin to assign
  const COLOR_PHOTO_ADDED = '#0D9488'; // teal — late bill / payment photo upload
  let title;
  let message;
  let color;
  if (evt === 'job_created') {
    title = `${techName} created a job`;
    const lines = [`${service} — ${customerName}`];
    if (job.job_number) lines.push(`Job #${job.job_number}`);
    const leadSource = resolveLeadSource(job);
    if (leadSource) lines.push(`Lead: ${leadSource}`);
    message = lines.join('\n');
    color = COLOR_JOB_CREATED;
  } else if (evt === 'en_route') {
    title = `${techName} is on the way`;
    message = `${service} — ${customerName}`;
    color = COLOR_EN_ROUTE;
  } else if (evt === 'bill_photo_added') {
    title = `${techName} added bill photo`;
    const lines = [`${service} — ${customerName}`];
    if (job.job_number) lines.push(`Job #${job.job_number}`);
    message = lines.join('\n');
    color = COLOR_PHOTO_ADDED;
  } else if (evt === 'payment_screenshot_added') {
    title = `${techName} added payment screenshot`;
    const lines = [`${service} — ${customerName}`];
    if (job.job_number) lines.push(`Job #${job.job_number}`);
    message = lines.join('\n');
    color = COLOR_PHOTO_ADDED;
  } else {
    const billing = buildCompletedBillingLines(job);
    title = billMissing
      ? `Bill photo missing — ${techName}`
      : billing.isPending
        ? `${techName} completed — payment pending`
        : `${techName} completed a job`;
    const lines = [`${service} — ${customerName}`, ...billing.lines];
    if (billMissing) {
      lines.push('Bill photo not uploaded');
    }
    const leadSource = resolveLeadSource(job);
    if (leadSource) lines.push(`Lead: ${leadSource}`);
    message = lines.join('\n');
    color = billMissing
      ? COLOR_BILL_MISSING
      : billing.isPending
        ? COLOR_EN_ROUTE // blue — pending stands out vs green "fully paid"
        : COLOR_COMPLETED;
  }

  try {
    const messaging = await getMessaging(db);

    // Remind the technician immediately via app push + optional WhatsApp.
    if (billMissing && technicianId) {
      try {
        await sendToTechnicianDevices(db, messaging, technicianId, (token) => ({
          token,
          notification: {
            title: 'Bill photo missing',
            body: `${customerName} — ${service}. Please upload the bill photo.`,
          },
          data: {
            type: 'job_notification',
            event: 'bill_photo_missing',
            jobId: String(jobId),
          },
          android: {
            priority: 'high',
            notification: {
              channelId: 'tech_general_v1',
              defaultSound: true,
              color: COLOR_BILL_MISSING,
              tag: `bill_missing_${jobId}`,
            },
          },
        }), 'bill_reminders');
        const { maybeSendTechnicianPushWhatsApp } = require('./tech-push-whatsapp-helper');
        void maybeSendTechnicianPushWhatsApp(db, {
          technicianId,
          category: 'bill_reminders',
          title: 'Bill photo missing',
          body: `${customerName} — ${service}. Please upload the bill photo.`,
        });
      } catch (techPushErr) {
        console.warn(
          '[notify-admins] bill-missing tech push failed',
          techPushErr?.message || techPushErr
        );
      }
    }

    // Deep link fields: admin APK + web open Completed/Ongoing and highlight the job.
    // completedDate avoids a round-trip on tap (open the list immediately).
    const data = {
      type: 'job_event',
      event: evt,
      jobId: String(jobId),
      ...(evt === 'completed' ||
      evt === 'bill_photo_added' ||
      evt === 'payment_screenshot_added'
        ? { completedDate: formatIstDateYmd() }
        : {}),
    };
    const res = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body: message },
      data,
      android: {
        priority: 'high',
        notification: {
          channelId: evt === 'completed' && !billMissing ? 'job_complete_v1' : 'job_alerts_v2',
          defaultSound: true,
          color,
        },
      },
    });

    // Prune tokens for uninstalled devices so we stop paying for them.
    const stale = [];
    res.responses.forEach((r, i) => {
      if (!r.success && isStaleTokenError(r.error)) stale.push(tokens[i]);
    });
    if (stale.length > 0) {
      await pruneAdminFcmTokens(db, stale);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ sent: res.successCount, billMissing }),
    };
  } catch (err) {
    console.error('[notify-admins] send failed', err?.message || err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Push send failed' }) };
  }
};
