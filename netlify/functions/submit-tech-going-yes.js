// Technician tapped Yes on "Are you going?" nudge → set job EN_ROUTE and ping admins.
// Auth: HMAC startToken from send-tech-push (no session).

const { createClient } = require('@supabase/supabase-js');
const { getMessaging, isStaleTokenError } = require('./fcm-helper');
const { verifyJobStartNudgeToken } = require('./job-start-nudge-token');
const { makeOfficeMessageReplyToken } = require('./office-message-reply-token');

const STARTABLE = new Set(['ASSIGNED', 'PENDING', 'EN_ROUTE']);

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
    .select('id, status, assigned_technician_id, job_number, customer_id, customer:customers(full_name)')
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

  const { data: tech } = await db
    .from('technicians')
    .select('full_name, photo')
    .eq('id', technicianId)
    .maybeSingle();
  const techName = (tech?.full_name && String(tech.full_name).trim()) || 'Technician';
  const techPhotoRaw = tech?.photo != null ? String(tech.photo).trim() : '';
  const techPhoto =
    techPhotoRaw.length > 8 &&
    techPhotoRaw.length < 2000 &&
    /^https:\/\//i.test(techPhotoRaw)
      ? techPhotoRaw
      : '';

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

  const customerName =
    (job.customer && (job.customer.full_name || job.customer.fullName)) ||
    'Customer';
  const cust = String(customerName).trim() || 'Customer';
  const title = `${techName} is going`;
  const msgBody = `★ ${cust} ★ — started from nudge.`;

  const { data: tokenRows } = await db.from('admin_push_tokens').select('token');
  const tokens = [...new Set((tokenRows || []).map((r) => r.token).filter(Boolean))];

  if (tokens.length) {
    try {
      const messaging = await getMessaging(db);
      const siteUrl = (process.env.URL || '').replace(/\/$/, '');
      const adminReplyToken = makeOfficeMessageReplyToken(technicianId, 'Are you going?');
      const results = await Promise.allSettled(
        tokens.map((token) =>
          messaging.send({
            token,
            data: {
              type: 'tech_message_reply',
              msgTitle: title,
              msgBody,
              title,
              body: msgBody,
              techName,
              techPhoto,
              technicianId,
              replyToken: adminReplyToken,
              replyUrl: `${siteUrl}/.netlify/functions/submit-admin-message-reply`,
              tag: 'going_now_yes',
            },
            android: { priority: 'high' },
          })
        )
      );
      const stale = [];
      results.forEach((r, i) => {
        if (r.status === 'rejected' && isStaleTokenError(r.reason)) stale.push(tokens[i]);
        else if (r.status === 'rejected') {
          console.error('[submit-tech-going-yes] send', r.reason?.message || r.reason);
        }
      });
      if (stale.length) await db.from('admin_push_tokens').delete().in('token', stale);
    } catch (err) {
      console.error('[submit-tech-going-yes] push', err?.message || err);
    }
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true, updated, status: 'EN_ROUTE' }),
  };
};
