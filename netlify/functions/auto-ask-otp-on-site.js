// Technician on-site (~10s dwell in app; was 5 min) on an OTP-required job → Ask OTP once.
// Auth: technician JWT (must be assigned to the job).
// Idempotent: jobs.otp_auto_asked_at is set atomically (NULL → now).
// If OTP already entered, does nothing. Reuses same FCM path as admin Ask OTP.

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { addSecurityHeaders } = require('./security-headers');
const {
  verifyStaffBearerToken,
  readAccessTokenFromEvent,
} = require('./admin-auth-guard');
const { checkRateLimit } = require('./rate-limiter');
const { getMessaging, sendToTechnicianDevices } = require('./fcm-helper');

const ACTIVE_STATUSES = new Set(['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS']);

function jsonResponse(statusCode, corsHeaders, body) {
  return {
    statusCode,
    headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  };
}

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
    maxRequests: 20,
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
    .select('id, status, assigned_technician_id, requirements, otp_auto_asked_at, customer_id')
    .eq('id', jobId)
    .maybeSingle();

  if (jobErr) {
    console.error('[auto-ask-otp-on-site] job lookup', jobErr.message);
    return jsonResponse(500, corsHeaders, { error: 'Lookup failed' });
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

  // Claim the one-shot slot first so concurrent calls cannot double-send.
  const askedAt = new Date().toISOString();
  const { data: claimed, error: claimErr } = await db
    .from('jobs')
    .update({ otp_auto_asked_at: askedAt, updated_at: askedAt })
    .eq('id', jobId)
    .eq('assigned_technician_id', technicianId)
    .is('otp_auto_asked_at', null)
    .select('id');

  if (claimErr) {
    console.error('[auto-ask-otp-on-site] claim failed', claimErr.message);
    return jsonResponse(500, corsHeaders, { error: 'Could not claim auto-ask' });
  }
  if (!claimed?.length) {
    return jsonResponse(200, corsHeaders, { skipped: true, reason: 'already_asked' });
  }

  let customerName = '';
  if (job.customer_id) {
    const { data: customer } = await db
      .from('customers')
      .select('full_name')
      .eq('id', job.customer_id)
      .maybeSingle();
    customerName = String(customer?.full_name || '').trim().slice(0, 80);
  }

  const { data: requestRow, error: upsertErr } = await db
    .from('technician_otp_requests')
    .upsert(
      {
        job_id: jobId,
        technician_id: technicianId,
        otp: null,
        created_at: askedAt,
        submitted_at: null,
        reply_nonce: null,
      },
      { onConflict: 'job_id' }
    )
    .select('id')
    .single();

  if (upsertErr || !requestRow?.id) {
    console.error('[auto-ask-otp-on-site] upsert request failed', upsertErr?.message);
    // Slot already claimed — do not retry forever; tech can still be asked manually.
    return jsonResponse(500, corsHeaders, { error: 'Could not create OTP request' });
  }

  const requestId = requestRow.id;
  const nonce = crypto.randomUUID();
  const { error: nonceErr } = await db
    .from('technician_otp_requests')
    .update({ reply_nonce: nonce })
    .eq('id', requestId)
    .eq('technician_id', technicianId);

  if (nonceErr) {
    console.error('[auto-ask-otp-on-site] nonce failed', nonceErr.message);
    return jsonResponse(200, corsHeaders, {
      asked: true,
      sent: false,
      reason: 'nonce_failed',
      requestId,
    });
  }

  const siteUrl = (process.env.URL || '').replace(/\/$/, '');

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
          submitUrl: `${siteUrl}/.netlify/functions/submit-tech-otp`,
          showOverlay: '1',
        },
        android: { priority: 'high' },
      }),
      'otp_request'
    );

    if (tokens === 0) {
      return jsonResponse(200, corsHeaders, {
        asked: true,
        sent: false,
        reason: 'no_token',
        requestId,
      });
    }
    if (sent === 0) {
      return jsonResponse(200, corsHeaders, {
        asked: true,
        sent: false,
        reason: 'stale_token',
        requestId,
      });
    }

    return jsonResponse(200, corsHeaders, {
      asked: true,
      sent: true,
      devices: sent,
      requestId,
    });
  } catch (err) {
    console.error('[auto-ask-otp-on-site] push failed', err?.message || err);
    return jsonResponse(200, corsHeaders, {
      asked: true,
      sent: false,
      reason: 'push_failed',
      requestId,
    });
  }
};
