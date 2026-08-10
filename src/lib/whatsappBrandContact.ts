import type { DocumentBrand } from '@/lib/service-brands';
import { getCompanyInfoForBrand, getDocumentBrandLabel } from '@/lib/service-brands';
import { waBrandWebsiteUrl, waLabeledLink, waLabeledValue } from '@/lib/whatsappMessageFormat';

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

/** Shared letter footer for 24h free-form messages (matches Meta letter templates). */
export function brandLetterFooterLines(
  brand: DocumentBrand,
  opts?: { includeReview?: boolean }
): string[] {
  const c = brandContactLines(brand);
  const lines = [
    `Thank you for choosing ${c.brandLabel}.`,
    waLabeledValue('📞', 'Call (main)', c.voice.display),
    waLabeledValue('📧', 'Email', c.email),
    waLabeledLink('🌐', 'Website', c.website),
  ];
  if (opts?.includeReview) {
    lines.push(waLabeledLink('⭐', 'Leave a review', c.reviewUrl));
  }
  lines.push('', 'You can also reply on this WhatsApp chat anytime.');
  return lines;
}
