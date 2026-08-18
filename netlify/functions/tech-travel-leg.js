// Record one avoid-tolls driving leg when a technician taps Start Work.
// Origin is the office (first job of the IST day) or the previous started job.

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { verifyStaffBearerToken, readBearerToken } = require('./admin-auth-guard');
const { computeAndStoreLegForJob } = require('./tech-travel-helper');

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
  if (!jobId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'jobId required' }) };
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: job, error } = await db
    .from('jobs')
    .select('id,assigned_technician_id,team_members')
    .eq('id', jobId)
    .maybeSingle();
  if (error || !job) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Job not found' }) };
  }

  const team = Array.isArray(job.team_members) ? job.team_members : [];
  const allowed =
    auth.role === 'admin' ||
    job.assigned_technician_id === auth.userId ||
    team.includes(auth.userId);
  if (!allowed) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  try {
    const result = await computeAndStoreLegForJob(db, jobId);
    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (err) {
    console.warn('[tech-travel-leg] failed', err?.message || err);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: 'error' }) };
  }
};
