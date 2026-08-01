// Silent caller lookup for technician/admin phones + JWT backup from the
// technician webview (same auth style as tech-search-customer-alert).
//
// Flows:
//  - Technician phone rings → native POST { token, number } (FCM device auth)
//  - Technician app open/resume/search → JS POST { number } + Bearer JWT
//    (covers FCM auth failures and OEM missing EXTRA_INCOMING_NUMBER via CallLog)
//  - Admin phone MISSED a call → { token, number, missed: true }
//
// Admin push uses Device Tracker → “Customer call alerts” only.
// (tech_search is a separate toggle for search alerts.)

const { createClient } = require('@supabase/supabase-js');
const {
  getMessaging,
  isStaleTokenError,
  getAdminFcmTokens,
  pruneAdminFcmTokens,
} = require('./fcm-helper');
const { checkRateLimit, checkRateLimitForKey, rateLimitResponseForKey } = require('./rate-limiter');
const { findCustomerByPhoneDigits } = require('./customer-phone-lookup');
const { verifyStaffBearerToken, readBearerToken } = require('./admin-auth-guard');

const HEADERS = { 'Content-Type': 'application/json' };

/** Actively assigned / working — treat customer call as expected and skip admin push. */
const ACTIVE_JOB_STATUSES = ['ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'];

/** Any format → bare 10-digit Indian number ('' when too short to match). */
function normalizePhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.length >= 12 && digits.startsWith('91')) digits = digits.slice(2);
  digits = digits.replace(/^0+/, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
}

async function resolveAdminCallTokens(db) {
  // Only “Customer call alerts” — not tech_search (that toggle is search-only).
  return getAdminFcmTokens(db, 'customer_calls');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

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

  const phone = normalizePhone(body.number);
  if (!phone) {
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ found: false, reason: 'bad_number' }) };
  }

  const missed = body.missed === true;
  const deviceToken = String(body.token || '').trim();
  const bearer = readBearerToken(event);
  const callAtRaw = Number(body.callAt);
  const callAt = Number.isFinite(callAtRaw) && callAtRaw > 1_000_000_000_000 ? Math.floor(callAtRaw) : 0;
  let callId = String(body.callId || '').trim().slice(0, 80);

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let technicianId = null;
  let isAdminDevice = false;
  let authVia = null;

  // 1) Prefer technician JWT (same trust path as search alerts).
  if (bearer) {
    const session = await verifyStaffBearerToken(bearer);
    if (session.ok && session.role === 'technician') {
      technicianId = session.userId;
      authVia = 'jwt';
    }
  }

  // 2) FCM device token (native ring / admin missed — no JWT available).
  if (!technicianId) {
    if (deviceToken.length < 20) {
      return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const tokenLimit = checkRateLimitForKey(deviceToken, {
      maxRequests: 60,
      windowMs: 3_600_000,
      endpoint: 'tech-call-alert-token',
    });
    if (!tokenLimit.allowed) return rateLimitResponseForKey(tokenLimit);

    const { data: tokenRow } = await db
      .from('technician_push_tokens')
      .select('technician_id, call_alerts_enabled')
      .eq('token', deviceToken)
      .maybeSingle();
    technicianId = tokenRow?.technician_id || null;
    if (technicianId && tokenRow?.call_alerts_enabled === false) {
      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({ found: false, reason: 'call_detect_off' }),
      };
    }
    if (technicianId) authVia = 'fcm';

    if (!technicianId) {
      const { data: legacyRow } = await db
        .from('technician_live_locations')
        .select('technician_id')
        .eq('fcm_token', deviceToken)
        .maybeSingle();
      technicianId = legacyRow?.technician_id || null;
      if (technicianId) {
        const { data: legacyPrefs } = await db
          .from('technician_push_tokens')
          .select('call_alerts_enabled')
          .eq('token', deviceToken)
          .maybeSingle();
        if (legacyPrefs?.call_alerts_enabled === false) {
          return {
            statusCode: 200,
            headers: HEADERS,
            body: JSON.stringify({ found: false, reason: 'call_detect_off' }),
          };
        }
        authVia = 'fcm_legacy';
      }
    }

    if (!technicianId && missed) {
      const { data: adminRow } = await db
        .from('admin_push_tokens')
        .select('token, call_alerts_enabled')
        .eq('token', deviceToken)
        .maybeSingle();
      isAdminDevice = Boolean(adminRow);
      if (isAdminDevice && adminRow.call_alerts_enabled === false) {
        return {
          statusCode: 200,
          headers: HEADERS,
          body: JSON.stringify({ found: false, reason: 'call_detect_off' }),
        };
      }
      if (isAdminDevice) authVia = 'admin_fcm';
    }
  }

  if (!technicianId && !isAdminDevice) {
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  // JWT path: if every registered device has detect-calls off, respect mute.
  if (authVia === 'jwt' && technicianId) {
    const { data: prefsRows } = await db
      .from('technician_push_tokens')
      .select('call_alerts_enabled')
      .eq('technician_id', technicianId);
    if (
      Array.isArray(prefsRows) &&
      prefsRows.length > 0 &&
      prefsRows.every((r) => r.call_alerts_enabled === false)
    ) {
      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({ found: false, reason: 'call_detect_off' }),
      };
    }
  }

  if (technicianId) {
    const { data: techRow } = await db
      .from('technicians')
      .select('full_name, account_status')
      .eq('id', technicianId)
      .maybeSingle();
    if (!techRow || techRow.account_status !== 'ACTIVE') {
      return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Inactive technician' }) };
    }
  }

  const customer = await findCustomerByPhoneDigits(db, phone, 'id,full_name');
  if (!customer) {
    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ found: false, reason: 'no_customer', authVia }),
    };
  }

  if (technicianId && !isAdminDevice) {
    const { data: activeJob } = await db
      .from('jobs')
      .select('id')
      .eq('assigned_technician_id', technicianId)
      .eq('customer_id', customer.id)
      .in('status', ACTIVE_JOB_STATUSES)
      .limit(1)
      .maybeSingle();
    if (activeJob?.id) {
      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({ found: true, sent: 0, reason: 'active_job', authVia }),
      };
    }
  }

  // Idempotent send: same CallLog call_id → one admin push. Re-call = new call_id.
  // Phone window (45s) catches mismatched ids (native ringAt vs JS dateMs / js:bucket).
  if (technicianId && !isAdminDevice) {
    if (!callId) {
      callId = callAt > 0 ? `${phone}:${callAt}` : `${phone}:t${Math.floor(Date.now() / 20_000)}`;
    }
    const sinceIso = new Date(Date.now() - 45_000).toISOString();
    const { data: recentSamePhone } = await db
      .from('tech_call_alert_events')
      .select('call_id')
      .eq('technician_id', technicianId)
      .eq('phone', phone)
      .gte('created_at', sinceIso)
      .limit(1)
      .maybeSingle();
    if (recentSamePhone?.call_id) {
      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({
          found: true,
          sent: 0,
          reason:
            recentSamePhone.call_id === callId ? 'deduped' : 'deduped_phone_window',
          callId,
          priorCallId: recentSamePhone.call_id,
          authVia,
        }),
      };
    }
    const { error: dedupeErr } = await db.from('tech_call_alert_events').insert({
      technician_id: technicianId,
      call_id: callId,
      phone,
    });
    if (dedupeErr) {
      const code = String(dedupeErr.code || '');
      const msg = String(dedupeErr.message || '');
      if (code === '23505' || /duplicate|unique/i.test(msg)) {
        return {
          statusCode: 200,
          headers: HEADERS,
          body: JSON.stringify({ found: true, sent: 0, reason: 'deduped', callId, authVia }),
        };
      }
      // Table missing — still send (don't block), log once.
      console.warn('[tech-call-customer-alert] dedupe insert failed:', msg);
    }
  }

  const [{ data: tech }, tokens] = await Promise.all([
    technicianId
      ? db.from('technicians').select('full_name').eq('id', technicianId).maybeSingle()
      : Promise.resolve({ data: null }),
    resolveAdminCallTokens(db),
  ]);

  if (tokens.length === 0) {
    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ sent: 0, reason: 'no_tokens', authVia }),
    };
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
        techName,
        missed: missed ? 'true' : 'false',
        ...(technicianId ? { technicianId: String(technicianId) } : {}),
        ...(callId ? { callId } : {}),
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'job_alerts_v2',
          defaultSound: true,
          color,
          // Collapse by tech+phone (omit callId) so duplicate POSTs with
          // mismatched ids replace instead of stacking 3–4 notifications.
          // A true re-call updates the same tag — still one clear alert.
          tag: `tech_call_${technicianId || 'admin'}_${phone}${missed ? '_missed' : ''}`,
        },
      },
    });

    const stale = [];
    res.responses.forEach((r, i) => {
      if (!r.success && isStaleTokenError(r.error)) stale.push(tokens[i]);
    });
    if (stale.length > 0) {
      await pruneAdminFcmTokens(db, stale);
    }

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        found: true,
        sent: res.successCount,
        authVia,
        adminDevices: tokens.length,
      }),
    };
  } catch (err) {
    console.error('[tech-call-customer-alert] send failed', err?.message || err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Push send failed' }) };
  }
};
