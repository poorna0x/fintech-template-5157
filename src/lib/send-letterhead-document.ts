import {
  buildAdminEmail,
  createEmptyBookingForm,
  type AdminDocumentEmailData,
} from '@/lib/admin-email-templates';
import { emailService } from '@/lib/email';
import { normalizeRecipientList, formatRecipientsForEmailApi } from '@/lib/email-recipients';
import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel } from '@/lib/service-brands';
import { ensureSupabaseSessionForWrite, resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';
import { isAbortError, SEND_CANCELLED_MESSAGE, throwIfAborted } from '@/lib/abortSend';
import {
  generateLetterheadPdfBase64,
  letterheadPdfFilename,
  letterheadShareLabel,
  type LetterheadDocumentData,
} from '@/lib/letterhead-pdf-generator';

export function defaultLetterheadShareMessage(data: LetterheadDocumentData): string {
  const label = letterheadShareLabel(data);
  return `Please find your ${label} attached. Reply to this message or call us if you have any questions.`;
}

export async function sendLetterheadDocumentEmail(params: {
  data: LetterheadDocumentData;
  brand: DocumentBrand;
  recipientEmails: string[];
  customMessage?: string;
  signal?: AbortSignal;
}): Promise<{ ok: boolean; error?: string; sentCount?: number; cancelled?: boolean }> {
  const recipients = normalizeRecipientList(params.recipientEmails);
  if (!recipients.length) {
    return { ok: false, error: 'Add at least one valid email address' };
  }
  const toHeader = formatRecipientsForEmailApi(recipients);
  if (!toHeader) {
    return { ok: false, error: 'Add at least one valid email address' };
  }

  throwIfAborted(params.signal);
  const sessionReady = await ensureSupabaseSessionForWrite();
  if (!sessionReady.ok) {
    return { ok: false, error: 'Could not verify your session. Please try again in a moment.' };
  }

  let pdfBase64: string;
  let filename: string;
  let size: number;
  try {
    const pdf = await generateLetterheadPdfBase64(params.data, params.signal);
    pdfBase64 = pdf.pdfBase64;
    filename = pdf.filename;
    size = pdf.size;
  } catch (error) {
    if (isAbortError(error)) {
      return { ok: false, cancelled: true, error: SEND_CANCELLED_MESSAGE };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'PDF generation failed',
    };
  }

  const label = letterheadShareLabel(params.data);
  const brandLabel = getDocumentBrandLabel(params.brand);
  const message = (params.customMessage || defaultLetterheadShareMessage(params.data)).trim();
  const documentData: AdminDocumentEmailData = {
    documentBrand: params.brand,
    customerName: params.data.customerName || 'Customer',
    documentRef: params.data.documentNumber || '',
    amount: '',
    dueDate: params.data.date || '',
    message,
    customSubject: `${label} — ${brandLabel}`,
  };

  const emailPreview = buildAdminEmail(
    'general',
    createEmptyBookingForm(params.brand),
    documentData,
    { attachmentNames: [filename || letterheadPdfFilename(params.data)] }
  );

  const accessToken = await resolveSupabaseAccessTokenForApi();
  if (!accessToken) {
    return { ok: false, error: 'Could not verify your session. Please try again in a moment.' };
  }

  const result = await emailService.sendAdminComposerEmail(
    {
      templateType: 'general',
      documentBrand: params.brand,
      to: toHeader,
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
      customerId: params.data.customerId || null,
    },
    accessToken,
    params.signal
  );

  if (result.cancelled) {
    return { ok: false, cancelled: true, error: SEND_CANCELLED_MESSAGE };
  }

  if (!result.ok) {
    return { ok: false, error: result.error || 'Could not send to any recipient' };
  }
  return { ok: true, sentCount: recipients.length };
}

export function getLetterheadEmailSuccessMessage(
  brand: DocumentBrand,
  recipientEmails: string[]
): string {
  const recipients = normalizeRecipientList(recipientEmails);
  const label = getDocumentBrandLabel(brand);
  if (recipients.length <= 1) {
    return `Document emailed from ${label} to ${recipients[0] || 'customer'}`;
  }
  return `Document emailed from ${label} to ${recipients.length} recipients`;
}
