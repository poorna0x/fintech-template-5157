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
import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel } from '@/lib/service-brands';
import { generateDocumentPdfBase64 } from '@/lib/server-pdf-download';

export interface SendAmcAgreementEmailParams {
  bill: Bill;
  brand: DocumentBrand;
  recipientEmail: string;
  accessToken: string;
  /** AMC end date (ISO yyyy-mm-dd) for the email details block */
  endDateIso: string;
  pdfOptions?: AMCPDFOptions;
}

function formatInrAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '';
  return `₹${amount.toLocaleString('en-IN')}`;
}

export async function sendAmcAgreementEmail(
  params: SendAmcAgreementEmailParams
): Promise<{ ok: boolean; error?: string }> {
  const { bill, brand, recipientEmail, accessToken, endDateIso, pdfOptions } = params;
  const pdfFilename = `AMC_${bill.billNumber.replace(/\s+/g, '_')}.pdf`;
  const html = generateAMCHTML(billToAmcPdfData(bill), pdfOptions);

  const { pdfBase64, filename, size } = await generateDocumentPdfBase64({
    html,
    filename: pdfFilename,
  });

  const documentData: AdminDocumentEmailData = {
    documentBrand: brand,
    customerName: bill.customer.name,
    documentRef: bill.billNumber,
    amount: formatInrAmount(bill.totalAmount),
    dueDate: endDateIso,
    message: getDefaultDocumentMessage('amc_document'),
    customSubject: '',
  };

  const emailPreview = buildAdminEmail(
    'amc_document',
    createEmptyBookingForm(brand),
    documentData,
    { attachmentNames: [filename] }
  );

  const result = await emailService.sendAdminComposerEmail(
    {
      templateType: 'amc_document',
      documentBrand: brand,
      to: recipientEmail.trim(),
      subject: emailPreview.subject,
      html: emailPreview.html,
      text: emailPreview.text,
      attachments: [
        {
          filename,
          contentType: 'application/pdf',
          content: pdfBase64,
          size,
        },
      ],
    },
    accessToken
  );

  if (!result.ok) {
    return { ok: false, error: result.error || 'Could not send email' };
  }

  return { ok: true };
}

export function getAmcEmailSuccessMessage(brand: DocumentBrand, recipientEmail: string): string {
  return `AMC agreement emailed from ${getDocumentBrandLabel(brand)} to ${recipientEmail.trim()}`;
}
