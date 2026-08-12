/**
 * WhatsApp message formatting helpers (mobile-neat).
 * Links sit on the line under the label — same pattern as clear CTA broadcasts.
 */

/** Plain `Label:\nvalue` — wa.me prefills and letter footers (no emoji/bold). */
export function waPlainLabelValue(label: string, value: string): string {
  const v = String(value || '').trim();
  const l = String(label || '').trim();
  if (!v) return `${l}:`;
  return `${l}:\n${v}`;
}

/** `🌐 *Website*:\nhttps://…` — label + colon, URL on the next line. */
export function waLabeledLink(emoji: string, label: string, url: string): string {
  const u = String(url || '').trim();
  const l = String(label || '').trim() || 'Link';
  const e = String(emoji || '').trim();
  if (!u) return e ? `${e} *${l}*` : `*${l}*`;
  return e ? `${e} *${l}*:\n${u}` : `*${l}*:\n${u}`;
}

/** Short contact value on its own line (phone / email). */
export function waLabeledValue(emoji: string, label: string, value: string): string {
  const v = String(value || '').trim();
  const l = String(label || '').trim() || 'Contact';
  const e = String(emoji || '').trim();
  if (!v) return e ? `${e} *${l}*` : `*${l}*`;
  return e ? `${e} *${l}*:\n${v}` : `*${l}*:\n${v}`;
}

export function waBrandWebsiteUrl(website: string): string {
  const w = String(website || '').trim();
  if (!w) return '';
  return w.startsWith('http') ? w : `https://${w}`;
}

export function waBrandBookingUrl(website: string): string {
  const base = waBrandWebsiteUrl(website).replace(/\/$/, '');
  return base ? `${base}/book` : '';
}
