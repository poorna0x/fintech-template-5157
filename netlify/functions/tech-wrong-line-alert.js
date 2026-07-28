// Technician dialed a customer from a line that is not their company phone
// (technicians.phone). Notifies admins + that technician; tap opens customer.

const { createClient } = require('@supabase/supabase-js');
const {
  getMessaging,
  isStaleTokenError,
  getAdminFcmTokens,
  pruneAdminFcmTokens,
  sendToTechnicianDevices,
} = require('./fcm-helper');
const { checkRateLimit, checkRateLimitForKey, rateLimitResponseForKey } = require('./rate-limiter');
const { findCustomerByPhoneDigits } = require('./customer-phone-lookup');
const { verifyStaffBearerToken, readBearerToken } = require('./admin-auth-guard');

const HEADERS = { 'Content-Type': 'application/json' };

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

  const ipLimit = checkRateLimit(event, {
    maxRequests: 80,
    windowMs: 3_600_000,
    endpoint: 'tech-wrong-line-ip',
  });
  if (!ipLimit.allowed) return rateLimitResponseForKey(ipLimit);

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const customerPhone = normalizePhone(body.number);
  const fromReported = normalizePhone(body.fromNumber);
  if (!customerPhone) {
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ found: false, reason: 'bad_number' }) };
  }

  const deviceToken = String(body.token || '').trim();
  const bearer = readBearerToken(event);

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let technicianId = null;

  if (bearer) {
    const session = await verifyStaffBearerToken(bearer);
    if (session.ok && session.role === 'technician') {
      technicianId = session.userId;
    }
  }

  if (!technicianId) {
    if (deviceToken.length < 20) {
      return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    const tokenLimit = checkRateLimitForKey(deviceToken, {
      maxRequests: 40,
      windowMs: 3_600_000,
      endpoint: 'tech-wrong-line-token',
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
    if (!technicianId) {
      const { data: legacyRow } = await db
        .from('technician_live_locations')
        .select('technician_id')
        .eq('fcm_token', deviceToken)
        .maybeSingle();
      technicianId = legacyRow?.technician_id || null;
    }
  }

  if (!technicianId) {
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const { data: tech } = await db
    .from('technicians')
    .select('full_name, phone, account_status')
    .eq('id', technicianId)
    .maybeSingle();
  if (!tech || tech.account_status !== 'ACTIVE') {
    return { statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Inactive technician' }) };
  }

  const companyPhone = normalizePhone(tech.phone);
  if (!companyPhone) {
    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ found: false, reason: 'no_company_phone' }),
    };
  }

  // Server is source of truth: only alert when reported from-line ≠ company,
  // or when from-line is unknown but client already decided (from empty) —
  // then require client companyPhone match so we don't trust a spoofed dial.
  const clientCompany = normalizePhone(body.companyPhone);
  if (clientCompany && clientCompany !== companyPhone) {
    // Stale cache — still use DB company phone for the comparison below.
  }

  if (fromReported && fromReported === companyPhone) {
    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ found: false, reason: 'same_line' }),
    };
  }
  if (!fromReported && clientCompany !== companyPhone) {
    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ found: false, reason: 'unverified_from' }),
    };
  }

  const customer = await findCustomerByPhoneDigits(db, customerPhone, 'id,full_name');
  if (!customer) {
    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ found: false, reason: 'no_customer' }),
    };
  }

  const techName = tech.full_name || 'Technician';
  const usedLine = fromReported || 'unknown personal/other SIM';
  const title = `${techName} called on wrong number`;
  const bodyText = `${customer.full_name} (${customerPhone}) · used ${usedLine} · company ${companyPhone}`;

  const dataPayload = {
    type: 'wrong_line_call',
    phone: customerPhone,
    customerId: String(customer.id),
    technicianId: String(technicianId),
    fromNumber: fromReported || '',
    companyPhone,
    techName,
  };

  try {
    const messaging = await getMessaging(db);
    const adminTokens = await getAdminFcmTokens(db, 'customer_calls');

    let adminSent = 0;
    if (adminTokens.length > 0) {
      const res = await messaging.sendEachForMulticast({
        tokens: adminTokens,
        notification: { title, body: bodyText },
        data: dataPayload,
        android: {
          priority: 'high',
          notification: {
            channelId: 'job_alerts_v2',
            defaultSound: true,
            color: '#B45309',
            tag: `wrong_line_${technicianId}_${customerPhone}`,
          },
        },
      });
      adminSent = res.successCount || 0;
      const stale = [];
      res.responses.forEach((r, i) => {
        if (!r.success && isStaleTokenError(r.error)) stale.push(adminTokens[i]);
      });
      if (stale.length > 0) await pruneAdminFcmTokens(db, stale);
    }

    const techResult = await sendToTechnicianDevices(
      db,
      messaging,
      technicianId,
      (token) => ({
        token,
        notification: {
          title: 'Call used wrong company number',
          body: `You called ${customer.full_name} (${customerPhone}) from ${usedLine}. Use ${companyPhone}.`,
        },
        data: dataPayload,
        android: {
          priority: 'high',
          notification: {
            channelId: 'job_alerts_v2',
            defaultSound: true,
            color: '#B45309',
            tag: `wrong_line_self_${customerPhone}`,
          },
        },
      }),
      null
    );

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        found: true,
        adminSent,
        techSent: techResult?.sent || 0,
        customerId: customer.id,
      }),
    };
  } catch (err) {
    console.error('[tech-wrong-line-alert] send failed', err?.message || err);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Push send failed' }) };
  }
};
