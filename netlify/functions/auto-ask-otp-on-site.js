// Auto Ask OTP using a SERVER-side on-site clock (survives phone lock / WebView kill).
//
// Body: { jobId, near?: boolean }
//  - near:true  → first time: set jobs.otp_onsite_detected_at = now (arm dwell; 7 min)
//  - any call   → if onsite + dwell elapsed + OTP still missing → Ask OTP once
//
// Auth: technician JWT assigned to the job.
// Background: flush-auto-ask-otp cron also fires due asks without the app open.

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { addSecurityHeaders } = require('./security-headers');
const {
  verifyStaffBearerToken,
  readAccessTokenFromEvent,
} = require('./admin-auth-guard');
const { checkRateLimit } = require('./rate-limiter');
const {
  ACTIVE_STATUSES,
  DWELL_MS,
  parseRequirements,
  getOtpRequirement,
  hasOtpEntered,
  sendOtpAsk,
} = require('./otp-auto-ask-helper');

function jsonResponse(statusCode, corsHeaders, body) {
  return {
    statusCode,
    headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  const requestOrigin = event.headers.origin || event.headers.Origin;
  const corsHeaders = getCorsHeaders(requestOrigin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: addSecurityHeaders(corsHeaders), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, corsHeaders, { error: 'Method not allowed' });
  }

  if (shouldRejectMissingOrigin(event)) {
    return jsonResponse(403, corsHeaders, { error: 'Forbidden' });
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, corsHeaders, { error: 'Invalid JSON' });
  }

  const token = readAccessTokenFromEvent(event, body);
  const session = await verifyStaffBearerToken(token);
  if (!session.ok || session.role !== 'technician') {
    return jsonResponse(session.error === 'Forbidden' ? 403 : 401, corsHeaders, {
      error: session.error || 'Unauthorized',
    });
  }

  const rate = checkRateLimit(event, {
    maxRequests: 60,
    windowMs: 60_000,
    endpoint: 'auto-ask-otp-on-site',
  });
  if (!rate.allowed) {
    return jsonResponse(429, corsHeaders, { error: 'Too many requests' });
  }

  const jobId = String(body.jobId || '').trim();
  if (!jobId) {
    return jsonResponse(400, corsHeaders, { error: 'jobId required' });
  }
  const near = body.near === true || body.near === 'true' || body.near === 1;

  const technicianId = session.userId;
  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse(500, corsHeaders, { error: 'Server misconfigured' });
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: job, error: jobErr } = await db
    .from('jobs')
    .select(
      'id, status, assigned_technician_id, requirements, otp_auto_asked_at, otp_onsite_detected_at, customer_id'
    )
    .eq('id', jobId)
    .maybeSingle();

  if (jobErr) {
    console.error('[auto-ask-otp-on-site] job lookup', jobErr.message);
    return jsonResponse(500, corsHeaders, {
      error: 'Lookup failed',
      details: jobErr.message,
    });
  }
  if (!job) {
    return jsonResponse(404, corsHeaders, { skipped: true, reason: 'not_found' });
  }
  if (String(job.assigned_technician_id || '') !== String(technicianId)) {
    return jsonResponse(403, corsHeaders, { error: 'Forbidden' });
  }
  if (job.otp_auto_asked_at) {
    return jsonResponse(200, corsHeaders, { skipped: true, reason: 'already_asked' });
  }

  const status = String(job.status || '').toUpperCase();
  if (!ACTIVE_STATUSES.has(status)) {
    return jsonResponse(200, corsHeaders, { skipped: true, reason: 'inactive_job' });
  }

  const requirements = parseRequirements(job.requirements);
  const otpReq = getOtpRequirement(requirements);
  if (!otpReq) {
    return jsonResponse(200, corsHeaders, { skipped: true, reason: 'otp_not_required' });
  }
  if (hasOtpEntered(otpReq)) {
    return jsonResponse(200, corsHeaders, { skipped: true, reason: 'otp_already_entered' });
  }

  let onsiteAt = job.otp_onsite_detected_at ? new Date(job.otp_onsite_detected_at).getTime() : 0;

  // Arm server dwell clock the first time the phone reports near.
  if (!onsiteAt && near) {
    const detectedAt = new Date().toISOString();
    const { data: armed, error: armErr } = await db
      .from('jobs')
      .update({ otp_onsite_detected_at: detectedAt, updated_at: detectedAt })
      .eq('id', jobId)
      .eq('assigned_technician_id', technicianId)
      .is('otp_onsite_detected_at', null)
      .select('otp_onsite_detected_at');

    if (armErr) {
      console.error('[auto-ask-otp-on-site] arm failed', armErr.message);
      return jsonResponse(500, corsHeaders, {
        error: 'Could not arm onsite clock',
        details: armErr.message,
      });
    }
    if (armed?.length) {
      onsiteAt = new Date(armed[0].otp_onsite_detected_at).getTime();
      console.log('[auto-ask-otp-on-site] armed', { jobId, onsiteAt: armed[0].otp_onsite_detected_at });
    } else {
      const { data: again } = await db
        .from('jobs')
        .select('otp_onsite_detected_at')
        .eq('id', jobId)
        .maybeSingle();
      onsiteAt = again?.otp_onsite_detected_at
        ? new Date(again.otp_onsite_detected_at).getTime()
        : 0;
    }
  }

  if (!onsiteAt) {
    return jsonResponse(200, corsHeaders, {
      skipped: true,
      reason: 'not_onsite_yet',
      armed: false,
    });
  }

  const elapsed = Date.now() - onsiteAt;
  const remainingMs = Math.max(0, DWELL_MS - elapsed);
  if (remainingMs > 0) {
    return jsonResponse(200, corsHeaders, {
      waiting: true,
      armed: true,
      remainingMs,
      dwellMs: DWELL_MS,
      onsiteDetectedAt: new Date(onsiteAt).toISOString(),
    });
  }

  try {
    const result = await sendOtpAsk(db, {
      jobId,
      technicianId,
      customerId: job.customer_id,
    });
    return jsonResponse(200, corsHeaders, {
      ...result,
      dwellMs: DWELL_MS,
      onsiteDetectedAt: new Date(onsiteAt).toISOString(),
    });
  } catch (err) {
    console.error('[auto-ask-otp-on-site]', err?.message || err);
    return jsonResponse(500, corsHeaders, {
      error: err instanceof Error ? err.message : 'Ask OTP failed',
    });
  }
};
