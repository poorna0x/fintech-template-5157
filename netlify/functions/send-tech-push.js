// Send a visible push notification to a technician's Android app.
// Admin-only. Used for job assignment/reassignment alerts — the system tray
// shows the notification even when the app is closed.

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { authorizeAdminBearer } = require('./admin-auth-guard');
const {
  getMessaging,
  getTechnicianFcmToken,
  clearTechnicianFcmToken,
  isStaleTokenError,
} = require('./fcm-helper');

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
  if (!technicianId || (!title && !clear)) {
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
    const token = await getTechnicianFcmToken(db, technicianId);
    if (!token) {
      return { statusCode: 200, headers, body: JSON.stringify({ sent: false, reason: 'no_token' }) };
    }

    const messaging = await getMessaging(db);
    if (clear) {
      await messaging.send({
        token,
        data: { type: 'clear_notifications', ...(tag ? { tag } : {}) },
        android: { priority: 'high' },
      });
    } else {
      await messaging.send({
        token,
        notification: { title, body: message || undefined },
        data: { type: 'job_notification' },
        android: {
          priority: 'high',
          notification: {
            channelId: 'job_alerts',
            defaultSound: true,
            ...(color ? { color } : {}),
            ...(tag ? { tag } : {}),
          },
        },
      });
    }
    return { statusCode: 200, headers, body: JSON.stringify({ sent: true }) };
  } catch (err) {
    if (isStaleTokenError(err)) {
      await clearTechnicianFcmToken(db, technicianId);
      return { statusCode: 200, headers, body: JSON.stringify({ sent: false, reason: 'stale_token' }) };
    }
    console.error('[send-tech-push] failed', err?.message || err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Push send failed' }) };
  }
};
