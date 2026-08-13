/**
 * Admin: preview PDF + WhatsApp I Accept button → original on Accept.
 */
const { getCorsHeaders, isOriginAllowed } = require('./cors-helper');
const { addSecurityHeaders } = require('./security-headers');
const { authorizeAdminRequest } = require('./admin-auth-guard');
const { checkRateLimit, checkRateLimitForKey } = require('./rate-limiter');
const { createAndSendAcceptInvite } = require('./document-accept-helper');

function json(statusCode, corsHeaders, payload) {
  return {
    statusCode,
    headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  };
}

exports.handler = async (event) => {
  const requestOrigin = event.headers.origin || event.headers.Origin;
  const corsHeaders = getCorsHeaders(requestOrigin);

  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers: addSecurityHeaders(corsHeaders), body: '' };
    }

    if (requestOrigin && !isOriginAllowed(requestOrigin)) {
      return json(403, { 'Content-Type': 'application/json' }, { error: 'Forbidden: Origin not allowed' });
    }

    if (event.httpMethod !== 'POST') {
      return json(405, corsHeaders, { error: 'Method not allowed' });
    }

    const auth = await authorizeAdminRequest(event);
    if (!auth.ok) {
      return json(401, corsHeaders, { error: auth.error || 'Unauthorized' });
    }

    const ipLimit = checkRateLimit(event, {
      maxRequests: 20,
      windowMs: 60_000,
      endpoint: 'document-accept-send-ip',
    });
    if (!ipLimit.allowed) {
      return {
        statusCode: 429,
        headers: addSecurityHeaders({
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil((ipLimit.resetTime - Date.now()) / 1000)),
        }),
        body: JSON.stringify({ error: 'Too many requests' }),
      };
    }

    const userLimit = checkRateLimitForKey(`document-accept-send-user:${auth.userId || 'admin'}`, {
      maxRequests: 30,
      windowMs: 60_000,
      endpoint: 'document-accept-send-user',
    });
    if (!userLimit.allowed) {
      return json(429, corsHeaders, { error: 'Too many accept sends — try again shortly' });
    }

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return json(400, corsHeaders, { error: 'Invalid JSON' });
    }

    const result = await createAndSendAcceptInvite({
      originalPdfBase64: body.originalPdfBase64 || body.pdfBase64,
      previewPdfBase64: body.previewPdfBase64,
      phoneE164: body.to || body.phoneE164 || body.phone,
      brand: body.brand,
      docType: body.docType || body.kind,
      documentLabel: body.documentLabel,
      documentRef: body.documentRef || body.ref,
      sourceKey: body.sourceKey,
      customerId: body.customerId,
      customerName: body.customerName,
      amountDisplay: body.amountDisplay ?? body.amount,
      filename: body.filename,
      verifyCode: body.verifyCode,
      previewVerifyCode: body.previewVerifyCode,
      summary: body.summary,
      ttlHours: body.ttlHours,
      createdBy: auth.userId,
      preferColdTemplate:
        body.preferColdTemplate === true ||
        body.prefer_cold_template === true ||
        body.forceCold === true,
    });

    if (!result.ok) {
      return json(400, corsHeaders, { error: result.error || 'Send failed', meta: result.meta });
    }

    return json(200, corsHeaders, {
      ok: true,
      inviteId: result.inviteId,
      expiresAt: result.expiresAt,
      waMessageId: result.waMessageId,
      via: result.via,
    });
  } catch (err) {
    console.error('[document-accept-send]', err);
    return json(500, corsHeaders, {
      error: err?.message || 'Internal server error',
    });
  }
};
