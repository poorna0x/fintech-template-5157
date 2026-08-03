// Technician dismissed or opened a push — fan out a light admin alert.
// Auth is the HMAC ackToken from send-tech-push (no session).
// dismissed → silent (no sound) on admin phones
// opened → normal sound, only for source=direct_message

const { createClient } = require('@supabase/supabase-js');
const {
  getMessaging,
  isStaleTokenError,
  getAdminFcmTokens,
  pruneAdminFcmTokens,
} = require('./fcm-helper');
const { verifyTechPushAckToken } = require('./tech-push-ack-token');

function aboutLine(originalTitle, originalBody, aboutFromToken) {
  const fromToken = String(aboutFromToken || '').trim();
  if (fromToken) return fromToken.slice(0, 80);
  const body = String(originalBody || '').trim();
  if (body) {
    const head = body.split(/[—\n]/)[0].trim();
    if (head && head.length <= 80 && !/^★/.test(head)) return head;
  }
  const title = String(originalTitle || '').trim();
  if (title && !/^★/.test(title)) return title.slice(0, 80);
  return '';
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

  const ackToken = String(body.ackToken || '').trim();
  const action = String(body.action || '')
    .trim()
    .toLowerCase();
  const originalTitle = String(body.originalTitle || body.aboutTitle || '').trim().slice(0, 120);
  const originalBody = String(body.originalBody || body.aboutBody || '').trim().slice(0, 300);

  if (!ackToken || (action !== 'dismissed' && action !== 'seen' && action !== 'opened')) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing fields' }) };
  }

  const verified = verifyTechPushAckToken(ackToken);
  if (!verified.ok) {
    // Expired / invalid — quiet success so old APKs / late swipes don't error loudly.
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, skipped: true }) };
  }

  const { technicianId, source, about: aboutFromToken } = verified;

  // Open alerts only for direct Message technician.
  if (action === 'opened' && source !== 'direct_message') {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, skipped: true }) };
  }

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

  const about = aboutLine(originalTitle, originalBody, aboutFromToken);
  let title;
  let msgBody;
  let type;
  let silent;
  if (action === 'dismissed' || action === 'seen') {
    type = 'tech_push_dismissed';
    title = `${techName} saw the notification`;
    msgBody = about || 'Opened or cleared on their phone';
    silent = true;
  } else {
    type = 'tech_message_opened';
    title = `${techName} opened the message`;
    msgBody = about || 'Opened office message';
    silent = false;
  }

  // Dismiss/seen acks use their own Device Tracker toggle; open uses tech_messages.
  const category =
    action === 'dismissed' || action === 'seen' ? 'tech_dismiss_acks' : 'tech_messages';
  const tokens = await getAdminFcmTokens(db, category);
  if (tokens.length === 0) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, admins: 0 }) };
  }

  try {
    const messaging = await getMessaging(db);
    const results = await Promise.allSettled(
      tokens.map((token) =>
        messaging.send({
          token,
          data: {
            type,
            msgTitle: title.slice(0, 120),
            msgBody: msgBody.slice(0, 300),
            title: title.slice(0, 120),
            body: msgBody.slice(0, 300),
            techName,
            technicianId,
            source: String(source),
            silent: silent ? '1' : '0',
            // One tray slot per technician so two techs seeing a message don't overwrite each other.
            tag: silent
              ? `tech_push_dismissed_${technicianId || 'unknown'}`
              : `tech_message_opened_${technicianId || 'unknown'}`,
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
      else console.error('[submit-tech-push-ack] send failed', r.reason?.message || r.reason);
    });
    if (stale.length) {
      await pruneAdminFcmTokens(db, stale);
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, admins: sent }) };
  } catch (err) {
    console.error('[submit-tech-push-ack] failed', err?.message || err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Push failed' }) };
  }
};
