import {
  buildAdminEmail,
  createEmptyBookingForm,
  getDefaultDocumentMessage,
  type AdminDocumentEmailData,
} from '@/lib/admin-email-templates';
import { emailService } from '@/lib/email';
import { normalizeRecipientList, formatRecipientsForEmailApi } from '@/lib/email-recipients';
import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel } from '@/lib/service-brands';
import { generateDocumentPdfBase64 } from '@/lib/server-pdf-download';
import { isAbortError, SEND_CANCELLED_MESSAGE, throwIfAborted } from '@/lib/abortSend';
import { ensureSupabaseSessionForWrite, resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';
import {
  generateWarrantyCardHTML,
  type WarrantyCardPDFData,
} from '@/lib/warranty-card-pdf-generator';
import {
  generateDocumentPdfVerifyCode,
  recordDocumentPdfAuthenticity,
  todayYmdIst,
} from '@/lib/documentPdfAuthenticity';

export interface SendWarrantyCardEmailParams {
  data: WarrantyCardPDFData;
  brand: DocumentBrand;
  recipientEmails: string[];
  customMessage?: string;
  customerId?: string;
  signal?: AbortSignal;
}

export interface SendWarrantyCardEmailResult {
  ok: boolean;
  error?: string;
  sentCount?: number;
  failedRecipients?: string[];
  cancelled?: boolean;
}

function warrantyPdfFilename(data: WarrantyCardPDFData): string {
  const safeId = data.customer.customer_id.replace(/[/\\?%*:|"<>]/g, '_');
  const datePart = (data.warranty.start_date || 'card').replace(/-/g, '');
  const draft = data.warranty.id === 'draft' ? '_draft' : '';
  return `Warranty_${safeId}_${datePart}${draft}.pdf`;
}

function overallWarrantyEnd(data: WarrantyCardPDFData): string {
  const covered = data.warranty.items.filter((it) => it.covered !== false);
  if (covered.length === 0) return data.warranty.end_date;
  return covered.reduce(
    (max, it) => (it.end_date > max ? it.end_date : max),
    covered[0].end_date
  );
}

function withWarrantyAuthenticity(
  data: WarrantyCardPDFData,
  verifyCode: string,
  generatedOnYmd: string
): WarrantyCardPDFData {
  return {
    ...data,
    authenticityVerifyCode: verifyCode,
    authenticityGeneratedOnYmd: generatedOnYmd,
  };
}

async function fingerprintWarrantyPdf(params: {
  data: WarrantyCardPDFData;
  verifyCode: string;
  pdfBase64: string;
  filename: string;
  customerId?: string | null;
  generatedOnYmd: string;
}): Promise<void> {
  const sourceKey =
    params.data.warranty.id && params.data.warranty.id !== 'draft'
      ? params.data.warranty.id
      : `draft:${params.data.customer.customer_id}:${params.data.warranty.start_date || 'na'}`;
  await recordDocumentPdfAuthenticity({
    docType: 'warranty',
    sourceKey,
    verifyCode: params.verifyCode,
    pdfBase64: params.pdfBase64,
    filename: params.filename,
    customerId: params.customerId || null,
    documentRef: params.data.customer.customer_id,
    generatedOnYmd: params.generatedOnYmd,
  });
}

/** PDF base64 helper. Fingerprints hash-only. */
export async function generateWarrantyCardPdfBase64(
  data: WarrantyCardPDFData,
  opts?: { customerId?: string | null; signal?: AbortSignal }
): Promise<{ pdfBase64: string; filename: string; size: number }> {
  throwIfAborted(opts?.signal);
  const sessionReady = await ensureSupabaseSessionForWrite();
  if (!sessionReady.ok) {
    throw new Error('Could not verify your session. Please try again.');
  }
  const verifyCode = generateDocumentPdfVerifyCode();
  const generatedOnYmd = todayYmdIst();
  const fingerprinted = withWarrantyAuthenticity(data, verifyCode, generatedOnYmd);
  const filename = warrantyPdfFilename(fingerprinted);
  throwIfAborted(opts?.signal);
  const pdf = await generateDocumentPdfBase64({
    html: generateWarrantyCardHTML(fingerprinted),
    filename,
    signal: opts?.signal,
  });
  await fingerprintWarrantyPdf({
    data: fingerprinted,
    verifyCode,
    pdfBase64: pdf.pdfBase64,
    filename: pdf.filename,
    customerId: opts?.customerId,
    generatedOnYmd,
  });
  return pdf;
}

export async function sendWarrantyCardEmail(
  params: SendWarrantyCardEmailParams
): Promise<SendWarrantyCardEmailResult> {
  const { data, brand, recipientEmails, customMessage, customerId, signal } = params;

  const recipients = normalizeRecipientList(recipientEmails);
  if (!recipients.length) {
    return { ok: false, error: 'Add at least one valid email address' };
  }

  const toHeader = formatRecipientsForEmailApi(recipients);
  if (!toHeader) {
    return { ok: false, error: 'Add at least one valid email address' };
  }

  const pdfFilename = warrantyPdfFilename(data);
  const verifyCode = generateDocumentPdfVerifyCode();
  const generatedOnYmd = todayYmdIst();
  const fingerprinted = withWarrantyAuthenticity(data, verifyCode, generatedOnYmd);
  const html = generateWarrantyCardHTML(fingerprinted);

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
    await fingerprintWarrantyPdf({
      data: fingerprinted,
      verifyCode,
      pdfBase64,
      filename,
      customerId,
      generatedOnYmd,
    });
  } catch (error) {
    if (isAbortError(error)) {
      return { ok: false, cancelled: true, error: SEND_CANCELLED_MESSAGE };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'PDF generation failed',
    };
  }

  const endDate = overallWarrantyEnd(data);
  const message = (customMessage || getDefaultDocumentMessage('warranty_document')).trim();
  const documentData: AdminDocumentEmailData = {
    documentBrand: brand,
    customerName: data.customer.name,
    documentRef: data.customer.customer_id,
    amount: '',
    dueDate: endDate,
    message,
    customSubject: '',
  };

  const emailPreview = buildAdminEmail(
    'warranty_document',
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
      templateType: 'warranty_document',
      documentBrand: brand,
      to: toHeader,
      subject: emailPreview.subject,
      html: emailPreview.html,
      text: emailPreview.text,
      attachments: [attachment],
      customerId: customerId ?? null,
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

export function getWarrantyCardEmailSuccessMessage(
  brand: DocumentBrand,
  recipientEmails: string[]
): string {
  const recipients = normalizeRecipientList(recipientEmails);
  const label = getDocumentBrandLabel(brand);
  if (recipients.length <= 1) {
    return `Warranty card emailed from ${label} to ${recipients[0] || 'customer'}`;
  }
  return `Warranty card emailed from ${label} to ${recipients.length} recipients`;
}
