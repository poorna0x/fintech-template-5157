/**
 * Safe display name for WhatsApp "Hi …" copy / template {{1}}.
 * Never use a phone number as the greeting name.
 */
function whatsappGreetingName(raw, fallback = 'there') {
  const s = String(raw ?? '').trim();
  if (!s) return fallback;

  const compact = s.replace(/[\s\-().]/g, '');
  const digits = s.replace(/\D/g, '');

  if (digits.length >= 8) {
    if (/^\+?\d+$/.test(compact)) return fallback;
    if (/^\+?\d[\d\s\-()]{6,}\d$/.test(s) && digits.length / s.length >= 0.55) {
      return fallback;
    }
  }

  return s;
}

module.exports = { whatsappGreetingName };
