/**
 * Follow-up iLovePDF compress when generate-pdf ran out of the 26s budget.
 * POST /.netlify/functions/ilovepdf-compress
 * Body: { pdfBase64, filename? }
 * Auth: admin or technician JWT (same as generate-pdf).
 */
const { getCorsHeaders, isOriginAllowed } = require('./cors-helper');
const { addSecurityHeaders } = require('./security-headers');
const { verifyStaffBearerToken } = require('./admin-auth-guard');
const { checkRateLimit, checkRateLimitForKey, getClientIdentifier } = require('./rate-limiter');
const { maybeCompressPdfBuffer } = require('./ilovepdf-compress-helper');
const { isPdfCompressionEnabled } = require('./pdf-compression-setting');

const MAX_PDF_BYTES = 8 * 1024 * 1024;

function jsonResponse(statusCode, corsHeaders, body) {
  return {
    statusCode,
    headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  };
}

function readBearerToken(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
}

function sanitizeFilename(raw) {
  const base = String(raw || 'document.pdf')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 180);
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

exports.handler = async (event) => {
  const requestOrigin = event.headers.origin || event.headers.Origin;
  const corsHeaders = getCorsHeaders(requestOrigin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: addSecurityHeaders(corsHeaders), body: '' };
  }
  if (requestOrigin && !isOriginAllowed(requestOrigin)) {
    return jsonResponse(403, corsHeaders, { error: 'Forbidden: Origin not allowed' });
  }
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, corsHeaders, { error: 'Method not allowed' });
  }

  const token = readBearerToken(event);
  const auth = await verifyStaffBearerToken(token);
  if (!auth.ok) {
    return jsonResponse(401, corsHeaders, { error: auth.error || 'Unauthorized' });
  }

  const clientId = getClientIdentifier(event);
  const rate = checkRateLimit(event, {
    maxRequests: 30,
    windowMs: 60_000,
    endpoint: 'ilovepdf-compress',
  });
  if (!rate.allowed) {
    return jsonResponse(429, corsHeaders, {
      error: 'Too many PDF compress requests. Please try again shortly.',
    });
  }
  const userLimit = checkRateLimitForKey(`ilovepdf-compress-user:${auth.userId}`, {
    maxRequests: 60,
    windowMs: 60 * 60 * 1000,
    endpoint: 'ilovepdf-compress-user',
  });
  if (!userLimit.allowed) {
    return jsonResponse(429, corsHeaders, { error: 'Too many PDF compress requests.' });
  }

  const enabled = await isPdfCompressionEnabled();
  if (!enabled) {
    return jsonResponse(200, corsHeaders, { compressed: false, skipReason: 'toggle_off' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, corsHeaders, { error: 'Invalid JSON body' });
  }

  const pdfBase64 = typeof body.pdfBase64 === 'string' ? body.pdfBase64.trim() : '';
  if (!pdfBase64) {
    return jsonResponse(400, corsHeaders, { error: 'Missing pdfBase64' });
  }

  let pdfBuffer;
  try {
    pdfBuffer = Buffer.from(pdfBase64, 'base64');
  } catch {
    return jsonResponse(400, corsHeaders, { error: 'Invalid PDF data' });
  }
  if (pdfBuffer.length < 4 || pdfBuffer.slice(0, 4).toString() !== '%PDF') {
    return jsonResponse(400, corsHeaders, { error: 'Not a PDF' });
  }
  if (pdfBuffer.length > MAX_PDF_BYTES) {
    return jsonResponse(413, corsHeaders, { error: 'PDF too large to compress' });
  }

  const filename = sanitizeFilename(body.filename);
  try {
    const result = await maybeCompressPdfBuffer(pdfBuffer, {
      filename,
      deadlineAt: Date.now() + 20_000,
    });
    return jsonResponse(200, corsHeaders, {
      pdfBase64: result.buffer.toString('base64'),
      filename,
      compressed: result.compressed === true,
      skipReason: result.skipReason || null,
      originalBytes: result.originalBytes,
      compressedBytes: result.compressedBytes,
    });
  } catch (error) {
    console.error('[ilovepdf-compress] failed', { clientId, userId: auth.userId, message: error.message });
    return jsonResponse(200, corsHeaders, {
      pdfBase64,
      filename,
      compressed: false,
      skipReason: 'failed',
    });
  }
};
