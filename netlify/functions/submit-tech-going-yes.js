// Technician tapped Yes/Start on start-job nudge → set job EN_ROUTE and ping
// admins with the SAME push as a normal in-app start (notify-admins en_route).
// Auth: HMAC startToken from send-tech-push (no session).

const { createClient } = require('@supabase/supabase-js');
const { getMessaging, isStaleTokenError, getAdminFcmTokens, pruneAdminFcmTokens } = require('./fcm-helper');
const { verifyJobStartNudgeToken } = require('./job-start-nudge-token');

const STARTABLE = new Set(['ASSIGNED', 'PENDING', 'EN_ROUTE']);
const COLOR_EN_ROUTE = '#2563EB'; // same as notify-admins.js

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

  const startToken = String(body.startToken || '').trim();
  if (!startToken) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing startToken' }) };
  }

  const verified = verifyJobStartNudgeToken(startToken);
  if (!verified.ok) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: verified.error || 'Forbidden' }) };
  }
  const { technicianId, jobId } = verified;

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
    .select(
      'id, status, assigned_technician_id, job_number, service_sub_type, customer:customers(full_name)'
    )
    .eq('id', jobId)
    .maybeSingle();

  if (jobErr || !job) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Job not found' }) };
  }

  const assigned = String(job.assigned_technician_id || '').trim();
  if (assigned !== technicianId) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Not assigned' }) };
  }

  const status = String(job.status || '').toUpperCase();
  if (status === 'IN_PROGRESS' || status === 'COMPLETED' || status === 'CANCELLED' || status === 'DENIED') {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, already: status }) };
  }
  if (!STARTABLE.has(status)) {
    return { statusCode: 409, headers, body: JSON.stringify({ error: `Cannot start from ${status}` }) };
  }

  let updated = false;
  if (status !== 'EN_ROUTE') {
    const { error: updErr } = await db
      .from('jobs')
      .update({ status: 'EN_ROUTE', updated_at: new Date().toISOString() })
      .eq('id', jobId)
      .eq('assigned_technician_id', technicianId);
    if (updErr) {
      console.error('[submit-tech-going-yes] update', updErr.message);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Update failed' }) };
    }
    updated = true;
  }

  // Match notify-admins en_route exactly (skip re-push if already EN_ROUTE).
  if (updated) {
    const { data: tech } = await db
      .from('technicians')
      .select('full_name')
      .eq('id', technicianId)
      .maybeSingle();
    const techName = (tech?.full_name && String(tech.full_name).trim()) || 'Technician';
    const customerName =
      (job.customer && (job.customer.full_name || job.customer.fullName)) || 'customer';
    const service = job.service_sub_type || 'job';
    const title = `${techName} is on the way`;
    const message = `${service} — ${customerName}`;

    const tokens = [...new Set(await getAdminFcmTokens(db, 'job_status'))];

    if (tokens.length) {
      try {
        const messaging = await getMessaging(db);
        const res = await messaging.sendEachForMulticast({
          tokens,
          notification: { title, body: message },
          data: {
            type: 'job_event',
            event: 'en_route',
            jobId: String(jobId),
          },
          android: {
            priority: 'high',
            notification: {
              channelId: 'job_alerts_v2',
              defaultSound: true,
              color: COLOR_EN_ROUTE,
            },
          },
        });
        const stale = [];
        res.responses.forEach((r, i) => {
          if (!r.success && isStaleTokenError(r.error)) stale.push(tokens[i]);
        });
        if (stale.length) await pruneAdminFcmTokens(db, stale);
      } catch (err) {
        console.error('[submit-tech-going-yes] push', err?.message || err);
      }
    }
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true, updated, status: 'EN_ROUTE' }),
  };
};
