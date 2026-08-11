import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel } from '@/lib/service-brands';
import {
  brandLetterClosingLines,
} from '@/lib/whatsappBrandContact';

export type DocumentPdfWhatsAppKind =
  | 'service_bill'
  | 'quotation'
  | 'invoice'
  | 'amc'
  | 'amc_document'
  | 'warranty'
  | 'warranty_document'
  | 'receipt'
  | 'generic';

function docNoun(kind: DocumentPdfWhatsAppKind): string {
  switch (kind) {
    case 'quotation':
      return 'quotation';
    case 'service_bill':
      return 'service bill';
    case 'invoice':
      return 'tax invoice';
    case 'amc':
    case 'amc_document':
      return 'AMC agreement';
    case 'warranty':
    case 'warranty_document':
      return 'warranty card';
    case 'receipt':
      return 'payment receipt';
    default:
      return 'document';
  }
}

export interface DocumentPdfWhatsAppCaptionInput {
  kind: DocumentPdfWhatsAppKind | string;
  brand: DocumentBrand;
  customerName?: string | null;
  documentRef?: string | null;
  amount?: number | null;
  /** Bill date, invoice date, or quotation valid-until */
  dateIso?: string | null;
  paymentStatus?: string | null;
}

/**
 * WhatsApp caption for PDF sends (24h free-form document message).
 * Matches cold PDF template wording + contact footer + Chat us link.
 */
export function buildDocumentPdfWhatsAppCaption(input: DocumentPdfWhatsAppCaptionInput): string {
  const brandName = getDocumentBrandLabel(input.brand);
  const customerName = String(input.customerName || '').trim() || 'Customer';
  const kind = String(input.kind || 'generic').toLowerCase() as DocumentPdfWhatsAppKind;

  const lines = [
    `Hi ${customerName}, 👋`,
    `📄 Your ${docNoun(kind)} from ${brandName} is attached.`,
    '',
    ...brandLetterClosingLines(input.brand, { skipChatHint: true, includeTextUs: false }),
    '',
    '💬 Reply on this chat if you need any help.',
  ];

  return lines.join('\n').slice(0, 1024);
}

/** Cold Meta template body preview (svc_doc_*_{ero|hro}_v3 / svc_doc_direct_* — no Accept). */
export function formatDocumentPdfColdPreview(
  kind: DocumentPdfWhatsAppKind | string,
  brand: DocumentBrand,
  customerName: string
): string {
  const brandName = getDocumentBrandLabel(brand);
  const name = String(customerName || 'Customer').trim() || 'Customer';
  const k = String(kind || 'generic').toLowerCase() as DocumentPdfWhatsAppKind;
  const footer = brandLetterClosingLines(brand, {
    skipChatHint: true,
    includeTextUs: false,
  }).join('\n');
  return [
    `Hi ${name}, 👋`,
    `📄 Your ${docNoun(k)} from ${brandName} is attached.`,
    '',
    '💬 Reply on this chat if you need any help.',
    '',
    footer,
    '',
    'Buttons: Call us · Website',
  ].join('\n');
}
