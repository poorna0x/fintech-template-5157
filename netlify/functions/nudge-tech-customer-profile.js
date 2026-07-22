// Technician self-nudge: missing customer purifier photo.
// Auth: technician JWT; job must be assigned to them (or they are a team member).

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { verifyStaffBearerToken, readBearerToken } = require('./admin-auth-guard');
const { getMessaging, sendToTechnicianDevices } = require('./fcm-helper');

const COLOR = '#D97706';

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
  if (auth.role !== 'technician') {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Technicians only' }) };
  }

  const jobId = String(body.jobId || '').trim();
  const phase = String(body.phase || 'start').trim(); // start | end
  const missingPhoto = body.missingPhoto === true || body.missingPhoto === 'true';
  if (!jobId || !missingPhoto) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'jobId and missingPhoto required' }) };
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: job, error: jobErr } = await db
    .from('jobs')
    .select('id,assigned_technician_id,team_members,customer:customers(full_name)')
    .eq('id', jobId)
    .maybeSingle();
  if (jobErr || !job) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Job not found' }) };
  }

  const team = Array.isArray(job.team_members) ? job.team_members : [];
  const allowed =
    job.assigned_technician_id === auth.userId || team.includes(auth.userId);
  if (!allowed) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  const customerName = job.customer?.full_name || 'this customer';
  const title = phase === 'end' ? 'Still missing purifier photo' : 'Add purifier photo';
  const message = `${customerName} — capture/upload a purifier photo.`;

  try {
    const messaging = await getMessaging(db);
    const { sent, tokens } = await sendToTechnicianDevices(db, messaging, auth.userId, (token) => ({
      token,
      notification: { title, body: message },
      data: {
        type: 'job_notification',
        event: 'customer_profile_gap',
        jobId: String(jobId),
        phase,
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'job_alerts_v2',
          defaultSound: true,
          color: COLOR,
          tag: `profile_gap_${jobId}_${phase}`,
        },
      },
    }), 'job_assigned');
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ sent: sent > 0, devices: sent, tokens }),
    };
  } catch (err) {
    console.error('[nudge-tech-customer-profile] failed', err?.message || err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Push send failed' }) };
  }
};
