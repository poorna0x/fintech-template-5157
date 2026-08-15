import type { DocumentBrand } from '@/lib/service-brands';
import { getCompanyInfoForBrand, getDocumentBrandLabel } from '@/lib/service-brands';
import {
  waBrandBookingUrl,
  waBrandWebsiteUrl,
  waLabeledLink,
  waPlainLabelValue,
} from '@/lib/whatsappMessageFormat';

/**
 * Voice / website / review contacts for customer WhatsApp.
 * Call buttons use the *voice* main line — not the Cloud API WhatsApp number:
 * - Hydrogen RO: 8884944288
 * - Eleven RO: 9880693311 (…3311)
 */
export function brandPrimaryVoicePhone(brand: DocumentBrand): {
  display: string;
  e164: string;
  digits10: string;
} {
  if (brand === 'elevenro') {
    return { display: '9880693311', e164: '+919880693311', digits10: '9880693311' };
  }
  return { display: '8884944288', e164: '+918884944288', digits10: '8884944288' };
}

export function brandWebsiteUrl(brand: DocumentBrand): string {
  return waBrandWebsiteUrl(getCompanyInfoForBrand(brand).website);
}

export function brandSupportEmail(brand: DocumentBrand): string {
  return (
    getCompanyInfoForBrand(brand).email ||
    (brand === 'elevenro' ? 'mail@elevenro.com' : 'mail@hydrogenro.com')
  );
}

export function brandContactLines(brand: DocumentBrand): {
  brandLabel: string;
  voice: ReturnType<typeof brandPrimaryVoicePhone>;
  website: string;
  email: string;
} {
  return {
    brandLabel: getDocumentBrandLabel(brand),
    voice: brandPrimaryVoicePhone(brand),
    website: brandWebsiteUrl(brand),
    email: brandSupportEmail(brand),
  };
}

/** wa.me link for the brand voice / main WhatsApp line (Text us button). */
export function brandWhatsAppChatUrl(brand: DocumentBrand): string {
  const { e164 } = brandPrimaryVoicePhone(brand);
  return `https://wa.me/${e164.replace(/^\+/, '')}`;
}

/** Host only for letter footers (matches Meta template body: hydrogenro.com). */
export function brandLetterWebsiteHost(brand: DocumentBrand): string {
  return brandWebsiteUrl(brand).replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

export type BrandLetterTemplateKind =
  | 'job_done'
  | 'balance_due'
  | 'service_due'
  | 'booking_confirmed'
  | 'booking_cancelled';

const LETTER_TEMPLATE_BASE: Record<BrandLetterTemplateKind, string> = {
  job_done: 'svc_job_done_letter',
  balance_due: 'svc_balance_due_letter',
  service_due: 'svc_service_due_letter',
  booking_confirmed: 'svc_booking_confirmed_letter',
  booking_cancelled: 'svc_booking_cancelled_letter',
};

/** Meta letter cold template — v9 = Pay now, no contact footer; v8 = Call-only. */
export function resolveBrandLetterTemplateName(
  kind: BrandLetterTemplateKind,
  brand: DocumentBrand,
  version: 'v10' | 'v9' | 'v8' | 'v7' | 'v6' | 'v5' | 'v4' | 'v3' | 'v2' | 'v1' = 'v3'
): string {
  const suffix = brand === 'elevenro' ? 'ero' : 'hro';
  const base = LETTER_TEMPLATE_BASE[kind];
  if (version === 'v10') return `${base}_${suffix}_v10`;
  if (version === 'v9') return `${base}_${suffix}_v9`;
  if (version === 'v8') return `${base}_${suffix}_v8`;
  if (version === 'v7') return `${base}_${suffix}_v7`;
  if (version === 'v6') return `${base}_${suffix}_v6`;
  if (version === 'v5') return `${base}_${suffix}_v5`;
  if (version === 'v4') return `${base}_${suffix}_v4`;
  if (version === 'v3') return `${base}_${suffix}_v3`;
  if (version === 'v2') return `${base}_${suffix}_v2`;
  return `${base}_${suffix}`;
}

export function resolveBrandLetterTemplateFallbackName(
  kind: BrandLetterTemplateKind,
  brand: DocumentBrand
): string {
  return resolveBrandLetterTemplateName(kind, brand, 'v2');
}

/** Footer for existing-customer book invites — no Call line; Book CTA only. */
export function brandExistingCustomerBookLines(brand: DocumentBrand): string[] {
  const c = brandContactLines(brand);
  return [
    'Reply *BOOK* on this chat to pick date and time — we already have your details on file.',
    waLabeledLink('📅', 'Book online', waBrandBookingUrl(getCompanyInfoForBrand(brand).website)),
    '',
    `— ${c.brandLabel} Team`,
  ];
}

/** Label on one line, value on the next — 24h freeform + Meta letter template bodies. */
export function letterLabelValue(label: string, value: string): string {
  return waPlainLabelValue(label, value);
}

/** Letter footer + optional Text us link (24h free-form; cold templates use Call us + Text us buttons). */
export function brandLetterClosingLines(
  brand: DocumentBrand,
  opts?: {
    /** Public CRM /review/{token} URL — never Google Maps. */
    reviewUrl?: string | null;
    includeTextUs?: boolean;
    skipChatHint?: boolean;
    skipThankYou?: boolean;
    skipCall?: boolean;
    skipEmail?: boolean;
    skipWebsite?: boolean;
  }
): string[] {
  const lines = brandLetterFooterLines(brand, {
    reviewUrl: opts?.reviewUrl,
    skipChatHint: opts?.skipChatHint ?? true,
    skipThankYou: opts?.skipThankYou,
    skipCall: opts?.skipCall,
    skipEmail: opts?.skipEmail,
    skipWebsite: opts?.skipWebsite,
  });
  if (opts?.includeTextUs !== false) {
    lines.push(letterLabelValue('Text us', brandWhatsAppChatUrl(brand)));
  }
  return lines;
}

/** Shared letter footer for 24h free-form messages (label / value on separate lines). */
export function brandLetterFooterLines(
  brand: DocumentBrand,
  opts?: {
    /** Public CRM /review/{token} URL (elevenro.com or hydrogenro.com). */
    reviewUrl?: string | null;
    skipChatHint?: boolean;
    skipThankYou?: boolean;
    skipCall?: boolean;
    skipEmail?: boolean;
    skipWebsite?: boolean;
  }
): string[] {
  const c = brandContactLines(brand);
  const lines: string[] = [];
  if (!opts?.skipThankYou) {
    lines.push(`Thank you for choosing ${c.brandLabel}.`);
  }
  if (!opts?.skipCall) {
    lines.push(letterLabelValue('Call', c.voice.display));
  }
  if (!opts?.skipEmail) {
    lines.push(letterLabelValue('Email', c.email));
  }
  if (!opts?.skipWebsite) {
    lines.push(letterLabelValue('Website', brandLetterWebsiteHost(brand)));
  }
  const reviewUrl = String(opts?.reviewUrl || '').trim();
  if (reviewUrl) {
    lines.push(letterLabelValue('Review us', reviewUrl));
  }
  if (!opts?.skipChatHint) {
    lines.push('', 'You can also reply on this WhatsApp chat anytime.');
  }
  return lines;
}
