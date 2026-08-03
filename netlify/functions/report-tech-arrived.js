// Technician GPS near customer after Start Job → one-shot admin push.
// Body: { jobId }
// Auth: technician JWT assigned to the job; status EN_ROUTE | IN_PROGRESS.

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { addSecurityHeaders } = require('./security-headers');
const {
  verifyStaffBearerToken,
  readAccessTokenFromEvent,
} = require('./admin-auth-guard');
const { checkRateLimit } = require('./rate-limiter');
const { notifyAdminsTechArrived } = require('./admin-tech-arrived-notify');

const ACTIVE_STATUSES = new Set(['EN_ROUTE', 'IN_PROGRESS']);

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
    endpoint: 'report-tech-arrived',
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
    .select('id, status, assigned_technician_id, tech_arrived_at')
    .eq('id', jobId)
    .maybeSingle();

  if (jobErr) {
    console.error('[report-tech-arrived] job lookup', jobErr.message);
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
  if (job.tech_arrived_at) {
    return jsonResponse(200, corsHeaders, { skipped: true, reason: 'already_notified' });
  }

  const status = String(job.status || '').toUpperCase();
  if (!ACTIVE_STATUSES.has(status)) {
    return jsonResponse(200, corsHeaders, { skipped: true, reason: 'inactive_job' });
  }

  const arrivedAt = new Date().toISOString();
  const { data: claimed, error: claimErr } = await db
    .from('jobs')
    .update({ tech_arrived_at: arrivedAt, updated_at: arrivedAt })
    .eq('id', jobId)
    .eq('assigned_technician_id', technicianId)
    .is('tech_arrived_at', null)
    .select('id');

  if (claimErr) {
    console.error('[report-tech-arrived] claim failed', claimErr.message);
    return jsonResponse(500, corsHeaders, {
      error: 'Could not claim arrival',
      details: claimErr.message,
    });
  }
  if (!claimed?.length) {
    return jsonResponse(200, corsHeaders, { skipped: true, reason: 'already_notified' });
  }

  try {
    const result = await notifyAdminsTechArrived(db, { jobId });
    return jsonResponse(200, corsHeaders, {
      notified: true,
      arrivedAt,
      sent: result.sent || 0,
      reason: result.reason,
    });
  } catch (err) {
    console.error('[report-tech-arrived] notify failed', err?.message || err);
    // Stamp already set — do not retry forever; admins may miss this one push.
    return jsonResponse(200, corsHeaders, {
      notified: true,
      arrivedAt,
      sent: 0,
      reason: 'notify_failed',
    });
  }
};
