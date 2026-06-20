// Internal tool: send a booking confirmation preview email (no ALTCHA).
// Protected by EMAIL_PREVIEW_SECRET header — set in Netlify env + VITE_EMAIL_PREVIEW_SECRET locally.

const nodemailer = require('nodemailer');
const { validateBookingEmailBody, getFixedFromAddress, getBrandMailMeta } = require('./email-guard');

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
    'Access-Control-Allow-Headers': 'Content-Type, X-Email-Preview-Secret',
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

  const expectedSecret = String(process.env.EMAIL_PREVIEW_SECRET || '').trim();
  const providedSecret = String(
    event.headers['x-email-preview-secret'] ||
      event.headers['X-Email-Preview-Secret'] ||
      ''
  ).trim();

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return jsonResponse(403, cors, { error: 'Unauthorized' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, cors, { error: 'Invalid JSON' });
  }

  const validated = validateBookingEmailBody({ ...body, purpose: 'booking_confirmation' });
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

  try {
    const info = await transporter.sendMail({
      from: {
        name: brandMeta.fromName,
        address: fromAddress,
      },
      to: validated.to,
      subject: validated.subject,
      html: validated.html,
      text: validated.text,
      replyTo: brandMeta.replyTo,
      headers: {
        'X-Mailer': `${brandMeta.mailer} Email Preview`,
        'X-Priority': '3',
      },
    });

    return jsonResponse(200, cors, {
      success: true,
      messageId: info.messageId,
      message: 'Preview email sent',
    });
  } catch (error) {
    console.error('[send-email-preview] send failed', error && error.message);
    return jsonResponse(500, cors, { error: 'Failed to send email' });
  }
};
