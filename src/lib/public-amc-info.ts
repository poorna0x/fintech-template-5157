import { generateAmcTerms } from '@/lib/amc-terms-generator';
import { getDefaultAgreementIntro } from '@/lib/service-brands';

/** Hydrogen RO public website AMC pricing (Bengaluru). */
export const PUBLIC_AMC_PLANS = [
  { years: 1, amountInr: 9000, label: '1 Year' },
  { years: 2, amountInr: 18000, label: '2 Years' },
  { years: 3, amountInr: 22000, label: '3 Years' },
] as const;

/** Routine AMC visit cadence shown on the public site. */
export const PUBLIC_AMC_SERVICE_PERIOD_MONTHS = 6;

export function formatPublicAmcInr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function getPublicAmcAgreementIntro(): string {
  return getDefaultAgreementIntro('hydrogenro').replace(/<\/?strong>/g, '');
}

export function getPublicAmcTermsText(includesPrefilter = false): string {
  return generateAmcTerms(includesPrefilter, '6', PUBLIC_AMC_SERVICE_PERIOD_MONTHS);
}

export const PUBLIC_AMC_ADVANTAGES = [
  'One fixed price — breakdowns, filters, membrane, electricals & motor covered',
  'No extra service charge when your RO breaks down during the AMC period',
  'Safe drinking water — TDS maintained between 50–150 (WHO guidelines or your preference)',
  'Fast response — breakdowns resolved within 24 hours on weekdays, 48 hours on weekends',
  'Routine preventive service every 6 months from your last visit',
  'Complete peace of mind — we take full responsibility for RO maintenance',
] as const;

export const PUBLIC_AMC_WHY_US = [
  'Certified and trained RO technicians across Bengaluru',
  'Same-day service and 24/7 emergency support',
  'Expert service for all major RO brands',
  'Transparent pricing with no hidden fees',
] as const;

export type PublicAmcTermsSections = {
  servicesCovered: string;
  termsAndConditions: string;
  notCovered: string;
};

export function parsePublicAmcTermsSections(terms: string): PublicAmcTermsSections {
  const servicesMatch = terms.match(
    /SERVICES COVERED BY THE AGREEMENT([\s\S]*?)(?=⚖️\s*TERMS AND CONDITIONS|Not Covered:|$)/i
  );
  const termsMatch = terms.match(/⚖️\s*TERMS AND CONDITIONS([\s\S]*?)(?=Not Covered:|$)/i);
  const notCoveredMatch = terms.match(/(?:Not Covered:|Exclusions:)([\s\S]*?)$/i);

  return {
    servicesCovered: servicesMatch?.[1]?.trim() ?? '',
    termsAndConditions: termsMatch?.[1]?.trim() ?? '',
    notCovered: notCoveredMatch?.[1]?.trim() ?? '',
  };
}

/** Turn AMC generator paragraph blocks into bullet lines for the public page. */
export function paragraphBlocksToBullets(block: string): string[] {
  if (!block.trim()) return [];
  return block
    .split(/\n\n+/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export function getPublicAmcCoveredBullets(includesPrefilter = false): string[] {
  const { servicesCovered } = parsePublicAmcTermsSections(getPublicAmcTermsText(includesPrefilter));
  return paragraphBlocksToBullets(servicesCovered);
}

export function getPublicAmcTermsBullets(includesPrefilter = false): string[] {
  const { termsAndConditions } = parsePublicAmcTermsSections(getPublicAmcTermsText(includesPrefilter));
  return paragraphBlocksToBullets(termsAndConditions);
}

/** Mirrors exclusions in `generateAmcTerms` plus physical damage for public marketing copy. */
export function getPublicAmcNotCoveredBullets(includesPrefilter = false): string[] {
  const bullets = [
    'Physical damage to the purifier (impact, drops, misuse, or similar)',
    'Purifier display or indicator lights',
    'Dispenser tap',
    'Outer housing or cabinet',
    'Storage tank',
  ];
  if (!includesPrefilter) {
    bullets.push('Pre-sediment filtration (unless expressly included in your agreement)');
  }
  return bullets;
}

export const PUBLIC_AMC_TAGLINE =
  'Full RO care for a fixed annual price — breakdowns, filters, membrane, electricals, and scheduled visits included.';
