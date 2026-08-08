/**
 * Eleven RO main line contact actions (Call → dialer via contact card, WhatsApp → wa.me).
 * Number: 9880693311
 */
const {
  callWhatsAppApi,
  insertWhatsAppMessage,
  normalizePhoneE164,
} = require('./whatsapp-helper');

const ELEVEN_SUPPORT_DISPLAY = '9880693311';
const ELEVEN_SUPPORT_E164 = '919880693311';
const ELEVEN_SUPPORT_E164_PLUS = `+${ELEVEN_SUPPORT_E164}`;
const ELEVEN_SUPPORT_WA_ME = `https://wa.me/${ELEVEN_SUPPORT_E164}`;
const ELEVEN_SUPPORT_LABEL = 'Eleven RO';

const BTN_CALL = 'support_call';
const BTN_WHATSAPP = 'support_whatsapp';

function supportWaUrl(prefill) {
  const q = encodeURIComponent(String(prefill || '').trim());
  return q ? `${ELEVEN_SUPPORT_WA_ME}?text=${q}` : ELEVEN_SUPPORT_WA_ME;
}

async function persistOutbound(db, phone, waId, msgType, body, result) {
  if (!db) return;
  await insertWhatsAppMessage(db, {
    wa_message_id: waId,
    direction: 'outbound',
    phone_e164: phone,
    msg_type: msgType,
    body,
    status: result.ok ? 'sent' : 'failed',
    error_message: result.ok ? null : result.data?.error?.message || 'send failed',
    sent_by_user_id: null,
  });
}

/** Reply buttons: Call us | WhatsApp */
async function sendElevenSupportButtons({
  phoneNumberId,
  accessToken,
  db,
  to,
  bodyText,
  footer,
}) {
  const phone = normalizePhoneE164(to);
  if (!phone || !phoneNumberId || !accessToken) return { ok: false };

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: String(
          bodyText ||
            `Contact ${ELEVEN_SUPPORT_LABEL} on ${ELEVEN_SUPPORT_DISPLAY}:`
        ).slice(0, 1024),
      },
      ...(footer ? { footer: { text: String(footer).slice(0, 60) } } : {}),
      action: {
        buttons: [
          {
            type: 'reply',
            reply: { id: BTN_CALL, title: 'Call 3311' },
          },
          {
            type: 'reply',
            reply: { id: BTN_WHATSAPP, title: 'WhatsApp team' },
          },
        ],
      },
    },
  };

  const result = await callWhatsAppApi(phoneNumberId, accessToken, payload);
  const waId =
    result.data?.messages?.[0]?.id || result.data?.messages?.[0]?.message_id || null;
  await persistOutbound(
    db,
    phone,
    waId,
    'interactive',
    `${bodyText || ''} [Call 3311 | WhatsApp team]`,
    result
  );
  return { ok: result.ok, error: result.data?.error?.message };
}

/** Contact card — user taps Call to open the phone dialer. */
async function sendElevenSupportContactCard({ phoneNumberId, accessToken, db, to }) {
  const phone = normalizePhoneE164(to);
  if (!phone || !phoneNumberId || !accessToken) return { ok: false };

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'contacts',
    contacts: [
      {
        name: {
          formatted_name: ELEVEN_SUPPORT_LABEL,
          first_name: 'Eleven',
          last_name: 'RO',
        },
        org: { company: ELEVEN_SUPPORT_LABEL },
        phones: [
          {
            phone: ELEVEN_SUPPORT_E164_PLUS,
            type: 'WORK',
            wa_id: ELEVEN_SUPPORT_E164,
          },
        ],
      },
    ],
  };

  const result = await callWhatsAppApi(phoneNumberId, accessToken, payload);
  const waId =
    result.data?.messages?.[0]?.id || result.data?.messages?.[0]?.message_id || null;
  await persistOutbound(
    db,
    phone,
    waId,
    'contacts',
    `[Eleven RO contact] ${ELEVEN_SUPPORT_E164_PLUS}`,
    result
  );
  return { ok: result.ok };
}

/** CTA that opens WhatsApp chat (optional prefilled handoff text for admin). */
async function sendElevenSupportWhatsAppCta({
  phoneNumberId,
  accessToken,
  db,
  to,
  bodyText,
  prefill,
}) {
  const phone = normalizePhoneE164(to);
  if (!phone || !phoneNumberId || !accessToken) return { ok: false };
  const url = supportWaUrl(prefill);
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'interactive',
    interactive: {
      type: 'cta_url',
      body: {
        text: String(
          bodyText ||
            `Tap below to WhatsApp ${ELEVEN_SUPPORT_LABEL} (${ELEVEN_SUPPORT_DISPLAY}).`
        ).slice(0, 1024),
      },
      action: {
        name: 'cta_url',
        parameters: {
          display_text: 'Open WhatsApp',
          url,
        },
      },
    },
  };
  const result = await callWhatsAppApi(phoneNumberId, accessToken, payload);
  const waId =
    result.data?.messages?.[0]?.id || result.data?.messages?.[0]?.message_id || null;
  await persistOutbound(
    db,
    phone,
    waId,
    'interactive',
    `[CTA Open WhatsApp] ${url}`,
    result
  );
  return { ok: result.ok };
}

/**
 * Handle support_call / support_whatsapp button taps.
 * @returns {{ handled: boolean }}
 */
async function handleElevenSupportButton({
  id,
  phoneNumberId,
  accessToken,
  db,
  to,
  prefill,
}) {
  if (id === BTN_CALL) {
    await sendElevenSupportContactCard({ phoneNumberId, accessToken, db, to });
    // Follow-up: also push a tappable number line (WhatsApp often linkifies +91…)
    const phone = normalizePhoneE164(to);
    const text = [
      `Call ${ELEVEN_SUPPORT_LABEL}:`,
      ELEVEN_SUPPORT_E164_PLUS,
      '',
      'Tap the contact card above (or the number) to open your phone dialer.',
    ].join('\n');
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'text',
      text: { preview_url: false, body: text },
    };
    const result = await callWhatsAppApi(phoneNumberId, accessToken, payload);
    const waId =
      result.data?.messages?.[0]?.id || result.data?.messages?.[0]?.message_id || null;
    await persistOutbound(db, phone, waId, 'text', text, result);
    return { handled: true };
  }

  if (id === BTN_WHATSAPP) {
    await sendElevenSupportWhatsAppCta({
      phoneNumberId,
      accessToken,
      db,
      to,
      bodyText: `WhatsApp ${ELEVEN_SUPPORT_LABEL} team on ${ELEVEN_SUPPORT_DISPLAY}. Tap below to open the chat.`,
      prefill,
    });
    return { handled: true };
  }

  return { handled: false };
}

module.exports = {
  ELEVEN_SUPPORT_DISPLAY,
  ELEVEN_SUPPORT_E164,
  ELEVEN_SUPPORT_E164_PLUS,
  ELEVEN_SUPPORT_WA_ME,
  ELEVEN_SUPPORT_LABEL,
  BTN_CALL,
  BTN_WHATSAPP,
  supportWaUrl,
  sendElevenSupportButtons,
  sendElevenSupportContactCard,
  sendElevenSupportWhatsAppCta,
  handleElevenSupportButton,
};
