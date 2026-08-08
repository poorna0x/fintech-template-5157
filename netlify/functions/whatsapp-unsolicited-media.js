/**
 * Unsolicited inbound media (photo / video / file / audio):
 * - If we recently asked for media → allow (no auto-reply)
 * - Otherwise → polite redirect to Eleven RO main WhatsApp 9880693311
 *
 * Mark an ask by including AWAITING_CUSTOMER_MEDIA_MARKER in the outbound body
 * (or natural “please send a photo…” wording).
 */
const {
  callWhatsAppApi,
  insertWhatsAppMessage,
  normalizePhoneE164,
} = require('./whatsapp-helper');

/** Include this in outbound text when CRM/bot is expecting a customer upload. */
const AWAITING_CUSTOMER_MEDIA_MARKER = '[Awaiting customer media]';

const UNSOLICITED_REDIRECT_MARKER = '[Unsolicited media redirect]';

/** Eleven RO main WhatsApp (personal/business line customers should message for files). */
const ELEVEN_SUPPORT_WA_DISPLAY = '9880693311';
const ELEVEN_SUPPORT_WA_E164 = '919880693311';
const ELEVEN_SUPPORT_WA_ME = `https://wa.me/${ELEVEN_SUPPORT_WA_E164}`;

const MEDIA_TYPES = new Set(['image', 'document', 'audio', 'video', 'sticker', 'voice']);

const ASK_MEDIA_RE =
  /please\s+(send|share|upload).{0,60}(photo|photos|image|picture|video|file|files|document|pdf|bill|receipt)|send\s+(a\s+|the\s+|us\s+)?(photo|photos|image|picture|video|file|document|pdf)|share\s+(a\s+|the\s+)?(photo|photos|image|picture|video|file)|upload\s+(a\s+|the\s+)?(photo|image|video|file|document)|awaiting customer media/i;

function isInboundMediaType(msgType) {
  return MEDIA_TYPES.has(String(msgType || '').toLowerCase());
}

function buildUnsolicitedMediaReply() {
  return [
    'Thanks for sharing this.',
    '',
    'This WhatsApp number is for booking and service updates only.',
    'For photos, videos, or files, please speak with our Eleven RO team on our main WhatsApp:',
    '',
    `📱 ${ELEVEN_SUPPORT_WA_DISPLAY}`,
    ELEVEN_SUPPORT_WA_ME,
    '',
    'Message them there and our team will help you right away.',
  ].join('\n');
}

async function recentlyAskedForMedia(db, phoneE164) {
  if (!db || !phoneE164) return false;
  try {
    const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const { data } = await db
      .from('whatsapp_messages')
      .select('body, created_at')
      .eq('phone_e164', phoneE164)
      .eq('direction', 'outbound')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(12);
    for (const row of data || []) {
      const body = String(row.body || '');
      if (body.includes(AWAITING_CUSTOMER_MEDIA_MARKER)) return true;
      if (ASK_MEDIA_RE.test(body)) return true;
    }
  } catch (err) {
    console.warn('[unsolicited-media] ask check failed', err?.message || err);
  }
  return false;
}

async function recentlySentRedirect(db, phoneE164) {
  if (!db || !phoneE164) return false;
  try {
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data } = await db
      .from('whatsapp_messages')
      .select('id')
      .eq('phone_e164', phoneE164)
      .eq('direction', 'outbound')
      .like('body', `${UNSOLICITED_REDIRECT_MARKER}%`)
      .gte('created_at', since)
      .limit(1)
      .maybeSingle();
    return Boolean(data?.id);
  } catch {
    return false;
  }
}

async function sendTextRedirect({ phoneNumberId, accessToken, db, to, text }) {
  const phone = normalizePhoneE164(to);
  if (!phone || !phoneNumberId || !accessToken || !text) return { ok: false };
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'text',
    text: { preview_url: true, body: String(text).slice(0, 4096) },
  };
  const result = await callWhatsAppApi(phoneNumberId, accessToken, payload);
  const waId =
    result.data?.messages?.[0]?.id || result.data?.messages?.[0]?.message_id || null;
  await insertWhatsAppMessage(db, {
    wa_message_id: waId,
    direction: 'outbound',
    phone_e164: phone,
    msg_type: 'text',
    body: `${UNSOLICITED_REDIRECT_MARKER}\n${text}`,
    status: result.ok ? 'sent' : 'failed',
    error_message: result.ok ? null : result.data?.error?.message || 'send failed',
  });
  return { ok: result.ok };
}

/**
 * @returns {{ handled: boolean, redirected?: boolean, reason?: string }}
 */
async function handleUnsolicitedInboundMedia({ db, accessToken, phoneNumberId, msg }) {
  const msgType = String(msg?.type || '');
  if (!isInboundMediaType(msgType)) {
    return { handled: false, reason: 'not_media' };
  }

  const phone = normalizePhoneE164(msg.from);
  if (!phone) return { handled: false, reason: 'no_phone' };

  const asked = await recentlyAskedForMedia(db, phone);
  if (asked) {
    return { handled: false, reason: 'media_was_requested' };
  }

  if (await recentlySentRedirect(db, phone)) {
    return { handled: true, redirected: false, reason: 'redirect_cooldown' };
  }

  if (!accessToken || !phoneNumberId) {
    return { handled: false, reason: 'no_credentials' };
  }

  const text = buildUnsolicitedMediaReply();
  const sent = await sendTextRedirect({
    phoneNumberId,
    accessToken,
    db,
    to: phone,
    text,
  });

  return {
    handled: true,
    redirected: Boolean(sent.ok),
    reason: sent.ok ? 'redirected' : 'send_failed',
  };
}

function stampAwaitingMediaIfAsking(text) {
  const t = String(text || '').trim();
  if (!t) return t;
  if (t.includes(AWAITING_CUSTOMER_MEDIA_MARKER)) return t;
  if (!ASK_MEDIA_RE.test(t)) return t;
  // Append for DB matching only (caller must not send this string to Meta as customer text).
  return `${t}\n${AWAITING_CUSTOMER_MEDIA_MARKER}`;
}

module.exports = {
  AWAITING_CUSTOMER_MEDIA_MARKER,
  UNSOLICITED_REDIRECT_MARKER,
  ELEVEN_SUPPORT_WA_DISPLAY,
  ELEVEN_SUPPORT_WA_ME,
  isInboundMediaType,
  handleUnsolicitedInboundMedia,
  buildUnsolicitedMediaReply,
  stampAwaitingMediaIfAsking,
};
