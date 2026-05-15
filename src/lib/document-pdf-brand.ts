import { CompanyInfo } from '@/types';
import { renderBrandLogoHtml } from './brand-logo-markup';
import {
  BRAND_SEAL_SRC,
  DocumentBrand,
  brandHasGst,
  getDocumentBrandLabel,
  resolveDocumentBrandFromData,
} from './service-brands';

const TAG = 'div';

export function resolvePdfDocumentBrand(data: {
  documentBrand?: unknown;
  serviceBrand?: unknown;
  company?: { email?: string; website?: string; name?: string };
}): DocumentBrand {
  return resolveDocumentBrandFromData(data);
}

export function renderPdfLogoHtml(brand: DocumentBrand): string {
  return renderBrandLogoHtml(brand);
}

export function renderPdfCompanyDetailsHtml(
  company: CompanyInfo,
  brand: DocumentBrand,
  options?: { hideGstInHeader?: boolean }
): string {
  const showGst =
    brandHasGst(brand) && !options?.hideGstInHeader && Boolean(company.gstNumber?.trim());
  const gstLine = showGst ? `<${TAG}>GST: ${company.gstNumber}</${TAG}>` : '';
  const panLine =
    brandHasGst(brand) && company.panNumber?.trim()
      ? `<${TAG}>PAN: ${company.panNumber}</${TAG}>`
      : '';
  const websiteLine = company.website ? `<${TAG}>Website: ${company.website}</${TAG}>` : '';

  return `
    <${TAG}>${company.address}, ${company.city} - ${company.pincode}</${TAG}>
    <${TAG}>Phone: ${company.phone} | Email: ${company.email}</${TAG}>
    ${gstLine}
    ${panLine}
    ${websiteLine}
  `;
}

export function renderPdfSignatureHtml(brand: DocumentBrand, billDate: string): string {
  const dateStr = new Date(billDate).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const sealLabel = getDocumentBrandLabel(brand);
  const seal = `<img src="${BRAND_SEAL_SRC[brand]}" alt="${sealLabel} Seal" class="signature-seal" />`;
  return `
    <${TAG} class="signatures">
      <${TAG} class="signature-box">
        <${TAG} class="signature-label" style="text-align: center;">Authorized Signatory</${TAG}>
        ${seal}
        <${TAG} class="signature-date" style="text-align: center;">Date: ${dateStr}</${TAG}>
      </${TAG}>
    </${TAG}>
  `;
}

export function renderPdfFooterHtml(brand: DocumentBrand, company: CompanyInfo): string {
  const label = getDocumentBrandLabel(brand);
  return `
    <${TAG} class="footer">
      <p>Thank you for choosing ${label}!</p>
      <p>For any queries, contact us at ${company.phone} or ${company.email}</p>
    </${TAG}>
  `;
}
