/**
 * WhatsApp inbound: exact keyword VERIFY → issue hashed OTP reply.
 * Soft-fail; never log plaintext OTP. Call before booking bot.
 */
const {
  getServiceSupabase,
  getSessionSecret,
  normalizePhoneE164,
  generateOtpDigits,
  hashOtp,
  OTP_TTL_MS,
} = require('./pdf-authenticity-helper');
const {
  callWhatsAppApi,
  insertWhatsAppMessage,
  extractInboundBody,
  normalizePhoneE164: waNormalize,
} = require('./whatsapp-helper');
const { checkRateLimitForKey } = require('./rate-limiter');

const VERIFY_RE = /^\s*VERIFY\s*$/i;

function isVerifyKeyword(body) {
  return VERIFY_RE.test(String(body || ''));
}

async function sendOtpText({ phoneNumberId, accessToken, db, to, text }) {
  const phone = waNormalize(to);
  if (!phone || !text) return { ok: false };
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'text',
    text: { preview_url: false, body: String(text).slice(0, 4096) },
  };
  const result = await callWhatsAppApi(phoneNumberId, accessToken, payload);
  const waId =
    result.data?.messages?.[0]?.id || result.data?.messages?.[0]?.message_id || null;
  // Persist a redacted body — never store plaintext OTP in the inbox.
  await insertWhatsAppMessage(db, {
    wa_message_id: waId,
    direction: 'outbound',
    phone_e164: phone,
    msg_type: 'text',
    body: 'Your authenticity verification code was sent. Valid 5 minutes.',
    status: result.ok ? 'sent' : 'failed',
    error_message: result.ok ? null : result.data?.error?.message || 'send failed',
  });
  return { ok: result.ok };
}

/**
 * @returns {{ handled: boolean }}
 */
async function handlePdfAuthenticityOtpInbound({
  db,
  accessToken,
  phoneNumberId,
  msg,
}) {
  try {
    if (!msg || String(msg.type || '') !== 'text') return { handled: false };
    const body = extractInboundBody(msg);
    if (!isVerifyKeyword(body)) return { handled: false };

    const phone = normalizePhoneE164(msg.from);
    if (!phone) return { handled: true };

    if (!accessToken || !phoneNumberId) {
      console.warn('[pdf-auth-otp] missing WhatsApp credentials');
      return { handled: true };
    }

    const supabase = db || getServiceSupabase();
    if (!supabase) {
      console.warn('[pdf-auth-otp] no service supabase');
      return { handled: true };
    }

    // 1 send / 60s per phone
    const cool = checkRateLimitForKey(phone, {
      maxRequests: 1,
      windowMs: 60_000,
      endpoint: 'pdf-auth-otp-send-cooldown',
    });
    if (!cool.allowed) {
      await sendOtpText({
        phoneNumberId,
        accessToken,
        db: supabase,
        to: phone,
        text: 'Please wait about a minute before requesting another authenticity code.',
      });
      return { handled: true };
    }

    // 5 sends / hour per phone
    const hourly = checkRateLimitForKey(phone, {
      maxRequests: 5,
      windowMs: 60 * 60 * 1000,
      endpoint: 'pdf-auth-otp-send-hourly',
    });
    if (!hourly.allowed) {
      await sendOtpText({
        phoneNumberId,
        accessToken,
        db: supabase,
        to: phone,
        text: 'Too many authenticity code requests. Try again later.',
      });
      return { handled: true };
    }

    const secret = await getSessionSecret(supabase);
    if (!secret) {
      console.error('[pdf-auth-otp] PDF_AUTH_SESSION_SECRET / app_secrets missing');
      await sendOtpText({
        phoneNumberId,
        accessToken,
        db: supabase,
        to: phone,
        text: 'Authenticity verification is temporarily unavailable. Please try again later.',
      });
      return { handled: true };
    }

    const otp = generateOtpDigits();
    const otpHash = hashOtp(phone, otp, secret);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

    const { error: insertErr } = await supabase.from('pdf_authenticity_otp').insert({
      phone_e164: phone,
      otp_hash: otpHash,
      expires_at: expiresAt,
      attempts: 0,
      consumed_at: null,
    });
    if (insertErr) {
      console.error('[pdf-auth-otp] insert failed', insertErr.message);
      return { handled: true };
    }

    const reply =
      `Your authenticity code is ${otp}. ` +
      `Valid 5 minutes. Enter it on the authenticity page with this WhatsApp number.`;

    await sendOtpText({
      phoneNumberId,
      accessToken,
      db: supabase,
      to: phone,
      text: reply,
    });

    console.log('[pdf-auth-otp] OTP sent', { phone: phone.slice(0, 4) + '****' + phone.slice(-2) });
    return { handled: true };
  } catch (err) {
    console.warn('[pdf-auth-otp] handler error', err?.message || err);
    return { handled: true };
  }
}

module.exports = {
  handlePdfAuthenticityOtpInbound,
  isVerifyKeyword,
};
