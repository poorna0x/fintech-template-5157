// Receive an OTP typed directly into the Android notification's inline
// reply field (OtpReplyReceiver in the native app). The webview/JS may be
// dead, so there is no Supabase session — the one-time nonce that
// send-otp-request stored on the row and included in the push is the auth.

const { createClient } = require('@supabase/supabase-js');

// The native app sends no Origin header, so no CORS/origin checks here.
const NONCE_MAX_AGE_MS = 30 * 60 * 1000;

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const requestId = String(body.requestId || '').trim();
  const nonce = String(body.nonce || '').trim();
  const otp = String(body.otp || '').trim();

  if (!requestId || !nonce) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing fields' }) };
  }
  if (!/^\d{4}$/.test(otp)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'OTP must be 4 digits' }) };
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: row, error: rowErr } = await db
    .from('technician_otp_requests')
    .select('id,job_id,reply_nonce,created_at,otp')
    .eq('id', requestId)
    .maybeSingle();

  if (rowErr) {
    console.error('[submit-tech-otp] lookup failed', rowErr.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Lookup failed' }) };
  }

  const createdAt = row?.created_at ? new Date(row.created_at).getTime() : 0;
  const nonceValid =
    row != null &&
    row.reply_nonce != null &&
    row.reply_nonce === nonce &&
    Date.now() - createdAt < NONCE_MAX_AGE_MS;

  if (!nonceValid) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  // Re-submitting within the window overwrites (lets the technician correct
  // a typo); the admin dialog updates live either way.
  const { error: updErr } = await db
    .from('technician_otp_requests')
    .update({ otp, submitted_at: new Date().toISOString() })
    .eq('id', requestId);

  if (updErr) {
    console.error('[submit-tech-otp] update failed', updErr.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Update failed' }) };
  }

  // Also copy the code into jobs.requirements (same slot the completion flow
  // uses) so the admin Completed section keeps showing it. Best-effort — the
  // request row already has the code for the live dialog.
  if (row.job_id) {
    try {
      const { data: jobRow } = await db
        .from('jobs')
        .select('requirements')
        .eq('id', row.job_id)
        .maybeSingle();
      if (jobRow) {
        let reqs = [];
        try {
          const raw = jobRow.requirements;
          if (typeof raw === 'string') reqs = JSON.parse(raw);
          else if (Array.isArray(raw)) reqs = raw;
          else if (raw && typeof raw === 'object') reqs = [raw];
        } catch {
          reqs = [];
        }
        if (!Array.isArray(reqs)) reqs = [];
        const now = new Date().toISOString();
        const otpReq = reqs.find((r) => r && typeof r === 'object' && r.require_otp === true);
        if (otpReq) {
          otpReq.otp_entered = otp;
          otpReq.otp_verified = true;
          otpReq.otp_verified_at = now;
        } else {
          reqs.push({ require_otp: true, otp_entered: otp, otp_verified: true, otp_verified_at: now });
        }
        await db.from('jobs').update({ requirements: reqs }).eq('id', row.job_id);
      }
    } catch (err) {
      console.warn('[submit-tech-otp] could not store OTP on job', err?.message || err);
    }

    // First answer only — re-submit/typo corrections update the row + live dialog
    // without a second tray alert (collapse tag still covers races).
    const alreadyHadOtp = typeof row.otp === 'string' && /^\d{4}$/.test(row.otp.trim());
    if (!alreadyHadOtp) {
      try {
        const { notifyAdminsOtpEntered } = require('./admin-otp-notify');
        const push = await notifyAdminsOtpEntered(db, { jobId: row.job_id, otp });
        if (!push.sent) {
          console.warn('[submit-tech-otp] admin OTP push not sent:', push.reason || 'unknown');
        }
      } catch (err) {
        console.warn('[submit-tech-otp] admin OTP push failed', err?.message || err);
      }
    }
  }

  return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
};
