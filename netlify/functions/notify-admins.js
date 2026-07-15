// Push a "job started" / "job completed" notification to all admin phones
// (HRO Admin app). Called by the technician app when they start or complete
// a job. Auth: technician (or admin) session JWT; the job must be assigned
// to the calling technician.

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { verifyStaffBearerToken, readBearerToken } = require('./admin-auth-guard');
const { getMessaging, isStaleTokenError } = require('./fcm-helper');

const COLOR_STARTED = '#F97316'; // orange — work in progress
const COLOR_COMPLETED = '#16A34A'; // green — done

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
  if (!jobId || !['started', 'completed'].includes(evt)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'jobId and event required' }) };
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
    .select('id,service_sub_type,assigned_technician_id,customer:customers(full_name)')
    .eq('id', jobId)
    .maybeSingle();
  if (jobErr || !job) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Job not found' }) };
  }
  if (auth.role === 'technician' && job.assigned_technician_id !== auth.userId) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  const { data: tech } = await db
    .from('technicians')
    .select('full_name')
    .eq('id', job.assigned_technician_id || auth.userId)
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
  const title =
    evt === 'started' ? `${techName} started a job` : `${techName} completed a job`;
  const message = `${service} — ${customerName}`;
  const color = evt === 'started' ? COLOR_STARTED : COLOR_COMPLETED;

  try {
    const messaging = await getMessaging(db);
    const res = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body: message },
      data: { type: 'job_event' },
      android: {
        priority: 'high',
        notification: { channelId: 'job_alerts', defaultSound: true, color },
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
      body: JSON.stringify({ sent: res.successCount }),
    };
  } catch (err) {
    console.error('[notify-admins] send failed', err?.message || err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Push send failed' }) };
  }
};
