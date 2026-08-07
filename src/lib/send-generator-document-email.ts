import type { Bill } from '@/types';
import {
  buildAdminEmail,
  createEmptyBookingForm,
  getDefaultDocumentMessage,
  type AdminDocumentEmailData,
  type AdminEmailTemplateType,
} from '@/lib/admin-email-templates';
import { emailService } from '@/lib/email';
import { normalizeRecipientList, formatRecipientsForEmailApi } from '@/lib/email-recipients';
import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel } from '@/lib/service-brands';
import { generateDocumentPdfBase64 } from '@/lib/server-pdf-download';
import { ensureSupabaseSessionForWrite, resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';
import { generateBillHTML } from '@/lib/pdf-generator';
import { generateQuotationHTML } from '@/lib/quotation-pdf-generator';
import { generateTaxInvoiceHTML } from '@/lib/tax-invoice-pdf-generator';
import {
  billToBillPdfData,
  billToQuotationPdfData,
  billToTaxInvoicePdfData,
} from '@/lib/document-preview-utils';

export type GeneratorDocumentEmailKind = 'service_bill' | 'quotation' | 'invoice';

export interface SendGeneratorDocumentEmailParams {
  kind: GeneratorDocumentEmailKind;
  bill: Bill;
  brand: DocumentBrand;
  recipientEmails: string[];
  customMessage?: string;
  dueDateIso?: string;
}

export interface SendGeneratorDocumentEmailResult {
  ok: boolean;
  error?: string;
  sentCount?: number;
  failedRecipients?: string[];
}

function formatInrAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '';
  return `₹${amount.toLocaleString('en-IN')}`;
}

function templateTypeForKind(kind: GeneratorDocumentEmailKind): AdminEmailTemplateType {
  return kind;
}

function pdfFilenameForKind(kind: GeneratorDocumentEmailKind, bill: Bill): string {
  const safeNumber = bill.billNumber.replace(/\s+/g, '_');
  switch (kind) {
    case 'service_bill':
      return `Bill_${safeNumber}.pdf`;
    case 'quotation':
      return `Quotation_${safeNumber}.pdf`;
    case 'invoice':
      return `TaxInvoice_${safeNumber}.pdf`;
  }
}

function pdfHtmlForKind(kind: GeneratorDocumentEmailKind, bill: Bill): string {
  switch (kind) {
    case 'service_bill':
      return generateBillHTML(billToBillPdfData(bill));
    case 'quotation':
      return generateQuotationHTML(
        billToQuotationPdfData(bill) as Parameters<typeof generateQuotationHTML>[0]
      );
    case 'invoice':
      return generateTaxInvoiceHTML(
        billToTaxInvoicePdfData(bill) as Parameters<typeof generateTaxInvoiceHTML>[0]
      );
  }
}

function dueDateForKind(kind: GeneratorDocumentEmailKind, bill: Bill): string {
  const ext = bill as Bill & {
    validUntil?: string;
    pdfOptions?: { signatureDate?: string };
  };
  switch (kind) {
    case 'quotation':
      return ext.validUntil || bill.billDate;
    case 'invoice':
      return ext.pdfOptions?.signatureDate || bill.billDate;
    default:
      return bill.billDate;
  }
}

function customerDisplayName(bill: Bill): string {
  const customer = bill.customer as { name?: string; fullName?: string };
  return customer.name || customer.fullName || 'Customer';
}

/** PDF base64 for WhatsApp document send (same HTML as email). */
export async function generateGeneratorDocumentPdfBase64(
  kind: GeneratorDocumentEmailKind,
  bill: Bill
): Promise<{ pdfBase64: string; filename: string; size: number }> {
  const sessionReady = await ensureSupabaseSessionForWrite();
  if (!sessionReady.ok) {
    throw new Error('Could not verify your session. Please try again.');
  }
  return generateDocumentPdfBase64({
    html: pdfHtmlForKind(kind, bill),
    filename: pdfFilenameForKind(kind, bill),
  });
}

export async function sendGeneratorDocumentEmail(
  params: SendGeneratorDocumentEmailParams
): Promise<SendGeneratorDocumentEmailResult> {
  const { kind, bill, brand, recipientEmails, customMessage, dueDateIso } = params;

  const recipients = normalizeRecipientList(recipientEmails);
  if (!recipients.length) {
    return { ok: false, error: 'Add at least one valid email address' };
  }

  const toHeader = formatRecipientsForEmailApi(recipients);
  if (!toHeader) {
    return { ok: false, error: 'Add at least one valid email address' };
  }

  const templateType = templateTypeForKind(kind);
  const pdfFilename = pdfFilenameForKind(kind, bill);
  const html = pdfHtmlForKind(kind, bill);

  const sessionReady = await ensureSupabaseSessionForWrite();
  if (!sessionReady.ok) {
    return {
      ok: false,
      error: 'Could not verify your session. Please try again in a moment.',
    };
  }

  let pdfBase64: string;
  let filename: string;
  let size: number;

  try {
    const pdf = await generateDocumentPdfBase64({ html, filename: pdfFilename });
    pdfBase64 = pdf.pdfBase64;
    filename = pdf.filename;
    size = pdf.size;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF generation failed';
    return {
      ok: false,
      error: `${message}. Run npm run dev locally for PDF email attachments, or use Generate to print/save the document.`,
    };
  }

  const message = (customMessage || getDefaultDocumentMessage(templateType)).trim();
  const documentData: AdminDocumentEmailData = {
    documentBrand: brand,
    customerName: customerDisplayName(bill),
    documentRef: bill.billNumber,
    amount: formatInrAmount(bill.totalAmount),
    dueDate: dueDateIso || dueDateForKind(kind, bill),
    message,
    customSubject: '',
  };

  const emailPreview = buildAdminEmail(
    templateType,
    createEmptyBookingForm(brand),
    documentData,
    { attachmentNames: [filename] }
  );

  const attachment = {
    filename,
    contentType: 'application/pdf',
    content: pdfBase64,
    size,
  };

  const accessToken = await resolveSupabaseAccessTokenForApi();
  if (!accessToken) {
    return {
      ok: false,
      error: 'Could not verify your session. Please try again in a moment.',
      sentCount: 0,
      failedRecipients: recipients,
    };
  }

  const result = await emailService.sendAdminComposerEmail(
    {
      templateType,
      documentBrand: brand,
      to: toHeader,
      subject: emailPreview.subject,
      html: emailPreview.html,
      text: emailPreview.text,
      attachments: [attachment],
      customerId: bill.customer?.id,
    },
    accessToken
  );

  if (!result.ok) {
    return {
      ok: false,
      error: result.error || 'Could not send to any recipient',
      sentCount: 0,
      failedRecipients: recipients,
    };
  }

  return { ok: true, sentCount: recipients.length };
}

const SUCCESS_LABELS: Record<GeneratorDocumentEmailKind, string> = {
  service_bill: 'Service bill',
  quotation: 'Quotation',
  invoice: 'Tax invoice',
};

export function getGeneratorDocumentEmailSuccessMessage(
  kind: GeneratorDocumentEmailKind,
  brand: DocumentBrand,
  recipientEmails: string[]
): string {
  const recipients = normalizeRecipientList(recipientEmails);
  const brandLabel = getDocumentBrandLabel(brand);
  const docLabel = SUCCESS_LABELS[kind];
  if (recipients.length <= 1) {
    return `${docLabel} emailed from ${brandLabel} to ${recipients[0] || 'customer'}`;
  }
  return `${docLabel} emailed from ${brandLabel} to ${recipients.length} recipients`;
}
