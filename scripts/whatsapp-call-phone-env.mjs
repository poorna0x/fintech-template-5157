/**
 * Brand Call-us numbers for Meta WhatsApp template PHONE_NUMBER buttons.
 * Eleven RO: 9880693311 · Hydrogen RO: 8884944288
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

export function loadEnvLocal() {
  const p = resolve(ROOT, '.env.local');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

function normalizeE164(raw, fallback) {
  const digits = String(raw || fallback || '')
    .replace(/\D/g, '')
    .replace(/^0+/, '');
  if (!digits) return fallback;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return raw.startsWith('+') ? raw : `+${digits}`;
}

/** @returns {{ eleven: string, hydrogen: string }} */
export function resolveWhatsAppCallPhones() {
  const elevenRaw =
    process.env.WHATSAPP_CALL_PHONE_ELEVENRO ||
    process.env.WHATSAPP_CALL_PHONE ||
    '+919880693311';
  const hydrogenRaw =
    process.env.WHATSAPP_CALL_PHONE_HYDROGENRO ||
    process.env.WHATSAPP_BOOKING_CALL_PHONE ||
    '+918884944288';
  return {
    eleven: normalizeE164(elevenRaw, '+919880693311'),
    hydrogen: normalizeE164(hydrogenRaw, '+918884944288'),
  };
}

/** Pick Call-us E.164 from template name (`*_ero*` / `*_hro*`) or brand label. */
export function callPhoneForTemplate(templateName, brandLabel) {
  const { eleven, hydrogen } = resolveWhatsAppCallPhones();
  const name = String(templateName || '').toLowerCase();
  // Match _hro / _ero as a brand segment (…_hro, …_hro_v2, …_hro_cta, …).
  if (/_hro(?:_|$)/.test(name)) return hydrogen;
  if (/_ero(?:_|$)/.test(name)) return eleven;
  const brand = String(brandLabel || '').toLowerCase();
  if (brand.includes('hydrogen')) return hydrogen;
  if (brand.includes('eleven')) return eleven;
  return eleven;
}
