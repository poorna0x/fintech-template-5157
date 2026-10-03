// Technician phone already matched the caller in its local list. Push admins
// immediately with that name. No customer or job lookup — hang-up still owns
// missed-call WhatsApp and the "already on this job" skip.

const { createClient } = require('@supabase/supabase-js');
const {
  getMessaging,
  isStaleTokenError,
  getAdminFcmTokens,
  sendAdminMulticast,
  pruneAdminFcmTokens,
} = require('./fcm-helper');
const { checkRateLimitForKey } = require('./rate-limiter');

const HEADERS = { 'Content-Type': 'application/json' };
const DEDUPE_MS = 3 * 60 * 1000;
const recent = new Map();

function json(status, body) {
  return { statusCode: status, headers: HEADERS, body: JSON.stringify(body) };
}

function normalizePhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.length >= 12 && digits.startsWith('91')) digits = digits.slice(2);
  digits = digits.replace(/^0+/, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
}

function cleanName(raw) {
  const name = String(raw || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return name;
}

function recentlySent(key) {
  const now = Date.now();
  for (const [k, at] of recent) {
    if (now - at > DEDUPE_MS) recent.delete(k);
  }
  const at = recent.get(key);
  if (at && now - at < DEDUPE_MS) return true;
  recent.set(key, now);
  return false;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  const phone = normalizePhone(body.number);
  const name = cleanName(body.name);
  const deviceToken = String(body.token || '').trim();
  if (!phone || !name) return json(200, { sent: 0, reason: 'incomplete' });
  if (deviceToken.length < 20) return json(401, { error: 'Unauthorized' });

  const tokenLimit = checkRateLimitForKey(deviceToken, {
    maxRequests: 40,
    windowMs: 60 * 60 * 1000,
    endpoint: 'tech-call-ring',
  });
  if (!tokenLimit.allowed) return json(200, { sent: 0, reason: 'throttled' });

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) return json(500, { error: 'Server misconfigured' });

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: tokenRow } = await db
    .from('technician_push_tokens')
    .select('technician_id, call_alerts_enabled')
    .eq('token', deviceToken)
    .maybeSingle();

  let technicianId = tokenRow?.technician_id || null;
  if (technicianId && tokenRow?.call_alerts_enabled === false) {
    return json(200, { sent: 0, reason: 'call_detect_off' });
  }
  if (!technicianId) {
    const { data: legacyRow } = await db
      .from('technician_live_locations')
      .select('technician_id')
      .eq('fcm_token', deviceToken)
      .maybeSingle();
    technicianId = legacyRow?.technician_id || null;
  }
  if (!technicianId) return json(401, { error: 'Unauthorized' });

  if (recentlySent(`${technicianId}:${phone}`)) {
    return json(200, { sent: 0, reason: 'deduped' });
  }

  const [{ data: tech }, callTokens] = await Promise.all([
    db.from('technicians').select('full_name').eq('id', technicianId).maybeSingle(),
    getAdminFcmTokens(db, 'customer_calls'),
  ]);
  let tokens = callTokens;
  if (!tokens.length) tokens = await getAdminFcmTokens(db, 'tech_search');
  if (!tokens.length) return json(200, { sent: 0, reason: 'no_tokens' });

  const techName = String(tech?.full_name || 'Technician').slice(0, 80);
  const messaging = await getMessaging(db);
  const res = await sendAdminMulticast(db, messaging, {
    tokens,
    data: {
      type: 'tech_call',
      phone,
      techName,
      technicianId: String(technicianId),
      missed: 'false',
      ringing: 'true',
      title: `${techName} — customer calling now`,
      body: `${name} (${phone})`,
      color: '#0369A1',
      tag: `tech_call_${technicianId}_${phone}`,
      channelId: 'job_alerts_v2',
      callAt: String(Date.now()),
    },
    android: { priority: 'high' },
  });

  const stale = [];
  res.responses.forEach((r, i) => {
    if (!r.success && isStaleTokenError(r.error)) stale.push(tokens[i]);
  });
  if (stale.length) await pruneAdminFcmTokens(db, stale);

  return json(200, { sent: res.successCount || 0 });
};
