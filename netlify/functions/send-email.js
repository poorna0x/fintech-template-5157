// Netlify Function: booking confirmation emails only (ALTCHA-gated, fixed FROM).
const nodemailer = require('nodemailer');
const {
  preflightOrReject,
  rateLimitBooking,
  verifyAltcha,
  consumeLoginToken,
  normalizePhoneDigits,
  jsonResponse,
  getClientIdentifier,
} = require('./booking-guard');
const { enforceSendEmailRateLimits } = require('./rate-limiter');
const { validateBookingEmailBody, getFixedFromAddress } = require('./email-guard');

exports.handler = async (event) => {
  const pre = preflightOrReject(event);
  if (pre.handled) return pre.response;
  const corsHeaders = pre.corsHeaders;

  const earlyLimit = enforceSendEmailRateLimits(event);
  if (earlyLimit) {
    return { ...earlyLimit, headers: { ...earlyLimit.headers, ...corsHeaders } };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, corsHeaders, { error: 'Invalid JSON' });
  }

  const phoneNorm = normalizePhoneDigits(body.phone);
  const limited = rateLimitBooking(event, corsHeaders, phoneNorm || undefined, 'send-email');
  if (limited) return limited;

  const altcha = verifyAltcha(body, corsHeaders);
  if (!altcha.ok) return altcha.response;

  const validated = validateBookingEmailBody(body);
  if (!validated.ok) {
    console.warn('[send-email] rejected payload', {
      ip: getClientIdentifier(event),
      reason: validated.error,
    });
    return jsonResponse(400, corsHeaders, { error: validated.error });
  }

  const emailRateLimit = enforceSendEmailRateLimits(event, validated.to);
  if (emailRateLimit) {
    console.warn('[send-email] rate limited', { ip: getClientIdentifier(event) });
    return {
      ...emailRateLimit,
      headers: { ...emailRateLimit.headers, ...corsHeaders },
    };
  }

  const fromAddress = getFixedFromAddress();
  if (!fromAddress) {
    return jsonResponse(500, corsHeaders, {
      error: 'Email configuration missing',
      configuration: 'missing',
    });
  }

  if (!process.env.HOSTINGER_EMAIL_PASS) {
    return jsonResponse(500, corsHeaders, {
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

  const mailOptions = {
    from: {
      name: 'Hydrogen RO - Water Purifier Services',
      address: fromAddress,
    },
    to: validated.to,
    subject: validated.subject,
    html: validated.html,
    text: validated.text,
    replyTo: 'info@hydrogenro.com',
    headers: {
      'X-Mailer': 'Hydrogen RO Service',
      'X-Priority': '3',
      'X-MSMail-Priority': 'Normal',
      Importance: 'Normal',
      'X-Report-Abuse': 'Please report abuse to abuse@hydrogenro.com',
      'List-Unsubscribe': '<mailto:unsubscribe@hydrogenro.com>',
      Precedence: 'bulk',
    },
    messageId: `<${Date.now()}.${Math.random().toString(36).slice(2, 11)}@hydrogenro.com>`,
  };

  try {
    const info = await transporter.sendMail(mailOptions);

    if (altcha.tokenCheck?.consumeKey) {
      consumeLoginToken(altcha.tokenCheck.consumeKey, altcha.tokenCheck.exp);
    }

    return jsonResponse(200, corsHeaders, {
      success: true,
      messageId: info.messageId,
      message: 'Email sent successfully',
    });
  } catch (error) {
    console.error('[send-email] send failed', {
      ip: getClientIdentifier(event),
      message: error.message,
    });
    return jsonResponse(500, corsHeaders, { error: 'Failed to send email' });
  }
};
