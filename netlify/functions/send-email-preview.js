// Admin email composer send — same Hostinger SMTP as booking confirmations.
// Auth: logged-in admin Bearer JWT (preferred) or legacy EMAIL_PREVIEW_SECRET header.

const nodemailer = require('nodemailer');
const { validatePreviewEmailBody, getFixedFromAddress, getBrandMailMeta } = require('./email-guard');
const { prepareTrackedEmail } = require('./email-tracking');
const { authorizeAdminRequest, authorizeStaffAmcEmailRequest } = require('./admin-auth-guard');
const {
  checkRateLimit,
  checkRateLimitForKey,
  rateLimitResponseForKey,
} = require('./rate-limiter');

function jsonResponse(statusCode, headers, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
}

function corsHeaders(event) {
  const origin = event.headers.origin || event.headers.Origin || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Email-Preview-Secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

exports.handler = async (event) => {
  const cors = corsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, cors, { error: 'Method not allowed' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, cors, { error: 'Invalid JSON' });
  }

  const purpose = body.purpose;
  const auth =
    purpose === 'amc_agreement'
      ? await authorizeStaffAmcEmailRequest(event)
      : await authorizeAdminRequest(event);
  if (!auth.ok) {
    return jsonResponse(403, cors, { error: auth.error || 'Unauthorized' });
  }

  const ipLimit = checkRateLimit(event, {
    maxRequests: 30,
    windowMs: 60_000,
    endpoint: 'send-email-preview',
  });
  if (!ipLimit.allowed) {
    return jsonResponse(429, cors, {
      error: 'Too many email requests. Please try again shortly.',
      retryAfterMs: Math.max(0, ipLimit.resetTime - Date.now()),
    });
  }

  if (auth.userId) {
    const userLimit = checkRateLimitForKey(`send-email-preview-user:${auth.userId}`, {
      maxRequests: purpose === 'amc_agreement' ? 40 : 60,
      windowMs: 60 * 60 * 1000,
      endpoint: 'send-email-preview-user',
    });
    if (!userLimit.allowed) {
      return {
        ...rateLimitResponseForKey(userLimit),
        headers: { ...rateLimitResponseForKey(userLimit).headers, ...cors },
      };
    }
  } else if (auth.via === 'preview_secret') {
    const previewLimit = checkRateLimit(event, {
      maxRequests: 10,
      windowMs: 60_000,
      endpoint: 'send-email-preview-secret',
    });
    if (!previewLimit.allowed) {
      return jsonResponse(429, cors, { error: 'Too many email requests. Please try again shortly.' });
    }
  }

  const validated = validatePreviewEmailBody(body);
  if (!validated.ok) {
    return jsonResponse(400, cors, { error: validated.error });
  }

  const fromAddress = getFixedFromAddress();
  if (!fromAddress || !process.env.HOSTINGER_EMAIL_PASS) {
    return jsonResponse(500, cors, {
      error: 'Email configuration missing',
      configuration: 'missing',
    });
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.hostinger.com',
    port: 587,
    secure: false,
    auth: {
      user: fromAddress,
      pass: process.env.HOSTINGER_EMAIL_PASS,
    },
    tls: {},
  });

  const brandMeta = getBrandMailMeta(body.documentBrand);
  const nodemailerAttachments = (validated.attachments || []).map((att) => ({
    filename: att.filename,
    content: att.content,
    encoding: 'base64',
    contentType: att.contentType,
  }));

  try {
    const toField =
      typeof validated.to === 'string' && validated.to.includes(',')
        ? validated.to.split(',').map((addr) => addr.trim()).filter(Boolean)
        : validated.to;

    const tracked = await prepareTrackedEmail({
      html: validated.html,
      recipientEmail: validated.to,
      subject: validated.subject,
      purpose: body.purpose,
      templateType: body.templateType,
      documentBrand: body.documentBrand,
      jobId: body.jobId,
      customerId: body.customerId,
      sentByUserId: auth.userId || null,
    });

    const info = await transporter.sendMail({
      from: {
        name: brandMeta.fromName,
        address: fromAddress,
      },
      to: toField,
      subject: validated.subject,
      html: tracked.html,
      text: validated.text,
      replyTo: brandMeta.replyTo,
      attachments: nodemailerAttachments,
      headers: {
        'X-Mailer': `${brandMeta.mailer} Admin Email`,
        'X-Priority': '3',
      },
    });

    return jsonResponse(200, cors, {
      success: true,
      messageId: info.messageId,
      message: 'Email sent',
      attachmentCount: nodemailerAttachments.length,
    });
  } catch (error) {
    console.error('[send-email-preview] send failed', error && error.message);
    return jsonResponse(500, cors, { error: 'Failed to send email' });
  }
};
