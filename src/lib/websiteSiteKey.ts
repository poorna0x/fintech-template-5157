export type PublicSiteKey = 'hydrogenro' | 'elevenro';

/** Which public marketing site the visitor is on (hydrogenro.com vs elevenro.com). */
export function getPublicSiteKey(): PublicSiteKey {
  if (typeof window === 'undefined') return 'hydrogenro';
  const host = window.location.hostname.toLowerCase();
  if (host.includes('elevenro.com')) return 'elevenro';
  return 'hydrogenro';
}

export function getPublicSiteLabel(siteKey: PublicSiteKey): string {
  return siteKey === 'elevenro' ? 'Eleven RO' : 'Hydrogen RO';
}
