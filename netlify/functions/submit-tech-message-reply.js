// Receive a free-text reply typed into the office-message notification
// (MessageReplyReceiver). No session — auth is the HMAC replyToken from
// send-tech-push. Reply is NOT stored; it is pushed to all admin devices
// as a data-only notification so admins can reply back inline.

const { createClient } = require('@supabase/supabase-js');
const { getMessaging, isStaleTokenError, getAdminFcmTokens, pruneAdminFcmTokens } = require('./fcm-helper');
const {
  makeOfficeMessageReplyToken,
  verifyOfficeMessageReplyToken,
} = require('./office-message-reply-token');

const REPLY_MAX = 300;

/** Capitalize and lightly tidy a free-text tech reply for the admin tray. */
function formatReplyText(reply) {
  let t = String(reply || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!t) return t;
  // Bare ETA / finish estimates: "60" → "60 min."
  if (/^\d{1,3}$/.test(t)) return `${t} min.`;
  const minOnly = t.match(/^(\d{1,3})\s*m(in(ute)?s?)?\.?$/i);
  if (minOnly) return `${minOnly[1]} min.`;
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (t.length < 100 && !/[.!?…]$/.test(t)) t += '.';
  return t;
}

/**
 * Turn office nudge copy into a short "about" line for the admin notification.
 * e.g. "On the way? — reply with your ETA." → "On the way?"
 */
function formatNudgeAbout(originalTitle, originalBody, aboutFromToken) {
  const fromToken = String(aboutFromToken || '').trim();
  if (fromToken) return fromToken.slice(0, 80);
  const body = String(originalBody || '').trim();
  if (body) {
    const head = body.split(/[—\n]/)[0].trim();
    if (head && head.length <= 80 && !/^★/.test(head)) return head;
  }
  const title = String(originalTitle || '').trim();
  // Customer ★ markers alone aren't useful as "about" — skip.
  if (title && !/^★/.test(title)) return title.slice(0, 80);
  return '';
}

function buildAdminReplyCopy(techName, reply, originalTitle, originalBody, aboutFromToken) {
  const name = (techName || 'Technician').trim() || 'Technician';
  const nice = formatReplyText(reply);
  const about = formatNudgeAbout(originalTitle, originalBody, aboutFromToken);
  const title = `${name} replied`;
  let body;
  if (about) {
    body = `${about}\n→ ${nice}`;
  } else {
    body = nice;
  }
  return { title: title.slice(0, 120), body: body.slice(0, 300) };
}

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
  const originalTitle = String(body.originalTitle || body.aboutTitle || '').trim().slice(0, 120);
  const originalBody = String(body.originalBody || body.aboutBody || '').trim().slice(0, 300);
  if (!replyToken || !reply) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing fields' }) };
  }

  const verified = verifyOfficeMessageReplyToken(replyToken);
  if (!verified.ok) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: verified.error || 'Forbidden' }) };
  }
  const technicianId = verified.technicianId;
  const aboutFromToken = verified.about || '';

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
    .select('full_name, photo')
    .eq('id', technicianId)
    .maybeSingle();
  const techName = (tech?.full_name && String(tech.full_name).trim()) || 'Technician';
  const techPhotoRaw = tech?.photo != null ? String(tech.photo).trim() : '';
  // FCM data values must be short strings; only pass public HTTPS URLs.
  const techPhoto =
    techPhotoRaw.length > 8 &&
    techPhotoRaw.length < 2000 &&
    /^https:\/\//i.test(techPhotoRaw)
      ? techPhotoRaw
      : '';

  const tokens = await getAdminFcmTokens(db, 'tech_messages');
  if (tokens.length === 0) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, admins: 0 }) };
  }

  const siteUrl = (process.env.URL || '').replace(/\/$/, '');
  // Fresh token so the admin can reply back to this technician (no DB).
  const adminReplyToken = makeOfficeMessageReplyToken(technicianId);

  try {
    const messaging = await getMessaging(db);
    const { title, body: msgBody } = buildAdminReplyCopy(
      techName,
      reply,
      originalTitle,
      originalBody,
      aboutFromToken
    );
    const results = await Promise.allSettled(
      tokens.map((token) =>
        messaging.send({
          token,
          // Data-only: admin HroMessagingService shows notification + Reply.
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
      await pruneAdminFcmTokens(db, stale);
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, admins: sent }) };
  } catch (err) {
    console.error('[submit-tech-message-reply] failed', err?.message || err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Push failed' }) };
  }
};
