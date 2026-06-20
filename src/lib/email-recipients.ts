import { isValidCustomerEmail } from '@/lib/customer-email';

const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function isValidEmailFormat(email: string): boolean {
  const trimmed = email.trim();
  if (!trimmed || trimmed.length > 254) return false;
  return EMAIL_RE.test(trimmed);
}

/** Split comma/semicolon/space separated paste into individual addresses. */
export function parseEmailListInput(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .flatMap((part) => part.split(/\s+/))
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Dedupe and keep only valid customer emails (excludes nomail placeholders). */
export function normalizeRecipientList(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    const trimmed = raw.trim();
    if (!isValidCustomerEmail(trimmed) && !isValidEmailFormat(trimmed)) continue;
    if (!isValidCustomerEmail(trimmed)) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export function recipientListSummary(emails: string[]): string {
  const n = emails.length;
  if (n === 0) return 'No recipients';
  if (n === 1) return emails[0];
  return `${emails[0]} + ${n - 1} more`;
}
