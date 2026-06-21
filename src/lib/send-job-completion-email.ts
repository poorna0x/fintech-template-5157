import { applyEmailSourceRecord } from '@/lib/admin-email-sources';
import {
  buildAdminEmail,
  createEmptyBookingForm,
  type AdminDocumentEmailData,
} from '@/lib/admin-email-templates';
import { getPublicEmailAssetOrigin } from '@/lib/booking-confirmation-email';
import { getValidCustomerEmail } from '@/lib/customer-email';
import { emailService } from '@/lib/email';
import { ensureSupabaseSessionForWrite, resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';
import { buildJobCompletionMessage } from '@/lib/job-completion-message';
import type { DocumentBrand } from '@/lib/service-brands';

export interface SendJobCompletionEmailParams {
  jobId: string;
  brand: DocumentBrand;
}

export interface SendJobCompletionEmailResult {
  ok: boolean;
  error?: string;
  to?: string;
}

function applyForcedBrandToDocumentForm(
  form: AdminDocumentEmailData,
  forcedBrand: DocumentBrand
): AdminDocumentEmailData {
  const amountCollected =
    parseFloat(String(form.amount || '').replace(/[^\d.-]/g, '')) || 0;
  return {
    ...form,
    documentBrand: forcedBrand,
    message: buildJobCompletionMessage({
      customerName: form.customerName,
      serviceType: form.completionServiceType || '',
      serviceSubType: form.completionServiceSubType || '',
      amountCollected,
      documentBrand: forcedBrand,
    }),
  };
}

export async function sendJobCompletionEmail(
  params: SendJobCompletionEmailParams
): Promise<SendJobCompletionEmailResult> {
  const { jobId, brand } = params;

  const source = await applyEmailSourceRecord('job_completion', jobId);
  if (!source?.documentForm) {
    return { ok: false, error: 'Could not load completed job for email' };
  }

  const to = getValidCustomerEmail(source.recipientEmail);
  if (!to) {
    return { ok: false, error: 'This customer has no email on file' };
  }

  const documentData = applyForcedBrandToDocumentForm(source.documentForm, brand);
  const emailPreview = buildAdminEmail(
    'job_completion',
    createEmptyBookingForm(brand),
    documentData,
    { siteOrigin: getPublicEmailAssetOrigin(brand) }
  );

  const sessionReady = await ensureSupabaseSessionForWrite();
  if (!sessionReady.ok) {
    return {
      ok: false,
      error: 'Could not verify your session. Please try again in a moment.',
    };
  }

  const accessToken = await resolveSupabaseAccessTokenForApi();
  if (!accessToken) {
    return { ok: false, error: 'Sign in as admin to send email' };
  }

  const result = await emailService.sendAdminComposerEmail(
    {
      templateType: 'job_completion',
      documentBrand: brand,
      to,
      subject: emailPreview.subject,
      html: emailPreview.html,
      text: emailPreview.text,
      jobId,
    },
    accessToken
  );

  if (!result.ok) {
    return { ok: false, error: result.error || 'Could not send email' };
  }

  return { ok: true, to };
}
