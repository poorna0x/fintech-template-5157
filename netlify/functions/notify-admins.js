// Push an "on the way" / "job completed" notification to all admin phones
// (HRO Admin app). Called by the technician app. Auth: technician (or admin)
// session JWT; the job must be assigned to the calling technician.

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { verifyStaffBearerToken, readBearerToken } = require('./admin-auth-guard');
const { getMessaging, isStaleTokenError, sendToTechnicianDevices } = require('./fcm-helper');

const COLOR_EN_ROUTE = '#2563EB'; // blue — on the way
const COLOR_COMPLETED = '#16A34A'; // green — done
const COLOR_OTP = '#D97706'; // amber — customer OTP entered at start work
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

/** Digits-only WhatsApp target (91… for India). */
function formatPhoneForWhatsApp(phone) {
  const cleaned = String(phone || '').replace(/\D/g, '');
  if (cleaned.length === 12 && cleaned.startsWith('91')) return cleaned;
  if (cleaned.length === 10) return `91${cleaned}`;
  if (cleaned.length === 11 && cleaned.startsWith('0')) return `91${cleaned.slice(1)}`;
  if (cleaned.length >= 10) return `91${cleaned.slice(-10)}`;
  return cleaned;
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
  if (!jobId || !['en_route', 'completed', 'otp_entered'].includes(evt)) {
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
      'id,service_sub_type,assigned_technician_id,payment_amount,actual_cost,payment_method,lead_source,requirements,customer:customers(full_name)'
    )
    .eq('id', jobId)
    .maybeSingle();
  if (jobErr || !job) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Job not found' }) };
  }
  if (auth.role === 'technician' && job.assigned_technician_id !== auth.userId) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  const technicianId = job.assigned_technician_id || auth.userId;
  const { data: tech } = await db
    .from('technicians')
    .select('full_name,phone')
    .eq('id', technicianId)
    .maybeSingle();

  const { data: tokenRows, error: tokErr } = await db
    .from('admin_push_tokens')
    .select('token');
  if (tokErr) {
    // Table missing (SQL script not run yet) — not an app error.
    console.error('[notify-admins] token lookup failed', tokErr.message);
    return { statusCode: 200, headers, body: JSON.stringify({ sent: 0, reason: 'no_table' }) };
  }
  const tokens = (tokenRows || []).map((r) => r.token).filter(Boolean);
  if (tokens.length === 0) {
    return { statusCode: 200, headers, body: JSON.stringify({ sent: 0, reason: 'no_tokens' }) };
  }

  const techName = tech?.full_name || 'Technician';
  const customerName = job.customer?.full_name || 'customer';
  const service = job.service_sub_type || 'job';
  // Bill photo only (not UPI/payment screenshot) — egress-free: uses requirements already selected.
  const billMissing = evt === 'completed' && !jobHasBillPhotos(job);
  const techPhoneWhatsApp = billMissing ? formatPhoneForWhatsApp(tech?.phone) : '';
  const billMissingWaText = billMissing
    ? `Hi, please upload the bill photo for ${customerName} (${service}).`
    : '';

  let title;
  let message;
  let color;
  if (evt === 'en_route') {
    title = `${techName} is on the way`;
    message = `${service} — ${customerName}`;
    color = COLOR_EN_ROUTE;
  } else if (evt === 'otp_entered') {
    // Customer OTP collected at Start Work — office wants the code plus
    // customer name and lead source to verify against Home Triangle.
    title = `OTP ${otp} — ${customerName}`;
    const lines = [`Entered by ${techName} at start of work`];
    const leadSource = resolveLeadSource(job);
    if (leadSource) lines.push(`Lead: ${leadSource}`);
    message = lines.join('\n');
    color = COLOR_OTP;
  } else {
    title = billMissing
      ? `Bill photo missing — ${techName}`
      : `${techName} completed a job`;
    const lines = [`${service} — ${customerName}`];
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
    if (billMissing) {
      lines.push('Bill photo not uploaded — tap to WhatsApp technician');
    }
    const leadSource = resolveLeadSource(job);
    if (leadSource) lines.push(`Lead: ${leadSource}`);
    message = lines.join('\n');
    color = billMissing ? COLOR_BILL_MISSING : COLOR_COMPLETED;
  }

  try {
    const messaging = await getMessaging(db);

    // Remind the technician immediately (app push). Admin tap opens WhatsApp compose
    // — there is no WhatsApp Business API in this project to auto-send.
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
              channelId: 'job_alerts_v2',
              defaultSound: true,
              color: COLOR_BILL_MISSING,
              tag: `bill_missing_${jobId}`,
            },
          },
        }));
      } catch (techPushErr) {
        console.warn(
          '[notify-admins] bill-missing tech push failed',
          techPushErr?.message || techPushErr
        );
      }
    }

    // Deep link fields: admin APK + web open Completed/Ongoing and highlight the job.
    // completedDate avoids a round-trip on tap (open the list immediately).
    // billMissing + tech phone → tap also opens WhatsApp to that technician.
    const data = {
      type: 'job_event',
      event: evt,
      jobId: String(jobId),
      ...(evt === 'completed' ? { completedDate: formatIstDateYmd() } : {}),
      ...(billMissing
        ? {
            billMissing: '1',
            ...(techPhoneWhatsApp ? { techPhone: techPhoneWhatsApp } : {}),
            ...(billMissingWaText ? { waText: billMissingWaText.slice(0, 500) } : {}),
          }
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
      await db.from('admin_push_tokens').delete().in('token', stale);
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
