/** Pick which customer phone to use for WhatsApp sends. */
export type WhatsAppPhoneTarget = 'primary' | 'alternate' | 'custom';

export function normalizePhoneDigits(raw: string): string {
  return String(raw || '').replace(/\D/g, '');
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
