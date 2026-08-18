/**
 * Admin: email a watermarked preview + secure Accept link.
 * The original stays on private R2 and is emailed only after Accept.
 */
const { getCorsHeaders, isOriginAllowed } = require('./cors-helper');
const { addSecurityHeaders } = require('./security-headers');
const { authorizeAdminRequest } = require('./admin-auth-guard');
const { checkRateLimit, checkRateLimitForKey } = require('./rate-limiter');
const { createAndSendEmailAcceptInvite } = require('./document-accept-email-helper');

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
      return { statusCode: 204, headers: addSecurityHeaders(corsHeaders), body: '' };
    }
    if (requestOrigin && !isOriginAllowed(requestOrigin)) {
      return json(403, {}, { error: 'Forbidden: Origin not allowed' });
    }
    if (event.httpMethod !== 'POST') {
      return json(405, corsHeaders, { error: 'Method not allowed' });
    }

    const auth = await authorizeAdminRequest(event);
    if (!auth.ok) return json(401, corsHeaders, { error: auth.error || 'Unauthorized' });

    const ipLimit = checkRateLimit(event, {
      maxRequests: 15,
      windowMs: 60_000,
      endpoint: 'document-accept-email-send-ip',
    });
    if (!ipLimit.allowed) return json(429, corsHeaders, { error: 'Too many requests' });

    const userLimit = checkRateLimitForKey(
      `document-accept-email-send-user:${auth.userId || 'admin'}`,
      {
        maxRequests: 30,
        windowMs: 60 * 60_000,
        endpoint: 'document-accept-email-send-user',
      }
    );
    if (!userLimit.allowed) {
      return json(429, corsHeaders, { error: 'Too many Accept emails — try again later' });
    }

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return json(400, corsHeaders, { error: 'Invalid JSON' });
    }

    const result = await createAndSendEmailAcceptInvite({
      originalPdfBase64: body.originalPdfBase64 || body.pdfBase64,
      previewPdfBase64: body.previewPdfBase64,
      to: body.to || body.email,
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
    });

    if (!result.ok) {
      return json(400, corsHeaders, { error: result.error || 'Email Accept send failed' });
    }
    return json(200, corsHeaders, {
      ok: true,
      inviteId: result.inviteId,
      expiresAt: result.expiresAt,
      emailMessageId: result.emailMessageId,
    });
  } catch (error) {
    console.error('[document-accept-email-send]', error);
    return json(500, corsHeaders, { error: 'Internal server error' });
  }
};
