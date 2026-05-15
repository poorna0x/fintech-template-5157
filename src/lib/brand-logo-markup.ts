import { DocumentBrand, getDocumentBrandLabel } from './service-brands';

/** Same asset as Hydrogen — icon is the left portion of this wide logo */
export const BRAND_FULL_LOGO_SRC = '/fulllogo.webp';

export function getBrandWordmarkParts(brand: DocumentBrand): { primary: string; accent: string } {
  if (brand === 'elevenro') {
    return { primary: 'Eleven ', accent: 'RO' };
  }
  return { primary: 'Hydrogen ', accent: 'RO' };
}

/**
 * Hydrogen: full logo image. Eleven: same horizontal layout (icon + wordmark on one line) as fulllogo.webp.
 */
export function renderBrandLogoHtml(brand: DocumentBrand): string {
  if (brand === 'hydrogenro') {
    return `<img src="${BRAND_FULL_LOGO_SRC}" alt="Hydrogen RO Logo" class="full-logo" />`;
  }

  const { primary, accent } = getBrandWordmarkParts(brand);

  return (
    '<div class="full-logo brand-wordmark" style="display: inline-flex; flex-direction: row; align-items: center; justify-content: center; gap: 10px; max-width: 200px; max-height: 60px; margin: 0 auto;">' +
    '<div class="brand-wordmark-icon" style="width: 52px; height: 52px; flex-shrink: 0; overflow: hidden; display: flex; align-items: center;">' +
    `<img src="${BRAND_FULL_LOGO_SRC}" alt="" style="height: 52px; width: auto; min-width: 160px; max-width: none; object-fit: cover; object-position: left center; display: block;" />` +
    '</div>' +
    `<span class="brand-wordmark-text" style="font-family: 'Poppins', sans-serif; font-size: 24px; font-weight: 700; line-height: 1; white-space: nowrap; color: #2d3748;">${primary}<span style="color: #0ea5e9;">${accent}</span></span>` +
    '</div>'
  );
}
