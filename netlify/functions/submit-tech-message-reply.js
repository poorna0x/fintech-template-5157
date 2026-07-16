// Receive a free-text reply typed into the office-message notification
// (MessageReplyReceiver). No session — auth is the HMAC replyToken from
// send-tech-push. Reply is NOT stored; it is pushed to all admin devices
// as a data-only notification so admins can reply back inline.

const { createClient } = require('@supabase/supabase-js');
const { getMessaging, isStaleTokenError } = require('./fcm-helper');
const {
  makeOfficeMessageReplyToken,
  verifyOfficeMessageReplyToken,
} = require('./office-message-reply-token');

const REPLY_MAX = 300;

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

  const replyToken = String(body.replyToken || '').trim();
  const reply = String(body.reply || '').trim().slice(0, REPLY_MAX);
  if (!replyToken || !reply) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing fields' }) };
  }

  const verified = verifyOfficeMessageReplyToken(replyToken);
  if (!verified.ok) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: verified.error || 'Forbidden' }) };
  }
  const technicianId = verified.technicianId;

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: tech } = await db
    .from('technicians')
    .select('full_name')
    .eq('id', technicianId)
    .maybeSingle();
  const techName = (tech?.full_name && String(tech.full_name).trim()) || 'Technician';

  const { data: tokenRows, error: tokErr } = await db.from('admin_push_tokens').select('token');
  if (tokErr) {
    console.error('[submit-tech-message-reply] admin tokens', tokErr.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Token lookup failed' }) };
  }
  const tokens = [...new Set((tokenRows || []).map((r) => r.token).filter(Boolean))];
  if (tokens.length === 0) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, admins: 0 }) };
  }

  const siteUrl = (process.env.URL || '').replace(/\/$/, '');
  // Fresh token so the admin can reply back to this technician (no DB).
  const adminReplyToken = makeOfficeMessageReplyToken(technicianId);

  try {
    const messaging = await getMessaging(db);
    const title = `Reply from ${techName}`;
    const results = await Promise.allSettled(
      tokens.map((token) =>
        messaging.send({
          token,
          // Data-only: admin HroMessagingService shows notification + Reply.
          data: {
            type: 'tech_message_reply',
            title,
            body: reply,
            techName,
            technicianId,
            replyToken: adminReplyToken,
            replyUrl: `${siteUrl}/.netlify/functions/submit-admin-message-reply`,
            tag: 'office_message_reply',
          },
          android: { priority: 'high' },
        })
      )
    );
    const stale = [];
    let sent = 0;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') sent += 1;
      else if (isStaleTokenError(r.reason)) stale.push(tokens[i]);
      else console.error('[submit-tech-message-reply] send failed', r.reason?.message || r.reason);
    });
    if (stale.length) {
      await db.from('admin_push_tokens').delete().in('token', stale);
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, admins: sent }) };
  } catch (err) {
    console.error('[submit-tech-message-reply] failed', err?.message || err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Push failed' }) };
  }
};
