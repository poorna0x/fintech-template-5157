/** Staff-facing WhatsApp delivery errors. Keep in sync with src/lib/whatsappDeliveryError.ts */

const NOT_ON_WHATSAPP_RE =
  /undeliverable|131026|not on WhatsApp|not a whatsapp user|recipient is not a valid whatsapp/i;

function last10Digits(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
}

function isNotOnWhatsAppError(raw, code) {
  const msg = String(raw || '');
  const c = String(code || '');
  return NOT_ON_WHATSAPP_RE.test(msg) || c === '131026';
}

function friendlyWhatsAppDeliveryError(raw, phone, code) {
  const msg = String(raw || '').trim();
  if (msg && !isNotOnWhatsAppError(msg, code)) return msg;
  if (/not on WhatsApp/i.test(msg)) return msg;
  const digits = last10Digits(phone);
  return digits
    ? `${digits} is not on WhatsApp (or blocked this business)`
    : 'This number is not on WhatsApp (or blocked this business)';
}

module.exports = {
  isNotOnWhatsAppError,
  friendlyWhatsAppDeliveryError,
};
