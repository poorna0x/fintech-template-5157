import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel } from '@/lib/service-brands';
import {
  brandLetterClosingLines,
  brandLetterFooterLines,
  brandWhatsAppChatUrl,
  letterLabelValue,
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

function attachedLine(kind: DocumentPdfWhatsAppKind): string {
  switch (kind) {
    case 'quotation':
      return 'Your quotation is attached.';
    case 'service_bill':
      return 'Your service bill is attached.';
    case 'invoice':
      return 'Your tax invoice is attached.';
    case 'amc':
    case 'amc_document':
      return 'Your AMC agreement is attached.';
    case 'warranty':
    case 'warranty_document':
      return 'Your warranty card is attached.';
    case 'receipt':
      return 'Your payment receipt is attached.';
    default:
      return 'Your document is attached.';
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
    `Hi ${customerName},`,
    attachedLine(kind),
    '',
    ...brandLetterClosingLines(input.brand, { includeTextUs: false }),
    letterLabelValue('Text us', brandWhatsAppChatUrl(input.brand)),
    '',
    'Reply on this chat if you need any help.',
    '',
    `— ${brandName}`,
  ];

  return lines.join('\n').slice(0, 1024);
}

/** Cold Meta template body preview (svc_doc_*_{ero|hro}_v2). */
export function formatDocumentPdfColdPreview(
  kind: DocumentPdfWhatsAppKind | string,
  brand: DocumentBrand,
  customerName: string
): string {
  const name = String(customerName || 'Customer').trim() || 'Customer';
  const k = String(kind || 'generic').toLowerCase() as DocumentPdfWhatsAppKind;
  const footer = brandLetterFooterLines(brand, { skipChatHint: true }).join('\n');
  return [
    `Hi ${name},`,
    attachedLine(k),
    '',
    footer,
    '',
    'Reply on this chat if you need any help.',
    '',
    'Buttons: Call us · Text us (WhatsApp)',
  ].join('\n');
}
