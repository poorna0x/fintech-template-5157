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
const { makeJobStartNudgeToken } = require('./job-start-nudge-token');
const {
  makeTechPushAckToken,
  normalizeSource,
} = require('./tech-push-ack-token');

/** First phrase of nudge body before em dash / newline — embed in reply token. */
function replyAboutFromBody(message) {
  const body = String(message || '').trim();
  if (!body) return '';
  const head = body.split(/[—\n]/)[0].trim();
  if (head && head.length <= 80 && !/^★/.test(head)) return head;
  return '';
}

/** Ack payload fields for dismiss / open callbacks on the tech APK. */
function ackDataFields(siteUrl, technicianId, source, about) {
  try {
    const ackToken = makeTechPushAckToken(technicianId, source, about);
    return {
      ackToken,
      ackUrl: `${siteUrl}/.netlify/functions/submit-tech-push-ack`,
      source: normalizeSource(source),
    };
  } catch (err) {
    console.warn('[send-tech-push] ack token skipped:', err?.message || err);
    return {};
  }
}

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
  // Accept boolean or string (defensive) so Reply isn't silently skipped.
  const allowReply =
    body.allowReply === true || body.allowReply === 'true' || body.allowReply === 1;
  // callPhone: data-only push; native shows a Call action (dialer) — no Reply.
  const callPhoneRaw = String(body.callPhone || body.phone || '').trim();
  const callPhone = callPhoneRaw.replace(/[^\d+]/g, '').slice(0, 20);
  // goingNow: Yes → start job (EN_ROUTE). Default also has No. startOnly = Start button only.
  const goingNow =
    body.goingNow === true || body.goingNow === 'true' || body.goingNow === 1;
  const startOnly =
    body.startOnly === true || body.startOnly === 'true' || body.startOnly === 1;
  const jobId = String(body.jobId || '').trim();
  // assigned | reassigned | unassigned | removed | updated → overlay on tech APK
  const eventRaw = String(body.event || '').trim().toLowerCase();
  const overlayEvents = new Set([
    'assigned',
    'reassigned',
    'unassigned',
    'removed',
    'updated',
  ]);
  const overlayEvent = overlayEvents.has(eventRaw) ? eventRaw : '';
  // Optional draw-over-apps card on top of tray (nudges / messages).
  const showOverlay =
    body.overlay === true || body.overlay === 'true' || body.overlay === 1 ||
    body.showOverlay === true || body.showOverlay === 'true' || body.showOverlay === 1;
  const overlayFlag = showOverlay ? { showOverlay: '1' } : {};
  const replyAbout = String(body.replyAbout || body.about || '').trim().slice(0, 80)
    || replyAboutFromBody(message);
  if (
    !technicianId ||
    (!clear &&
      !title &&
      !(allowReply && message) &&
      !(callPhone && message) &&
      !(goingNow && jobId && message))
  ) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'technicianId and title required' }) };
  }
  if (!clear && !allowReply && !callPhone && !goingNow && !title) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'technicianId and title required' }) };
  }
  if (goingNow && !jobId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'jobId required for goingNow' }) };
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
    const siteUrl = (
      process.env.URL ||
      process.env.DEPLOY_PRIME_URL ||
      process.env.VITE_PUBLIC_SITE_URL ||
      'https://hydrogenro.com'
    ).replace(/\/$/, '');

    // Client can pass source; job overlay events always win as job_alert.
    let pushSource = String(body.source || '').trim().toLowerCase();
    if (overlayEvent) {
      pushSource = 'job_alert';
    } else if (!pushSource) {
      if (callPhone || goingNow) pushSource = 'nudge';
      else if (allowReply) pushSource = 'nudge';
      else pushSource = 'other';
    }
    pushSource = normalizeSource(pushSource);
    const ackAbout = replyAbout || title || '';

    let buildMessage;
    if (clear) {
      buildMessage = (token) => ({
        token,
        data: { type: 'clear_notifications', ...(tag ? { tag } : {}) },
        android: { priority: 'high' },
      });
    } else if (callPhone) {
      // Call-customer nudge: Call action only (no Reply). New tech APK required.
      const notifTitle = title || 'Call customer now';
      const ack = ackDataFields(siteUrl, technicianId, pushSource, ackAbout || notifTitle);
      buildMessage = (token) => ({
        token,
        data: {
          type: 'call_customer',
          msgTitle: notifTitle,
          msgBody: message || callPhone,
          callPhone,
          tag: tag || 'call_customer',
          ...(color ? { color } : {}),
          ...overlayFlag,
          ...ack,
        },
        android: { priority: 'high' },
      });
    } else if (goingNow) {
      // Start job from tray. startOnly → Start button; else Yes + No. Tech APK 3.10+.
      const startToken = makeJobStartNudgeToken(technicianId, jobId);
      const replyToken = makeOfficeMessageReplyToken(
        technicianId,
        replyAbout || (startOnly ? 'Start this job?' : 'Are you going?')
      );
      const notifTitle = title || (startOnly ? 'Start this job' : 'Are you going?');
      const defaultBody = startOnly
        ? 'Tap Start to mark this job on the way.'
        : 'Tap Yes to start this job, or No to tell the office.';
      const ack = ackDataFields(siteUrl, technicianId, pushSource, ackAbout || notifTitle);
      buildMessage = (token) => ({
        token,
        data: {
          type: 'going_now',
          msgTitle: notifTitle,
          msgBody: message || defaultBody,
          jobId,
          startToken,
          startUrl: `${siteUrl}/.netlify/functions/submit-tech-going-yes`,
          replyToken,
          replyUrl: `${siteUrl}/.netlify/functions/submit-tech-message-reply`,
          actionMode: startOnly ? 'start' : 'going',
          tag: tag || (startOnly ? 'start_job' : 'going_now'),
          ...(color ? { color } : {}),
          ...overlayFlag,
          ...ack,
        },
        android: { priority: 'high' },
      });
    } else if (allowReply) {
      const replyToken = makeOfficeMessageReplyToken(technicianId, replyAbout);
      const notifTitle = title || 'Message from office';
      const ack = ackDataFields(siteUrl, technicianId, pushSource, ackAbout || notifTitle);
      console.log('[send-tech-push] allowReply path', {
        technicianId,
        hasToken: !!replyToken,
        about: replyAbout || null,
        overlay: showOverlay,
        source: pushSource,
      });
      buildMessage = (token) => ({
        token,
        // Data-only so HroMessagingService builds a notification with Reply.
        // Use msgTitle/msgBody (not title/body) so OEMs don't treat data as a
        // display notification and skip our native Reply UI.
        data: {
          type: 'office_message',
          msgTitle: notifTitle,
          msgBody: message || '',
          replyToken,
          replyUrl: `${siteUrl}/.netlify/functions/submit-tech-message-reply`,
          tag: tag || 'office_message',
          ...(color ? { color } : {}),
          ...overlayFlag,
          ...ack,
        },
        android: { priority: 'high' },
      });
    } else if (overlayEvent) {
      // Data-only so HroMessagingService can show a draw-over-apps card even
      // when the app is killed (notification+data often never reaches Java).
      const overlayDefaults = {
        assigned: 'New job assigned',
        reassigned: 'Job reassigned to you',
        unassigned: 'Job unassigned from you',
        removed: 'Job moved to another technician',
        updated: 'Job updated',
      };
      const notifTitle = title || overlayDefaults[overlayEvent] || 'Job alert';
      const ack = ackDataFields(siteUrl, technicianId, 'job_alert', ackAbout || notifTitle);
      buildMessage = (token) => ({
        token,
        data: {
          type: 'job_alert_overlay',
          event: overlayEvent,
          msgTitle: notifTitle,
          msgBody: message || '',
          ...(jobId ? { jobId } : {}),
          tag: tag || `job_alert_${overlayEvent}`,
          ...(color ? { color } : {}),
          ...ack,
        },
        android: { priority: 'high' },
      });
    } else if (showOverlay) {
      // Tray-only nudges (e.g. photo) that also want the on-screen card.
      // Data-only so Java runs when the app is killed.
      const notifTitle = title || 'Message from office';
      const ack = ackDataFields(siteUrl, technicianId, pushSource, ackAbout || notifTitle);
      buildMessage = (token) => ({
        token,
        data: {
          type: 'tech_nudge',
          msgTitle: notifTitle,
          msgBody: message || '',
          tag: tag || 'tech_nudge',
          ...(color ? { color } : {}),
          showOverlay: '1',
          ...ack,
        },
        android: { priority: 'high' },
      });
    } else {
      // Data-only so tech APK can attach dismiss/open ack (system notification+data cannot).
      const notifTitle = title || 'Message from office';
      const ack = ackDataFields(siteUrl, technicianId, pushSource, ackAbout || notifTitle);
      buildMessage = (token) => ({
        token,
        data: {
          type: 'tech_nudge',
          msgTitle: notifTitle,
          msgBody: message || '',
          tag: tag || 'tech_nudge',
          ...(color ? { color } : {}),
          ...ack,
        },
        android: { priority: 'high' },
      });
    }

    let category = 'job_assigned';
    if (clear) {
      category = null;
    } else if (callPhone || goingNow) {
      category = 'job_nudges';
    } else if (allowReply) {
      category = 'office_messages';
    } else if (overlayEvent === 'unassigned' || overlayEvent === 'removed') {
      category = 'job_unassigned';
    } else if (overlayEvent) {
      // assigned | reassigned | updated
      category = 'job_assigned';
    } else if (showOverlay) {
      category = 'job_nudges';
    }

    const { sent, tokens } = await sendToTechnicianDevices(
      db,
      messaging,
      technicianId,
      buildMessage,
      category
    );

    // Mirror nudge/office messages to WhatsApp (not assign/unassign — CRM handles those).
    if (!clear && category) {
      const waTitle =
        title ||
        (goingNow
          ? startOnly
            ? 'Start this job'
            : 'Are you going?'
          : callPhone
            ? 'Call customer'
            : allowReply
              ? 'Message from office'
              : 'Message from office');
      const waBody =
        message ||
        (goingNow
          ? startOnly
            ? 'Tap Start to mark this job on the way.'
            : 'Tap Yes to start this job, or No to tell the office.'
          : '');
      if (waTitle || waBody) {
        const { maybeSendTechnicianPushWhatsApp } = require('./tech-push-whatsapp-helper');
        void maybeSendTechnicianPushWhatsApp(db, {
          technicianId,
          category,
          title: waTitle,
          body: waBody,
        });
      }
    }

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
