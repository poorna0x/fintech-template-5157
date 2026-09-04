import { extractMapsUrlFromText, sanitizeGoogleMapsInput } from '@/lib/googleMapsLink';

/** Auto-fill Add Customer only from copies this fresh (mobile primary). */
export const ADD_CUSTOMER_AUTO_CLIP_MAX_AGE_MS = 15_000;

export type ParsedCustomerClipboard = {
  phone: string;
  email: string;
  mapsUrl: string;
};

export type AutofilledCustomerFields = {
  phone?: boolean;
  email?: boolean;
  maps?: boolean;
  address?: boolean;
  visible_address?: boolean;
};

function extractIndianMobileFromText(text: string): string {
  const withoutUrls = text.replace(/https?:\/\/\S+/gi, ' ');
  const spaced = withoutUrls.match(/(?:\+?91[\s-]*)?[6-9]\d(?:[\s-.]?\d){8}\b/);
  if (spaced) {
    const digits = spaced[0].replace(/\D/g, '');
    const match = digits.match(/(?:91|0)?([6-9]\d{9})$/) || digits.match(/([6-9]\d{9})/);
    if (match?.[1]) return match[1].slice(-10);
  }
  const digits = withoutUrls.replace(/\D/g, '');
  const match = digits.match(/(?:91|0)?([6-9]\d{9})/);
  return match?.[1] ?? '';
}

function extractEmailFromText(text: string): string {
  const withoutUrls = text.replace(/https?:\/\/\S+/gi, ' ');
  const match = withoutUrls.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  const email = (match?.[0] || '').toLowerCase();
  if (!email) return '';
  if (/\.(png|jpe?g|gif|webp|svg)(\s|$)/i.test(email)) return '';
  return email;
}

/** Phone, email, or Maps only — name is typed manually. */
export function parseCustomerClipboardText(text: string): ParsedCustomerClipboard {
  const cleaned = sanitizeGoogleMapsInput(text);
  if (!cleaned) return { phone: '', email: '', mapsUrl: '' };

  const mapsUrl = extractMapsUrlFromText(cleaned) || '';
  let remainder = cleaned;
  if (mapsUrl) remainder = remainder.split(mapsUrl).join(' ');
  remainder = remainder.replace(/https?:\/\/\S+/gi, ' ');

  const phone = extractIndianMobileFromText(remainder);
  const email = extractEmailFromText(remainder);

  return { phone, email, mapsUrl };
}

export function clipboardFingerprint(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return `${t.length}:${t.slice(0, 120)}:${t.slice(-80)}`;
}

export function isFreshClipboardTimestamp(
  copiedAtMs: number | null | undefined,
  maxAgeMs: number = ADD_CUSTOMER_AUTO_CLIP_MAX_AGE_MS
): boolean {
  if (!copiedAtMs || copiedAtMs <= 0) return false;
  const age = Date.now() - copiedAtMs;
  if (age < 0) return false;
  return age <= maxAgeMs;
}

export function describeParsedCustomerClipboard(parsed: ParsedCustomerClipboard): string {
  const parts: string[] = [];
  if (parsed.phone) parts.push('phone');
  if (parsed.email) parts.push('email');
  if (parsed.mapsUrl) parts.push('Maps link');
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  const last = parts.pop() as string;
  return `${parts.join(', ')} and ${last}`;
}
