// Silent caller lookup for technician/admin phones + JWT backup from the
// technician webview (same auth style as tech-search-customer-alert).
//
// Flows:
//  - Technician phone rings → native POST { token, number } (FCM device auth)
//  - Technician app open → JS batch POST { calls: [...] } + Bearer JWT
//    (one invocation catches up missed native alerts; server dedupes)
//  - Admin phone MISSED a call → { token, number, missed: true }
//
// Admin push prefers Device Tracker → “Customer call alerts”, with tech_search
// fallback when that list is empty (avoids silent no_tokens).

const { createClient } = require('@supabase/supabase-js');
const {
  getMessaging,
  isStaleTokenError,
  getAdminFcmTokens,
  pruneAdminFcmTokens,
} = require('./fcm-helper');
const { checkRateLimit, checkRateLimitForKey } = require('./rate-limiter');
const { findCustomerByPhoneDigits } = require('./customer-phone-lookup');
const { verifyStaffBearerToken, readBearerToken } = require('./admin-auth-guard');

const HEADERS = { 'Content-Type': 'application/json' };
const BATCH_MAX = 20;

/** Actively assigned / working — treat customer call as expected and skip admin push. */
const ACTIVE_JOB_STATUSES = ['ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'];

/** Any format → bare 10-digit Indian number ('' when too short to match). */
function normalizePhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.length >= 12 && digits.startsWith('91')) digits = digits.slice(2);
  digits = digits.replace(/^0+/, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
}

function softThrottle() {
  return {
    statusCode: 200,
    headers: HEADERS,
    body: JSON.stringify({ found: false, reason: 'throttled' }),
  };
}

async function resolveAdminCallTokens(db) {
  const callTokens = await getAdminFcmTokens(db, 'customer_calls');
  if (callTokens.length > 0) return callTokens;
  const searchTokens = await getAdminFcmTokens(db, 'tech_search');
  if (searchTokens.length > 0) {
    console.warn(
      '[tech-call-customer-alert] customer_calls empty — falling back to tech_search tokens'
    );
  }
  return searchTokens;
}

/**
 * @returns {{ found: boolean, sent?: number, reason?: string, callId?: string, priorCallId?: string, whatsapp?: object, error?: string }}
 */
async function processOneAlert(db, opts) {
  const {
    phone,
    missed,
    callAt,
    callId: callIdIn,
    technicianId,
    isAdminDevice,
    authVia,
    /** Late open-app catch-up — never auto WhatsApp (stale callbacks). */
    catchup,
  } = opts;

  let callId = String(callIdIn || '').trim().slice(0, 80);

  const customer = await findCustomerByPhoneDigits(db, phone, 'id,full_name');
  if (!customer) {
    return { found: false, reason: 'no_customer', callId: callId || undefined };
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
      return { found: true, sent: 0, reason: 'active_job', callId: callId || undefined };
    }
  }

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
        found: true,
        sent: 0,
        reason:
          recentSamePhone.call_id === callId ? 'deduped' : 'deduped_phone_window',
        callId,
        priorCallId: recentSamePhone.call_id,
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
        return { found: true, sent: 0, reason: 'deduped', callId };
      }
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
      found: true,
      sent: 0,
      reason: 'no_tokens',
      callId: callId || undefined,
      error: 'No admin devices with Customer call alerts enabled',
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

  const messaging = await getMessaging(db);
  // Data-only so admin APK onMessageReceived runs while closed/killed and can
  // save the caller number + show the tray itself (notification+data would not).
  const bodyText = `${customer.full_name} (${phone}) — tap to open customer`;
  const tag = `tech_call_${technicianId || 'admin'}_${phone}${missed ? '_missed' : ''}`;
  const res = await messaging.sendEachForMulticast({
    tokens,
    data: {
      type: 'tech_call',
      phone: String(phone),
      customerId: String(customer.id),
      techName: String(techName),
      missed: missed ? 'true' : 'false',
      title: String(title),
      body: bodyText,
      color: String(color),
      tag,
      channelId: 'job_alerts_v2',
      ...(technicianId ? { technicianId: String(technicianId) } : {}),
      ...(callId ? { callId: String(callId) } : {}),
      ...(catchup ? { catchup: 'true' } : {}),
    },
    android: {
      priority: 'high',
    },
  });

  const stale = [];
  res.responses.forEach((r, i) => {
    if (!r.success && isStaleTokenError(r.error)) stale.push(tokens[i]);
  });
  if (stale.length > 0) {
    await pruneAdminFcmTokens(db, stale);
  }

  let whatsapp = null;
  // Skip WhatsApp on late catch-up — callbacks hours later are worse than silent.
  if (missed && !catchup) {
    try {
      const { maybeSendMissedCallCallbackWhatsApp } = require('./missed-call-whatsapp-helper');
      whatsapp = await maybeSendMissedCallCallbackWhatsApp(db, {
        phone,
        customerId: customer.id,
        customerName: customer.full_name,
      });
    } catch (waErr) {
      console.warn('[tech-call-customer-alert] missed-call WhatsApp skipped', waErr?.message || waErr);
      whatsapp = { sent: false, reason: 'error' };
    }
  }

  return {
    found: true,
    sent: res.successCount,
    callId: callId || undefined,
    ...(whatsapp ? { whatsapp } : {}),
    authVia,
    adminDevices: tokens.length,
  };
}

async function resolveCaller(db, event, body) {
  const deviceToken = String(body.token || '').trim();
  const bearer = readBearerToken(event);
  const missed = body.missed === true;

  let technicianId = null;
  let isAdminDevice = false;
  let authVia = null;

  if (bearer) {
    const session = await verifyStaffBearerToken(bearer);
    if (session.ok && session.role === 'technician') {
      technicianId = session.userId;
      authVia = 'jwt';
    }
  }

  if (authVia === 'jwt' && technicianId) {
    const jwtLimit = checkRateLimitForKey(`tech-call-jwt:${technicianId}`, {
      maxRequests: 15,
      windowMs: 3_600_000,
      endpoint: 'tech-call-alert-jwt',
    });
    if (!jwtLimit.allowed) return { errorResponse: softThrottle() };
  }

  if (!technicianId) {
    if (deviceToken.length < 20) {
      return {
        errorResponse: {
          statusCode: 401,
          headers: HEADERS,
          body: JSON.stringify({ error: 'Unauthorized' }),
        },
      };
    }

    const tokenLimit = checkRateLimitForKey(deviceToken, {
      maxRequests: 20,
      windowMs: 3_600_000,
      endpoint: 'tech-call-alert-token',
    });
    if (!tokenLimit.allowed) return { errorResponse: softThrottle() };

    const { data: tokenRow } = await db
      .from('technician_push_tokens')
      .select('technician_id, call_alerts_enabled')
      .eq('token', deviceToken)
      .maybeSingle();
    technicianId = tokenRow?.technician_id || null;
    if (technicianId && tokenRow?.call_alerts_enabled === false) {
      return {
        errorResponse: {
          statusCode: 200,
          headers: HEADERS,
          body: JSON.stringify({ found: false, reason: 'call_detect_off' }),
        },
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
            errorResponse: {
              statusCode: 200,
              headers: HEADERS,
              body: JSON.stringify({ found: false, reason: 'call_detect_off' }),
            },
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
          errorResponse: {
            statusCode: 200,
            headers: HEADERS,
            body: JSON.stringify({ found: false, reason: 'call_detect_off' }),
          },
        };
      }
      if (isAdminDevice) authVia = 'admin_fcm';
    }
  }

  if (!technicianId && !isAdminDevice) {
    return {
      errorResponse: {
        statusCode: 401,
        headers: HEADERS,
        body: JSON.stringify({ error: 'Unauthorized' }),
      },
    };
  }

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
        errorResponse: {
          statusCode: 200,
          headers: HEADERS,
          body: JSON.stringify({ found: false, reason: 'call_detect_off' }),
        },
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
      return {
        errorResponse: {
          statusCode: 403,
          headers: HEADERS,
          body: JSON.stringify({ error: 'Inactive technician' }),
        },
      };
    }
  }

  return { technicianId, isAdminDevice, authVia };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const ipLimit = checkRateLimit(event, {
    maxRequests: 60,
    windowMs: 3_600_000,
    endpoint: 'tech-call-alert-ip',
  });
  if (!ipLimit.allowed) return softThrottle();

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const batchRaw = Array.isArray(body.calls) ? body.calls : null;

  // ── Batch catch-up (JWT only): one invocation for many CallLog rows ──
  if (batchRaw) {
    const auth = await resolveCaller(db, event, body);
    if (auth.errorResponse) return auth.errorResponse;
    if (auth.authVia !== 'jwt' || !auth.technicianId) {
      return {
        statusCode: 401,
        headers: HEADERS,
        body: JSON.stringify({ error: 'Batch catch-up requires technician JWT' }),
      };
    }

    const seen = new Set();
    const items = [];
    for (const row of batchRaw) {
      if (items.length >= BATCH_MAX) break;
      if (!row || typeof row !== 'object') continue;
      const phone = normalizePhone(row.number);
      if (!phone) continue;
      const callAtRaw = Number(row.callAt ?? row.callLogDate);
      const callAt =
        Number.isFinite(callAtRaw) && callAtRaw > 1_000_000_000_000 ? Math.floor(callAtRaw) : 0;
      let callId = String(row.callId || '').trim().slice(0, 80);
      if (!callId && callAt > 0) callId = `${phone}:${callAt}`;
      if (!callId || seen.has(callId)) continue;
      seen.add(callId);
      items.push({
        phone,
        callAt,
        callId,
        missed: row.missed === true,
      });
    }

    if (items.length === 0) {
      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({ found: false, reason: 'empty_batch', processed: 0, notified: 0 }),
      };
    }

    const results = [];
    let notified = 0;
    try {
      for (const item of items) {
        const r = await processOneAlert(db, {
          phone: item.phone,
          missed: item.missed,
          callAt: item.callAt,
          callId: item.callId,
          technicianId: auth.technicianId,
          isAdminDevice: false,
          authVia: auth.authVia,
          catchup: true,
        });
        results.push({
          callId: item.callId,
          found: r.found,
          sent: r.sent || 0,
          reason: r.reason || null,
        });
        if ((r.sent || 0) > 0) notified += 1;
      }
    } catch (err) {
      console.error('[tech-call-customer-alert] batch failed', err?.message || err);
      return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Batch push failed' }) };
    }

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        found: notified > 0 || results.some((r) => r.found),
        batch: true,
        processed: results.length,
        notified,
        results,
        authVia: auth.authVia,
      }),
    };
  }

  // ── Single call (native FCM / JWT / admin missed) ──
  const phone = normalizePhone(body.number);
  if (!phone) {
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ found: false, reason: 'bad_number' }) };
  }

  const missed = body.missed === true;
  const callAtRaw = Number(body.callAt);
  const callAt = Number.isFinite(callAtRaw) && callAtRaw > 1_000_000_000_000 ? Math.floor(callAtRaw) : 0;
  const callId = String(body.callId || '').trim().slice(0, 80);

  const auth = await resolveCaller(db, event, body);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const result = await processOneAlert(db, {
      phone,
      missed,
      callAt,
      callId,
      technicianId: auth.technicianId,
      isAdminDevice: auth.isAdminDevice,
      authVia: auth.authVia,
      catchup: false,
    });
    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ ...result, authVia: auth.authVia }),
    };
  } catch (err) {
    console.error('[tech-call-customer-alert] send failed', err?.message || err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Push send failed' }) };
  }
};
