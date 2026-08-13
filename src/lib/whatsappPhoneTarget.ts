/** Pick which customer phone to use for WhatsApp sends. */
export type WhatsAppPhoneTarget = 'primary' | 'alternate' | 'custom';

export function normalizePhoneDigits(raw: string): string {
  return String(raw || '').replace(/\D/g, '');
}

/** Digits to try when matching `whatsapp_messages.phone_e164` (10-digit vs 91…). */
export function whatsappPhoneLookupKeys(raw: string): string[] {
  const digits = normalizePhoneDigits(raw);
  if (digits.length < 10) return [];
  const last10 = digits.slice(-10);
  return [...new Set([digits, last10, `91${last10}`])];
}

export function resolveWhatsAppPhone(opts: {
  primaryPhone?: string | null;
  alternatePhone?: string | null;
  target: WhatsAppPhoneTarget;
  customPhone?: string;
}): { phone: string; error?: string } {
  const primary = normalizePhoneDigits(opts.primaryPhone || '');
  const alternate = normalizePhoneDigits(opts.alternatePhone || '');
  const custom = normalizePhoneDigits(opts.customPhone || '');

  if (opts.target === 'custom') {
    if (custom.length < 10) {
      return { phone: '', error: 'Enter a valid phone number (10+ digits)' };
    }
    return { phone: custom };
  }
  if (opts.target === 'alternate') {
    if (alternate.length < 10) {
      return { phone: '', error: 'No alternate phone on file' };
    }
    return { phone: alternate };
  }
  if (primary.length < 10) {
    return { phone: '', error: 'No primary phone on file' };
  }
  return { phone: primary };
}

export function phoneTargetLabel(target: WhatsAppPhoneTarget, phone: string): string {
  const suffix = phone ? ` · …${phone.slice(-4)}` : '';
  if (target === 'alternate') return `Alternate${suffix}`;
  if (target === 'custom') return `Custom${suffix}`;
  return `Primary${suffix}`;
}

export function isValidWhatsAppPhone(raw: string): boolean {
  const digits = normalizePhoneDigits(raw);
  return digits.length >= 10 && digits.length <= 15;
}

/** Unique destinations by last 10 digits (keeps first original string). */
export function uniqueWhatsAppPhones(raws: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of raws) {
    const value = String(raw || '').trim();
    if (!isValidWhatsAppPhone(value)) continue;
    const key = normalizePhoneDigits(value).slice(-10);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export function customerIdForWhatsAppDest(
  to: string,
  customerPhone?: string | null,
  customerId?: string | null
): string | null {
  const dest = normalizePhoneDigits(to).slice(-10);
  const onFile = normalizePhoneDigits(customerPhone || '').slice(-10);
  if (!dest || !onFile || dest !== onFile) return null;
  return customerId || null;
}

/** Primary required; extra optional. Dedupes by last 10 digits. */
export function resolveWhatsAppDestinations(
  primary: string,
  extra?: string | null
): { destinations: string[]; error?: string } {
  const primaryTrim = String(primary || '').trim();
  if (!isValidWhatsAppPhone(primaryTrim)) {
    return { destinations: [], error: 'Enter a valid customer phone number' };
  }
  const extraTrim = String(extra || '').trim();
  if (extraTrim && !isValidWhatsAppPhone(extraTrim)) {
    return { destinations: [], error: 'Enter a valid extra WhatsApp number, or leave it blank' };
  }
  return { destinations: uniqueWhatsAppPhones([primaryTrim, extraTrim]) };
}
