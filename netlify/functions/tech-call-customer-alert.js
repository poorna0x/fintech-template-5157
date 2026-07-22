// Silent caller lookup for the native apps. Two flows, both push to every
// admin device only when the number matches an existing customer:
//  - Technician phone rings → { token, number } → "X got a call from a
//    customer" (token must exist in technician_push_tokens / legacy table).
//    Skip when that technician already has an ongoing job for this customer
//    (PENDING / ASSIGNED / EN_ROUTE / IN_PROGRESS — not FOLLOW_UP).
//  - Admin phone MISSED a call → { token, number, missed: true } → "Missed
//    call from customer" (token must exist in admin_push_tokens).
// Tapping either push opens that customer in the admin app (tech_call deep
// link). No match → no push.
//
// Auth: the device's FCM token is the credential. Tokens are long random
// strings created by FCM and deleted on logout — same trust level as the
// one-time nonces used by upload-tech-location. The call happens natively
// (app may be killed), so no Supabase JWT is available; origin checks don't
// apply.

const { createClient } = require('@supabase/supabase-js');
const { getMessaging, isStaleTokenError } = require('./fcm-helper');
const { checkRateLimit, checkRateLimitForKey, rateLimitResponseForKey } = require('./rate-limiter');

const HEADERS = { 'Content-Type': 'application/json' };

/** Ongoing (active work) — excludes FOLLOW_UP / RESCHEDULED / completed. */
const ONGOING_JOB_STATUSES = ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'];

/** Any format → bare 10-digit Indian number ('' when too short to match). */
function normalizePhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.length >= 12 && digits.startsWith('91')) digits = digits.slice(2);
  digits = digits.replace(/^0+/, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Cheap abuse guards: per-IP and per-device-token.
  const ipLimit = checkRateLimit(event, {
    maxRequests: 120,
    windowMs: 3_600_000,
    endpoint: 'tech-call-alert-ip',
  });
  if (!ipLimit.allowed) return rateLimitResponseForKey(ipLimit);

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const deviceToken = String(body.token || '').trim();
  const phone = normalizePhone(body.number);
  if (deviceToken.length < 50) {
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }
  if (!phone) {
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ found: false }) };
  }

  const tokenLimit = checkRateLimitForKey(deviceToken, {
    maxRequests: 60,
    windowMs: 3_600_000,
    endpoint: 'tech-call-alert-token',
  });
  if (!tokenLimit.allowed) return rateLimitResponseForKey(tokenLimit);

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const missed = body.missed === true;

  // Authenticate the device: FCM token → technician (ring flow) or admin
  // device (missed-call flow). Legacy fallback covers technician phones that
  // registered before the multi-device table existed.
  let technicianId = null;
  let isAdminDevice = false;
  const { data: tokenRow } = await db
    .from('technician_push_tokens')
    .select('technician_id')
    .eq('token', deviceToken)
    .maybeSingle();
  technicianId = tokenRow?.technician_id || null;
  if (!technicianId) {
    const { data: legacyRow } = await db
      .from('technician_live_locations')
      .select('technician_id')
      .eq('fcm_token', deviceToken)
      .maybeSingle();
    technicianId = legacyRow?.technician_id || null;
  }
  if (!technicianId && missed) {
    const { data: adminRow } = await db
      .from('admin_push_tokens')
      .select('token')
      .eq('token', deviceToken)
      .maybeSingle();
    isAdminDevice = Boolean(adminRow);
  }
  if (!technicianId && !isAdminDevice) {
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  // One slim indexed lookup — id and name only.
  const { data: customer } = await db
    .from('customers')
    .select('id,full_name')
    .or(`phone.like.%${phone},alternate_phone.like.%${phone}`)
    .limit(1)
    .maybeSingle();
  if (!customer) {
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ found: false }) };
  }

  // Tech already on an ongoing job with this customer → expected call, skip admin push.
  // Follow-up / rescheduled jobs still notify. Admin missed-call flow is unchanged.
  if (technicianId && !isAdminDevice) {
    const { data: ongoingJob } = await db
      .from('jobs')
      .select('id')
      .eq('assigned_technician_id', technicianId)
      .eq('customer_id', customer.id)
      .in('status', ONGOING_JOB_STATUSES)
      .limit(1)
      .maybeSingle();
    if (ongoingJob?.id) {
      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({ found: true, sent: 0, reason: 'ongoing_job' }),
      };
    }
  }

  const [{ data: tech }, { data: tokenRows, error: tokErr }] = await Promise.all([
    technicianId
      ? db.from('technicians').select('full_name').eq('id', technicianId).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from('admin_push_tokens').select('token'),
  ]);
  if (tokErr) {
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ sent: 0, reason: 'no_table' }) };
  }
  const tokens = (tokenRows || []).map((r) => r.token).filter(Boolean);
  if (tokens.length === 0) {
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ sent: 0, reason: 'no_tokens' }) };
  }

  const techName = tech?.full_name || 'Technician';
  let title;
  let color;
  if (isAdminDevice) {
    title = 'Missed call from customer';
    color = '#DC2626';
  } else if (missed) {
    title = `${techName} missed a customer call`;
    color = '#DC2626';
  } else {
    title = `${techName} got a call from a customer`;
    color = '#0369A1';
  }

  try {
    const messaging = await getMessaging(db);
    const res = await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title,
        body: `${customer.full_name} (${phone}) — tap to open customer`,
      },
      data: {
        type: 'tech_call',
        phone,
        customerId: String(customer.id),
        ...(technicianId ? { technicianId: String(technicianId) } : {}),
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'job_alerts_v2',
          defaultSound: true,
          color,
          tag: `tech_call_${technicianId || 'admin'}_${phone}${missed ? '_missed' : ''}`,
        },
      },
    });

    const stale = [];
    res.responses.forEach((r, i) => {
      if (!r.success && isStaleTokenError(r.error)) stale.push(tokens[i]);
    });
    if (stale.length > 0) {
      await db.from('admin_push_tokens').delete().in('token', stale);
    }

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ found: true, sent: res.successCount }),
    };
  } catch (err) {
    console.error('[tech-call-customer-alert] send failed', err?.message || err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Push send failed' }) };
  }
};
