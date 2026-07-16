// Send a visible push notification to a technician's Android app.
// Admin-only. Used for job assignment/reassignment alerts — the system tray
// shows the notification even when the app is closed.
//
// Optional allowReply: data-only push; native shows an inline Reply action.
// Replies are HMAC-authed (no DB) and fan out to admin phones only.

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { authorizeAdminBearer } = require('./admin-auth-guard');
const { getMessaging, sendToTechnicianDevices } = require('./fcm-helper');
const { makeOfficeMessageReplyToken } = require('./office-message-reply-token');

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

  const auth = await authorizeAdminBearer(event, body);
  if (!auth.ok) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: auth.error }) };
  }

  const technicianId = String(body.technicianId || '').trim();
  const title = String(body.title || '').trim().slice(0, 120);
  const message = String(body.body || '').trim().slice(0, 300);
  const colorRaw = String(body.color || '').trim();
  const color = /^#[0-9a-fA-F]{6}$/.test(colorRaw) ? colorRaw : undefined;
  // Same-tag notifications replace each other on the phone (used by the
  // Message technician tool so a resend updates the previous message).
  const tagRaw = String(body.tag || '').trim();
  const tag = /^[\w.-]{1,64}$/.test(tagRaw) ? tagRaw : undefined;
  // clear: silent data push; the app's native handler dismisses our
  // notifications from the tray instead of showing anything.
  const clear = body.clear === true;
  // allowReply: data-only push; native shows notification with inline Reply.
  const allowReply = body.allowReply === true;
  if (!technicianId || (!clear && !title && !(allowReply && message))) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'technicianId and title required' }) };
  }
  if (!clear && !allowReply && !title) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'technicianId and title required' }) };
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const messaging = await getMessaging(db);
    const siteUrl = (process.env.URL || '').replace(/\/$/, '');

    let buildMessage;
    if (clear) {
      buildMessage = (token) => ({
        token,
        data: { type: 'clear_notifications', ...(tag ? { tag } : {}) },
        android: { priority: 'high' },
      });
    } else if (allowReply) {
      const replyToken = makeOfficeMessageReplyToken(technicianId);
      const notifTitle = title || 'Message from office';
      buildMessage = (token) => ({
        token,
        // Data-only so HroMessagingService builds a notification with Reply.
        data: {
          type: 'office_message',
          title: notifTitle,
          body: message || '',
          replyToken,
          replyUrl: `${siteUrl}/.netlify/functions/submit-tech-message-reply`,
          tag: tag || 'office_message',
          ...(color ? { color } : {}),
        },
        android: { priority: 'high' },
      });
    } else {
      buildMessage = (token) => ({
        token,
        notification: { title, body: message || undefined },
        data: { type: 'job_notification' },
        android: {
          priority: 'high',
          notification: {
            channelId: 'job_alerts_v2',
            defaultSound: true,
            ...(color ? { color } : {}),
            ...(tag ? { tag } : {}),
          },
        },
      });
    }

    const { sent, tokens } = await sendToTechnicianDevices(db, messaging, technicianId, buildMessage);
    if (tokens === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ sent: false, reason: 'no_token' }) };
    }
    if (sent === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ sent: false, reason: 'stale_token' }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ sent: true, devices: sent }) };
  } catch (err) {
    console.error('[send-tech-push] failed', err?.message || err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Push send failed' }) };
  }
};
