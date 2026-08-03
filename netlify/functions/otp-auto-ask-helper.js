// Shared Auto Ask OTP: create request row + FCM push (once per job).
// Used by technician GPS endpoint and the background flush cron.

const crypto = require('crypto');
const { getMessaging, sendToTechnicianDevices } = require('./fcm-helper');

/** Start Job → EN_ROUTE; Start Work → IN_PROGRESS. Ignore PENDING/ASSIGNED. */
const ACTIVE_STATUSES = new Set(['EN_ROUTE', 'IN_PROGRESS']);
const DWELL_MS = 2 * 60 * 1000; // testing — was 7 min

function parseRequirements(raw) {
  try {
    if (typeof raw === 'string') {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return [parsed];
      return [];
    }
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') return [raw];
  } catch {
    /* ignore */
  }
  return [];
}

function getOtpRequirement(requirements) {
  return requirements.find((r) => r && typeof r === 'object' && r.require_otp === true) || null;
}

function hasOtpEntered(otpReq) {
  const otp = otpReq?.otp_entered;
  return typeof otp === 'string' && otp.trim().length > 0;
}

/**
 * Claim auto-ask once, create technician_otp_requests if missing, push FCM.
 * Never wipes an existing Ask OTP row (pending or answered).
 */
async function sendOtpAsk(db, { jobId, technicianId, customerId }) {
  const askedAt = new Date().toISOString();
  const { data: claimed, error: claimErr } = await db
    .from('jobs')
    .update({ otp_auto_asked_at: askedAt, updated_at: askedAt })
    .eq('id', jobId)
    .eq('assigned_technician_id', technicianId)
    .is('otp_auto_asked_at', null)
    .select('id');

  if (claimErr) {
    throw new Error(`claim failed: ${claimErr.message}`);
  }
  if (!claimed?.length) {
    return { skipped: true, reason: 'already_asked' };
  }

  const { data: existingReq } = await db
    .from('technician_otp_requests')
    .select('id, otp')
    .eq('job_id', jobId)
    .maybeSingle();

  if (existingReq?.id) {
    const answered =
      typeof existingReq.otp === 'string' && /^\d{4}$/.test(String(existingReq.otp).trim());
    return {
      skipped: true,
      reason: answered ? 'otp_already_on_request' : 'ask_already_pending',
      requestId: existingReq.id,
    };
  }

  let customerName = '';
  if (customerId) {
    const { data: customer } = await db
      .from('customers')
      .select('full_name')
      .eq('id', customerId)
      .maybeSingle();
    customerName = String(customer?.full_name || '').trim().slice(0, 80);
  }

  const { data: requestRow, error: insertErr } = await db
    .from('technician_otp_requests')
    .insert({
      job_id: jobId,
      technician_id: technicianId,
      otp: null,
      created_at: askedAt,
      submitted_at: null,
      reply_nonce: null,
    })
    .select('id')
    .single();

  if (insertErr || !requestRow?.id) {
    const { data: raced } = await db
      .from('technician_otp_requests')
      .select('id, otp')
      .eq('job_id', jobId)
      .maybeSingle();
    if (raced?.id) {
      const answered =
        typeof raced.otp === 'string' && /^\d{4}$/.test(String(raced.otp).trim());
      return {
        skipped: true,
        reason: answered ? 'otp_already_on_request' : 'ask_already_pending',
        requestId: raced.id,
      };
    }
    throw new Error(`insert request failed: ${insertErr?.message || 'no id'}`);
  }

  const requestId = requestRow.id;
  const nonce = crypto.randomUUID();
  const { error: nonceErr } = await db
    .from('technician_otp_requests')
    .update({ reply_nonce: nonce })
    .eq('id', requestId)
    .eq('technician_id', technicianId);

  if (nonceErr) {
    return { asked: true, sent: false, reason: 'nonce_failed', requestId };
  }

  const siteUrl = (process.env.URL || '').replace(/\/$/, '');
  const submitUrl = `${siteUrl}/.netlify/functions/submit-tech-otp`;
  try {
    const messaging = await getMessaging(db);
    const { sent, tokens } = await sendToTechnicianDevices(
      db,
      messaging,
      technicianId,
      (deviceToken) => ({
        token: deviceToken,
        data: {
          type: 'otp_request',
          requestId,
          nonce,
          ...(customerName ? { customerName } : {}),
          submitUrl,
          showOverlay: '1',
        },
        android: { priority: 'high' },
      }),
      'otp_request'
    );

    if (tokens === 0) {
      return { asked: true, sent: false, reason: 'no_token', requestId, nonce, submitUrl, customerName };
    }
    if (sent === 0) {
      return { asked: true, sent: false, reason: 'stale_token', requestId, nonce, submitUrl, customerName };
    }
    return { asked: true, sent: true, devices: sent, requestId, nonce, submitUrl, customerName };
  } catch (err) {
    console.error('[otp-auto-ask] push failed', err?.message || err);
    return { asked: true, sent: false, reason: 'push_failed', requestId, nonce, submitUrl, customerName };
  }
}

module.exports = {
  ACTIVE_STATUSES,
  DWELL_MS,
  parseRequirements,
  getOtpRequirement,
  hasOtpEntered,
  sendOtpAsk,
};
