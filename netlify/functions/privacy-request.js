/**
 * Public privacy / DSAR request intake + admin list/update.
 * POST (public): WhatsApp VERIFY session + honeypot + rate limit
 * GET/PATCH (admin JWT): manage queue
 */
const { getCorsHeaders, shouldRejectMissingOrigin } = require('./cors-helper');
const { authorizeAdminRequest } = require('./admin-auth-guard');
const { checkRateLimit } = require('./rate-limiter');
const { createClient } = require('@supabase/supabase-js');
const { recordSecurityAudit } = require('./privacy-consent-helper');
const {
  getSessionSecret,
  normalizePhoneE164,
  verifySessionToken,
} = require('./pdf-authenticity-helper');

function json(statusCode, headers, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function getServiceDb() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function clientIp(event) {
  const h = event.headers || {};
  return (
    (h['x-forwarded-for'] || '').split(',')[0].trim() ||
    h['x-real-ip'] ||
    'unknown'
  );
}

exports.handler = async (event) => {
  const corsHeaders = getCorsHeaders(event.headers.origin || event.headers.Origin);
  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  const db = getServiceDb();
  if (!db) return json(500, headers, { error: 'Server misconfigured' });

  // ── Admin queue ───────────────────────────────────────────
  if (event.httpMethod === 'GET' || event.httpMethod === 'PATCH') {
    const admin = await authorizeAdminRequest(event);
    if (!admin.ok) return json(401, headers, { error: 'Unauthorized' });

    if (event.httpMethod === 'GET') {
      const status = String(event.queryStringParameters?.status || '').trim();
      let q = db
        .from('privacy_requests')
        .select(
          'id,request_type,status,brand,requester_name,requester_phone,requester_email,customer_id,details,admin_notes,sla_due_at,completed_at,created_at,updated_at'
        )
        .order('created_at', { ascending: false })
        .limit(100);
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) return json(500, headers, { error: 'Could not load requests' });
      return json(200, headers, { requests: data || [] });
    }

    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return json(400, headers, { error: 'Invalid JSON' });
    }
    const id = String(body.id || '').trim();
    if (!id) return json(400, headers, { error: 'id required' });
    const patch = {
      updated_at: new Date().toISOString(),
    };
    if (body.status) patch.status = String(body.status).trim();
    if (body.admin_notes != null) patch.admin_notes = String(body.admin_notes);
    if (body.customer_id != null) patch.customer_id = body.customer_id || null;
    if (patch.status === 'completed') patch.completed_at = new Date().toISOString();

    const { data, error } = await db
      .from('privacy_requests')
      .update(patch)
      .eq('id', id)
      .select('id,status,updated_at,completed_at')
      .maybeSingle();
    if (error) return json(500, headers, { error: 'Update failed' });

    await recordSecurityAudit(db, {
      eventType: 'privacy',
      action: 'privacy_request_update',
      result: 'ok',
      actorUserId: admin.userId,
      targetType: 'privacy_request',
      targetId: id,
      meta: { status: patch.status || null },
    });

    return json(200, headers, { request: data });
  }

  // ── Public submit ─────────────────────────────────────────
  if (event.httpMethod !== 'POST') {
    return json(405, headers, { error: 'Method not allowed' });
  }
  if (shouldRejectMissingOrigin(event)) {
    return json(403, headers, { error: 'Forbidden' });
  }

  const rl = checkRateLimit(event, {
    maxRequests: 8,
    windowMs: 60 * 60 * 1000,
    endpoint: 'privacy-request',
  });
  if (!rl.allowed) {
    return json(429, headers, { error: 'Too many requests. Try again later.' });
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, headers, { error: 'Invalid JSON' });
  }

  // Honeypot — bots fill hidden fields; humans leave blank.
  if (String(body.website || body.company_url || '').trim()) {
    return json(200, headers, {
      ok: true,
      id: null,
      message: 'Request received. We aim to respond within 72 hours.',
    });
  }

  const phoneDigits = String(body.phone || body.requester_phone || '').replace(/\D/g, '').slice(-10);
  const email = String(body.email || body.requester_email || '').trim();
  if (phoneDigits.length !== 10) {
    return json(400, headers, { error: 'Enter a valid 10-digit WhatsApp mobile number' });
  }

  // Same WhatsApp VERIFY session as /authenticity — proves they control the number.
  const sessionToken = String(body.sessionToken || body.session_token || '').trim();
  if (!sessionToken) {
    return json(403, headers, {
      error: 'Verify your WhatsApp number first (send VERIFY, then enter the 6-digit code)',
    });
  }
  const secret = await getSessionSecret(db);
  if (!secret) {
    return json(503, headers, { error: 'Verification unavailable. Try again later.' });
  }
  const session = verifySessionToken(sessionToken, secret);
  if (!session.ok) {
    return json(403, headers, {
      error: session.error === 'Session expired'
        ? 'WhatsApp verification expired. Send VERIFY again and re-enter the code.'
        : 'WhatsApp verification failed. Send VERIFY and enter the code again.',
    });
  }
  const sessionPhone = String(session.phone || '').replace(/\D/g, '').slice(-10);
  if (sessionPhone !== phoneDigits) {
    return json(403, headers, {
      error: 'Phone must match the WhatsApp number you verified',
    });
  }

  const { data: newId, error } = await db.rpc('submit_privacy_request', {
    p_request_type: body.requestType || body.request_type,
    p_brand: body.brand || 'hydrogenro',
    p_requester_name: body.name || body.requester_name || '',
    p_requester_phone: phoneDigits,
    p_requester_email: email || '',
    p_details: body.details || '',
  });

  if (error) {
    console.warn('[privacy-request] submit failed', error.message);
    return json(400, headers, { error: error.message || 'Could not submit request' });
  }

  await recordSecurityAudit(db, {
    eventType: 'privacy',
    action: 'privacy_request_submit',
    result: 'ok',
    targetType: 'privacy_request',
    targetId: String(newId),
    ip: clientIp(event),
    userAgent: event.headers?.['user-agent'] || '',
    meta: {
      type: body.requestType || body.request_type,
      brand: body.brand,
      phone_verified_whatsapp: true,
      phone_e164: normalizePhoneE164(phoneDigits),
    },
  });

  return json(200, headers, {
    ok: true,
    id: newId,
    message: 'Request received. We aim to respond within 72 hours.',
  });
};
