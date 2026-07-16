// Admin typed a reply on the technician's message notification.
// HMAC replyToken (no DB) identifies which technician to send to.
// Fan-out is a data-only office_message so the tech can reply again.

const { createClient } = require('@supabase/supabase-js');
const { getMessaging, sendToTechnicianDevices } = require('./fcm-helper');
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

  const siteUrl = (process.env.URL || '').replace(/\/$/, '');
  const nextToken = makeOfficeMessageReplyToken(technicianId);

  try {
    const messaging = await getMessaging(db);
    const { sent, tokens } = await sendToTechnicianDevices(db, messaging, technicianId, (token) => ({
      token,
      data: {
        type: 'office_message',
        title: 'Reply from office',
        body: reply,
        replyToken: nextToken,
        replyUrl: `${siteUrl}/.netlify/functions/submit-tech-message-reply`,
        tag: 'office_message',
        color: '#2563EB',
      },
      android: { priority: 'high' },
    }));
    if (tokens === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, devices: 0 }) };
    }
    if (sent === 0) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Delivery failed' }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, devices: sent }) };
  } catch (err) {
    console.error('[submit-admin-message-reply] failed', err?.message || err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Push failed' }) };
  }
};
