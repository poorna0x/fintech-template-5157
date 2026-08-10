/**
 * Unsolicited inbound media (photo / video / file / audio):
 * - If we recently asked for media → allow (no auto-reply)
 * - Otherwise → redirect to Eleven RO main line with Call + WhatsApp buttons
 *
 * Mark an ask by including AWAITING_CUSTOMER_MEDIA_MARKER in the outbound body
 * (or natural “please send a photo…” wording).
 */
const {
  callWhatsAppApi,
  insertWhatsAppMessage,
  normalizePhoneE164,
} = require('./whatsapp-helper');
const {
  ELEVEN_SUPPORT_DISPLAY,
  ELEVEN_SUPPORT_WA_ME,
  sendElevenSupportButtons,
} = require('./whatsapp-eleven-support');

/** Include this in outbound text when CRM/bot is expecting a customer upload. */
const AWAITING_CUSTOMER_MEDIA_MARKER = '[Awaiting customer media]';

const UNSOLICITED_REDIRECT_MARKER = '[Unsolicited media redirect]';

const ELEVEN_SUPPORT_WA_DISPLAY = ELEVEN_SUPPORT_DISPLAY;

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
    'This number is for booking and service updates only — not for sending photos or files.',
    '',
    'Please message our Eleven RO team on WhatsApp at *+91 98806 93311* for photos, bills, or support.',
    '',
    'Tap *Call 3311* to call, or *WhatsApp team* to open chat with +91 98806 93311.',
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
  const sent = await sendElevenSupportButtons({
    phoneNumberId,
    accessToken,
    db,
    to: phone,
    bodyText: text,
    footer: 'Eleven RO',
  });

  await insertWhatsAppMessage(db, {
    direction: 'outbound',
    phone_e164: phone,
    msg_type: 'text',
    body: `${UNSOLICITED_REDIRECT_MARKER}\n${text}`,
    status: sent.ok ? 'sent' : 'failed',
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
