/**
 * Safe display name for WhatsApp "Hi …" copy / template {{1}}.
 * Never use a phone number as the greeting name.
 */
export function whatsappGreetingName(
  raw?: string | null,
  fallback = 'there'
): string {
  const s = String(raw ?? '').trim();
  if (!s) return fallback;

  const compact = s.replace(/[\s\-().]/g, '');
  const digits = s.replace(/\D/g, '');

  // Mostly digits (with optional +) → phone, not a person name
  if (digits.length >= 8) {
    const nonDigitCompact = compact.replace(/\D/g, '').length;
    if (nonDigitCompact === digits.length || /^\+?\d+$/.test(compact)) {
      return fallback;
    }
    // "+91 93394 47333" / "9339447333"
    if (/^\+?\d[\d\s\-()]{6,}\d$/.test(s) && digits.length / s.length >= 0.55) {
      return fallback;
    }
  }

  return s;
}
