import type { DocumentBrand } from '@/lib/service-brands';
import { getCompanyInfoForBrand, getDocumentBrandLabel } from '@/lib/service-brands';
import { waBrandBookingUrl, waBrandWebsiteUrl, waLabeledLink } from '@/lib/whatsappMessageFormat';

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

/** Google Maps search — customer can open the listing and leave a review. */
export function brandReviewUrl(brand: DocumentBrand): string {
  if (brand === 'elevenro') {
    return 'https://www.google.com/maps/search/?api=1&query=Eleven+RO+Anjanapura+Bengaluru';
  }
  return 'https://www.google.com/maps/search/?api=1&query=Hydrogen+RO+Seshadripuram+Bengaluru';
}

export function brandContactLines(brand: DocumentBrand): {
  brandLabel: string;
  voice: ReturnType<typeof brandPrimaryVoicePhone>;
  website: string;
  email: string;
  reviewUrl: string;
} {
  return {
    brandLabel: getDocumentBrandLabel(brand),
    voice: brandPrimaryVoicePhone(brand),
    website: brandWebsiteUrl(brand),
    email: brandSupportEmail(brand),
    reviewUrl: brandReviewUrl(brand),
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

/** Meta letter cold template — v4 = Pay now for balance_due; v3 = Call us + Website; v2/v1 fallbacks. */
export function resolveBrandLetterTemplateName(
  kind: BrandLetterTemplateKind,
  brand: DocumentBrand,
  version: 'v4' | 'v3' | 'v2' | 'v1' = 'v3'
): string {
  const suffix = brand === 'elevenro' ? 'ero' : 'hro';
  const base = LETTER_TEMPLATE_BASE[kind];
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
  const v = String(value || '').trim();
  const l = String(label || '').trim();
  if (!v) return `${l}:`;
  return `${l}:\n${v}`;
}

/** Letter footer + optional Text us link (24h free-form; cold templates use Call us + Text us buttons). */
export function brandLetterClosingLines(
  brand: DocumentBrand,
  opts?: { includeReview?: boolean; includeTextUs?: boolean; skipChatHint?: boolean }
): string[] {
  const lines = brandLetterFooterLines(brand, {
    includeReview: opts?.includeReview,
    skipChatHint: opts?.skipChatHint ?? true,
  });
  if (opts?.includeTextUs !== false) {
    lines.push(letterLabelValue('Text us', brandWhatsAppChatUrl(brand)));
  }
  return lines;
}

/** Shared letter footer for 24h free-form messages (label / value on separate lines). */
export function brandLetterFooterLines(
  brand: DocumentBrand,
  opts?: { includeReview?: boolean; skipChatHint?: boolean }
): string[] {
  const c = brandContactLines(brand);
  const lines = [
    `Thank you for choosing ${c.brandLabel}.`,
    letterLabelValue('Call', c.voice.display),
    letterLabelValue('Email', c.email),
    letterLabelValue('Website', brandLetterWebsiteHost(brand)),
  ];
  if (opts?.includeReview) {
    lines.push(letterLabelValue('Review', c.reviewUrl));
  }
  if (!opts?.skipChatHint) {
    lines.push('', 'You can also reply on this WhatsApp chat anytime.');
  }
  return lines;
}
