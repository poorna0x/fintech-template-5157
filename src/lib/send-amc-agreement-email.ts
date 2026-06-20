import type { Bill } from '@/types';
import {
  buildAdminEmail,
  createEmptyBookingForm,
  getDefaultDocumentMessage,
  type AdminDocumentEmailData,
} from '@/lib/admin-email-templates';
import { emailService } from '@/lib/email';
import {
  billToAmcPdfData,
  generateAMCHTML,
  type AMCPDFOptions,
} from '@/lib/amc-pdf-generator';
import { normalizeRecipientList } from '@/lib/email-recipients';
import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel } from '@/lib/service-brands';
import { generateDocumentPdfBase64 } from '@/lib/server-pdf-download';

export interface SendAmcAgreementEmailParams {
  bill: Bill;
  brand: DocumentBrand;
  /** One or more recipient addresses */
  recipientEmails: string[];
  accessToken: string;
  /** AMC end date (ISO yyyy-mm-dd) for the email details block */
  endDateIso: string;
  pdfOptions?: AMCPDFOptions;
  /** Override default template message body */
  customMessage?: string;
}

export interface SendAmcAgreementEmailResult {
  ok: boolean;
  error?: string;
  sentCount?: number;
  failedRecipients?: string[];
}

function formatInrAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '';
  return `₹${amount.toLocaleString('en-IN')}`;
}

export async function sendAmcAgreementEmail(
  params: SendAmcAgreementEmailParams
): Promise<SendAmcAgreementEmailResult> {
  const {
    bill,
    brand,
    recipientEmails,
    accessToken,
    endDateIso,
    pdfOptions,
    customMessage,
  } = params;

  const recipients = normalizeRecipientList(recipientEmails);
  if (!recipients.length) {
    return { ok: false, error: 'Add at least one valid email address' };
  }

  const pdfFilename = `AMC_${bill.billNumber.replace(/\s+/g, '_')}.pdf`;
  const html = generateAMCHTML(billToAmcPdfData(bill), pdfOptions);

  let pdfBase64: string;
  let filename: string;
  let size: number;

  try {
    const pdf = await generateDocumentPdfBase64({ html, filename: pdfFilename });
    pdfBase64 = pdf.pdfBase64;
    filename = pdf.filename;
    size = pdf.size;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'PDF generation failed',
    };
  }

  const message = (customMessage || getDefaultDocumentMessage('amc_document')).trim();
  const documentData: AdminDocumentEmailData = {
    documentBrand: brand,
    customerName: bill.customer.name,
    documentRef: bill.billNumber,
    amount: formatInrAmount(bill.totalAmount),
    dueDate: endDateIso,
    message,
    customSubject: '',
  };

  const emailPreview = buildAdminEmail(
    'amc_document',
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

  const result = await emailService.sendAmcAgreementEmail(
    {
      templateType: 'amc_document',
      documentBrand: brand,
      to: recipients.join(', '),
      subject: emailPreview.subject,
      html: emailPreview.html,
      text: emailPreview.text,
      attachments: [attachment],
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

export function getAmcEmailSuccessMessage(
  brand: DocumentBrand,
  recipientEmails: string[]
): string {
  const recipients = normalizeRecipientList(recipientEmails);
  const label = getDocumentBrandLabel(brand);
  if (recipients.length <= 1) {
    return `AMC agreement emailed from ${label} to ${recipients[0] || 'customer'}`;
  }
  return `AMC agreement emailed from ${label} to ${recipients.length} recipients`;
}

export async function downloadAmcAgreementPdf(
  bill: Bill,
  pdfOptions?: AMCPDFOptions
): Promise<void> {
  const { generateAMCPDF } = await import('@/lib/amc-pdf-generator');
  generateAMCPDF(bill, 'pdf', pdfOptions);
}
