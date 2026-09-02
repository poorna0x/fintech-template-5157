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
import { normalizeRecipientList, formatRecipientsForEmailApi } from '@/lib/email-recipients';
import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel } from '@/lib/service-brands';
import { generateDocumentPdfBase64 } from '@/lib/server-pdf-download';
import { isAbortError, SEND_CANCELLED_MESSAGE, throwIfAborted } from '@/lib/abortSend';
import { ensureSupabaseSessionForWrite, resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';
import {
  generateDocumentPdfVerifyCode,
  recordDocumentPdfAuthenticity,
  todayYmdIst,
} from '@/lib/documentPdfAuthenticity';

export interface SendAmcAgreementEmailParams {
  bill: Bill;
  brand: DocumentBrand;
  /** One or more recipient addresses */
  recipientEmails: string[];
  /** AMC end date (ISO yyyy-mm-dd) for the email details block */
  endDateIso: string;
  pdfOptions?: AMCPDFOptions;
  /** Override default template message body */
  customMessage?: string;
  signal?: AbortSignal;
}

export interface SendAmcAgreementEmailResult {
  ok: boolean;
  error?: string;
  sentCount?: number;
  failedRecipients?: string[];
  cancelled?: boolean;
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
    endDateIso,
    pdfOptions,
    customMessage,
    signal,
  } = params;

  const recipients = normalizeRecipientList(recipientEmails);
  if (!recipients.length) {
    return { ok: false, error: 'Add at least one valid email address' };
  }

  const toHeader = formatRecipientsForEmailApi(recipients);
  if (!toHeader) {
    return { ok: false, error: 'Add at least one valid email address' };
  }

  const pdfFilename = `AMC_${bill.billNumber.replace(/\s+/g, '_')}.pdf`;
  const verifyCode =
    pdfOptions?.authenticityVerifyCode || generateDocumentPdfVerifyCode();
  const generatedOnYmd =
    pdfOptions?.authenticityGeneratedOnYmd || todayYmdIst();
  const authPdfOptions: AMCPDFOptions = {
    ...pdfOptions,
    authenticityVerifyCode: verifyCode,
    authenticityGeneratedOnYmd: generatedOnYmd,
  };
  const html = generateAMCHTML(billToAmcPdfData(bill), authPdfOptions);

  throwIfAborted(signal);
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
    throwIfAborted(signal);
    const pdf = await generateDocumentPdfBase64({ html, filename: pdfFilename, signal });
    pdfBase64 = pdf.pdfBase64;
    filename = pdf.filename;
    size = pdf.size;
    await recordDocumentPdfAuthenticity({
      docType: 'amc',
      sourceKey: String(bill.billNumber || '').trim() || `amc-${Date.now()}`,
      verifyCode,
      pdfBase64,
      filename,
      customerId: bill.customer?.id || null,
      documentRef: bill.billNumber,
      generatedOnYmd,
    });
  } catch (error) {
    if (isAbortError(error)) {
      return { ok: false, cancelled: true, error: SEND_CANCELLED_MESSAGE };
    }
    const message = error instanceof Error ? error.message : 'PDF generation failed';
    return {
      ok: false,
      error: `${message}. Run npm run dev locally for PDF email attachments, or use Generate to print/save the agreement.`,
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

  // PDF generation can take a while — refresh JWT immediately before the email API call.
  const accessToken = await resolveSupabaseAccessTokenForApi();
  if (!accessToken) {
    return {
      ok: false,
      error: 'Could not verify your session. Please try again in a moment.',
      sentCount: 0,
      failedRecipients: recipients,
    };
  }

  const result = await emailService.sendAmcAgreementEmail(
    {
      templateType: 'amc_document',
      documentBrand: brand,
      to: toHeader,
      subject: emailPreview.subject,
      html: emailPreview.html,
      text: emailPreview.text,
      attachments: [attachment],
      customerId: bill.customer?.id,
    },
    accessToken,
    signal
  );

  if (result.cancelled) {
    return { ok: false, cancelled: true, error: SEND_CANCELLED_MESSAGE };
  }

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
