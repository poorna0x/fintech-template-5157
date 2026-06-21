import type { DocumentBrand } from '@/lib/service-brands';

export const TECHNICIAN_ID_CARD_BRANDS: DocumentBrand[] = ['hydrogenro', 'elevenro'];

const TECHNICIAN_ID_CARD_ORIGINS: Record<DocumentBrand, string> = {
  hydrogenro: 'https://hydrogenro.com',
  elevenro: 'https://elevenro.com',
};

function isLocalDevHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

/** Public technician ID card URL for a brand (hydrogenro.com vs elevenro.com). */
export function getTechnicianIdCardUrl(technicianId: string, brand: DocumentBrand): string {
  const origin = isLocalDevHost()
    ? window.location.origin
    : TECHNICIAN_ID_CARD_ORIGINS[brand];

  const base = `${origin}/technician-id/${technicianId}`;
  return brand === 'elevenro' ? `${base}?brand=elevenro` : base;
}

/** Show the technician's login email with the brand domain on the public ID card. */
export function getTechnicianIdCardDisplayEmail(
  email: string | null | undefined,
  brand: DocumentBrand
): string {
  const trimmed = (email ?? '').trim();
  if (!trimmed) return '';
  if (brand === 'elevenro') {
    return trimmed.replace(/@hydrogenro\.com$/i, '@elevenro.com');
  }
  return trimmed.replace(/@elevenro\.com$/i, '@hydrogenro.com');
}
