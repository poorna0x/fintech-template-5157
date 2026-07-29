// Receive a crash trace from the technician / admin Android app.
//
// The phone cannot POST while it is crashing, so it stores the trace locally
// and calls this on the next app start. There is no Supabase session at that
// point (the crash may have happened in a background service), so auth is the
// FCM device token — the same trust path as tech-call-customer-alert.
//
// Repeat crashes of the same signature bump `occurrences` on the existing row
// instead of inserting, so a crash loop stays one row.

const { createClient } = require('@supabase/supabase-js');
const { checkRateLimit, checkRateLimitForKey, rateLimitResponseForKey } = require('./rate-limiter');

const HEADERS = { 'Content-Type': 'application/json' };

const MAX_STACK_CHARS = 6000;
/** Fold a repeat crash into its existing row for this long. */
const FOLD_WINDOW_MS = 30 * 24 * 3600 * 1000;

function clean(value, max) {
  return String(value == null ? '' : value)
    .replace(/\s+$/, '')
    .slice(0, max);
}

/**
 * What makes two crashes "the same": the exception plus the first frame in our
 * own code. Frames from the framework/Play Services are noise — the same bug
 * surfaces through different system frames on different phones.
 */
function buildSignature(exception, stack) {
  const frames = String(stack || '').split('\n');
  const appFrame = frames.find((line) => line.includes('com.hydrogenro.'));
  const firstFrame = appFrame || frames.find((line) => line.trim().startsWith('at ')) || '';
  return `${exception}|${firstFrame.trim()}`.slice(0, 400);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const ipLimit = checkRateLimit(event, {
    maxRequests: 60,
    windowMs: 3_600_000,
    endpoint: 'report-app-crash-ip',
  });
  if (!ipLimit.allowed) return rateLimitResponseForKey(ipLimit);

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const deviceToken = String(body.token || '').trim();
  if (deviceToken.length < 20) {
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const tokenLimit = checkRateLimitForKey(deviceToken, {
    maxRequests: 20,
    windowMs: 3_600_000,
    endpoint: 'report-app-crash-token',
  });
  if (!tokenLimit.allowed) return rateLimitResponseForKey(tokenLimit);

  const exception = clean(body.exception, 300);
  const stack = clean(body.stack, MAX_STACK_CHARS);
  if (!exception || !stack) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing crash' }) };
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Identify the phone. Unknown token = reject, so this endpoint can't be
  // used to stuff the table with junk.
  let app = null;
  let technicianId = null;

  const { data: techToken } = await db
    .from('technician_push_tokens')
    .select('technician_id')
    .eq('token', deviceToken)
    .maybeSingle();
  if (techToken?.technician_id) {
    app = 'technician';
    technicianId = techToken.technician_id;
  } else {
    const { data: adminToken } = await db
      .from('admin_push_tokens')
      .select('token')
      .eq('token', deviceToken)
      .maybeSingle();
    if (adminToken) app = 'admin';
  }

  if (!app) {
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Unknown device' }) };
  }

  const appVersion = clean(body.appVersion, 40);
  const kind = body.kind === 'warning' ? 'warning' : 'crash';
  const signature = buildSignature(exception, stack);
  const occurredAtMs = Number(body.occurredAt);
  const lastSeenAt =
    Number.isFinite(occurredAtMs) && occurredAtMs > 1_000_000_000_000
      ? new Date(occurredAtMs).toISOString()
      : new Date().toISOString();

  const row = {
    app,
    kind,
    technician_id: technicianId,
    device_token_suffix: deviceToken.slice(-8),
    device_model: clean(body.device, 120) || null,
    app_version: appVersion || null,
    android_version: clean(body.androidVersion, 40) || null,
    signature,
    exception,
    message: clean(body.message, 500) || null,
    stack,
    last_seen_at: lastSeenAt,
  };

  try {
    const foldSince = new Date(Date.now() - FOLD_WINDOW_MS).toISOString();
    let existingQuery = db
      .from('app_crash_reports')
      .select('id, occurrences')
      .eq('app', app)
      .eq('kind', kind)
      .eq('signature', signature)
      .gte('last_seen_at', foldSince)
      .order('last_seen_at', { ascending: false })
      .limit(1);
    existingQuery = technicianId
      ? existingQuery.eq('technician_id', technicianId)
      : existingQuery.is('technician_id', null);
    existingQuery = appVersion
      ? existingQuery.eq('app_version', appVersion)
      : existingQuery.is('app_version', null);

    const { data: existing } = await existingQuery.maybeSingle();

    if (existing?.id) {
      const { error: updErr } = await db
        .from('app_crash_reports')
        .update({
          occurrences: (existing.occurrences || 1) + 1,
          last_seen_at: lastSeenAt,
          stack,
          message: row.message,
          device_model: row.device_model,
        })
        .eq('id', existing.id);
      if (updErr) throw updErr;
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true, folded: true }) };
    }

    const { error: insErr } = await db.from('app_crash_reports').insert(row);
    if (insErr) throw insErr;
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true, folded: false }) };
  } catch (err) {
    console.error('[report-app-crash] save failed', err?.message || err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Save failed' }) };
  }
};
