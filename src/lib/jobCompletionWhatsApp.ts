/**
 * Auto / manual job-completion WhatsApp to the customer.
 * - Honors allow_job_completion_whatsapp + auto_send_job_completion_whatsapp
 * - Skips when technician set dont_send_message
 * - Skips when this job has technician AMC info (amc_info) — not DB active AMC
 * - Uses brand-correct copy from buildJobCompletionWhatsAppMessage
 * - Free-form Cloud API in 24h window; cold `svc_completed` when window closed
 */
import { toast } from 'sonner';
import { db } from '@/lib/supabase';
import { supabase } from '@/lib/supabaseClient';
import { formatPhoneForWhatsApp } from '@/lib/utils';
import { parseRequirements } from '@/lib/followUpToOngoing';
import { jobHasSkipReview, jobReviewColdUrlButtonParam, jobReviewTokenFromUrl } from '@/lib/jobReviews';
import { getLeadSourceFromJob } from '@/lib/adminUtils';
import { ensureLeadCatalogLoaded, isDirectCallOrCustomLeadSource } from '@/lib/leadCatalog';
import { getCompletedJobMissingMedia } from '@/lib/jobReportPhotos';
import {
  buildJobCompletionColdBodyParams,
  buildJobCompletionLetterBodyParams,
  buildJobCompletionMessageFromJob,
  buildJobCompletionWhatsAppMessage,
  JOB_COMPLETION_COLD_FALLBACK,
  resolveJobCompletionColdTemplateFallbackName,
  resolveJobCompletionColdTemplateName,
  resolveJobCompletionLetterTemplateName,
  resolveJobCompletionLetterTemplateFallbackName,
  resolveJobCompletionLetterTemplateLegacyName,
} from '@/lib/job-completion-message';
import {
  openWhatsAppMeDeepLink,
  sendAdminWhatsAppMedia,
  sendAdminWhatsAppTemplate,
  sendAdminWhatsAppText,
} from '@/lib/sendAdminWhatsAppApi';
import { fetchWhatsAppCrmSettings } from '@/lib/whatsappCrmSettings';
import {
  fetchLastInboundAt,
  isCustomerServiceWindowClosed,
} from '@/lib/whatsappInbox';
import { getDocumentBrandLabel, normalizeDocumentBrand } from '@/lib/service-brands';
import { WA_COLD } from '@/lib/whatsappColdTemplates';
import type { Job } from '@/types';
import {
  buildPendingPaymentUpiShare,
  fetchUpiPaymentAccounts,
  resolvePreferredUpiAccount,
} from '@/lib/upiPaymentAccounts';
import { generateUpiQrPngBase64 } from '@/lib/generateUpiQrPng';
import {
  buildPendingPaymentLetterBodyParams,
  buildPendingPaymentLetterButtonUrlParams,
  resolvePendingPaymentLetterImageTemplateName,
  resolvePendingPaymentLetterImageTemplateFallbackName,
  resolvePendingPaymentLetterTemplateName,
  resolvePendingPaymentLetterTemplateFallbackName,
  resolvePendingPaymentLetterTemplateLegacyName,
} from '@/lib/pendingPaymentReminder';

export type JobCompletionWhatsAppSendResult = {
  ok: boolean;
  via?: 'api' | 'wa_me';
  usedTemplate?: boolean;
  usedRichColdTemplate?: boolean;
  error?: string;
  needsWindowOrTemplate?: boolean;
  featureDisabled?: boolean;
};

/** Send completion WhatsApp — letter freeform in 24h; letter → v3 → v2 → svc_job_done when cold. */
export async function sendJobCompletionWhatsApp(opts: {
  to: string;
  text: string;
  customerId?: string | null;
  customerName: string;
  amountCollected: number;
  documentBrand: import('@/lib/service-brands').DocumentBrand;
  serviceType?: string;
  serviceSubType?: string;
  amountPending?: number;
  pendingDueDate?: string | null;
  jobRef?: string | null;
  /** UPI pay HTTPS link for cold Pay now button when balance is pending. */
  payHttpsLink?: string | null;
  /** Optional UPI QR PNG for balance-due photo+caption / IMAGE cold template. */
  headerImage?: {
    imageBase64: string;
    filename?: string;
    mimeType?: string;
  } | null;
  /** Public /review/{token} — 24h free-form + cold Review us button. */
  reviewUrl?: string | null;
  reviewToken?: string | null;
  fallbackWaMe?: boolean;
  forceWaMe?: boolean;
}): Promise<JobCompletionWhatsAppSendResult> {
  const pending = Math.max(0, Number(opts.amountPending) || 0);
  const reviewToken =
    String(opts.reviewToken || '').trim() || jobReviewTokenFromUrl(opts.reviewUrl) || '';
  const reviewButton = jobReviewColdUrlButtonParam(reviewToken, pending > 0 ? 2 : 1);
  const payButtonParams = buildPendingPaymentLetterButtonUrlParams(opts.payHttpsLink, {
    reviewToken: pending > 0 ? reviewToken : null,
  });
  const useBalanceDueCold = pending > 0;
  const withReview = Boolean(reviewButton);
  const headerImage = opts.headerImage?.imageBase64
    ? {
        imageBase64: opts.headerImage.imageBase64,
        filename: opts.headerImage.filename || 'upi-qr.png',
        mimeType: opts.headerImage.mimeType || 'image/png',
      }
    : null;

  const letterName = useBalanceDueCold
    ? resolvePendingPaymentLetterTemplateName(opts.documentBrand, {
        withPayButton: payButtonParams.some((b) => b.index === 1),
        withReview: payButtonParams.some((b) => b.index === 2),
      })
    : resolveJobCompletionLetterTemplateName(opts.documentBrand, { withReview });
  const letterFallbackName = useBalanceDueCold
    ? resolvePendingPaymentLetterTemplateFallbackName(opts.documentBrand)
    : resolveJobCompletionLetterTemplateFallbackName(opts.documentBrand);
  const richColdName = resolveJobCompletionColdTemplateName(opts.documentBrand);
  const richColdFallbackName = resolveJobCompletionColdTemplateFallbackName(opts.documentBrand);
  const letterParams = useBalanceDueCold
    ? buildPendingPaymentLetterBodyParams(
        opts.customerName,
        pending,
        opts.pendingDueDate,
        opts.jobRef
      )
    : buildJobCompletionLetterBodyParams({
        customerName: opts.customerName,
        amountCollected: opts.amountCollected,
        jobRef: opts.jobRef,
        documentBrand: opts.documentBrand,
      });
  const richColdParams = buildJobCompletionColdBodyParams({
    customerName: opts.customerName,
    serviceType: opts.serviceType,
    serviceSubType: opts.serviceSubType,
    amountCollected: opts.amountCollected,
    amountPending: opts.amountPending,
    pendingDueDate: opts.pendingDueDate,
    documentBrand: opts.documentBrand,
  });

  if (opts.forceWaMe) {
    openWhatsAppMeDeepLink(opts.to, opts.text);
    return { ok: true, via: 'wa_me' };
  }
  const windowClosed = isCustomerServiceWindowClosed(
    await fetchLastInboundAt(opts.to, supabase)
  );

  // Balance due + QR: IMAGE Pay-now templates have no Review us button.
  // Prefer 24h photo+caption (includes the review link) when we have a token.
  if (useBalanceDueCold && headerImage && !withReview) {
    for (const templateName of [
      resolvePendingPaymentLetterImageTemplateName(opts.documentBrand),
      resolvePendingPaymentLetterImageTemplateFallbackName(opts.documentBrand),
    ]) {
      const cold = await sendAdminWhatsAppTemplate({
        to: opts.to,
        templateName,
        languageCode: 'en',
        bodyParams: letterParams,
        buttonUrlParams: payButtonParams,
        headerImage,
        customerId: opts.customerId,
        source: 'job_completion',
      });
      if (cold.ok) {
        return { ...cold, usedTemplate: true, usedRichColdTemplate: true };
      }
      if (cold.featureDisabled) {
        return cold;
      }
    }

    if (!windowClosed) {
      const mediaResult = await sendAdminWhatsAppMedia({
        to: opts.to,
        fileBase64: headerImage.imageBase64,
        filename: headerImage.filename,
        mimeType: headerImage.mimeType,
        caption: opts.text,
        customerId: opts.customerId,
        source: 'job_completion',
      });
      if (mediaResult.ok) {
        return { ...mediaResult, usedTemplate: false };
      }
      if (mediaResult.featureDisabled) {
        return mediaResult;
      }
      if (!mediaResult.needsWindowOrTemplate) {
        if (opts.fallbackWaMe !== false) {
          openWhatsAppMeDeepLink(opts.to, opts.text);
          return { ok: true, via: 'wa_me', error: mediaResult.error };
        }
        return mediaResult;
      }
    }
  }

  // Pending + review: still attach QR in-window (caption has the review link).
  if (!windowClosed && useBalanceDueCold && headerImage && withReview) {
    const mediaResult = await sendAdminWhatsAppMedia({
      to: opts.to,
      fileBase64: headerImage.imageBase64,
      filename: headerImage.filename,
      mimeType: headerImage.mimeType,
      caption: opts.text,
      customerId: opts.customerId,
      source: 'job_completion',
    });
    if (mediaResult.ok) {
      return { ...mediaResult, usedTemplate: false };
    }
    if (mediaResult.featureDisabled) {
      return mediaResult;
    }
    if (!mediaResult.needsWindowOrTemplate) {
      if (opts.fallbackWaMe !== false) {
        openWhatsAppMeDeepLink(opts.to, opts.text);
        return { ok: true, via: 'wa_me', error: mediaResult.error };
      }
      return mediaResult;
    }
  }

  const textResult: Awaited<ReturnType<typeof sendAdminWhatsAppText>> = windowClosed
    ? {
        ok: false,
        needsWindowOrTemplate: true,
        error: '24h window closed',
      }
    : await sendAdminWhatsAppText({
        to: opts.to,
        text: opts.text,
        customerId: opts.customerId,
        source: 'job_completion',
        fallbackWaMe: false,
      });

  if (textResult.ok) {
    return textResult;
  }

  if (textResult.featureDisabled) {
    return textResult;
  }

  if (!textResult.needsWindowOrTemplate) {
    if (opts.fallbackWaMe !== false) {
      openWhatsAppMeDeepLink(opts.to, opts.text);
      return { ok: true, via: 'wa_me', error: textResult.error };
    }
    return textResult;
  }

  let richError: string | undefined;
  const letterLegacyName = useBalanceDueCold
    ? resolvePendingPaymentLetterTemplateLegacyName(opts.documentBrand)
    : resolveJobCompletionLetterTemplateLegacyName(opts.documentBrand);
  for (const templateName of [letterName, letterFallbackName, letterLegacyName]) {
    const letter = await sendAdminWhatsAppTemplate({
      to: opts.to,
      templateName,
      languageCode: 'en',
      bodyParams: letterParams,
      buttonUrlParams: useBalanceDueCold
        ? payButtonParams
        : reviewButton
          ? [reviewButton]
          : undefined,
      customerId: opts.customerId,
      source: 'job_completion',
    });
    if (letter.ok) {
      return { ...letter, usedTemplate: true, usedRichColdTemplate: true };
    }
    richError = letter.error;
  }

  for (const templateName of [richColdName, richColdFallbackName]) {
    const rich = await sendAdminWhatsAppTemplate({
      to: opts.to,
      templateName,
      languageCode: 'en',
      bodyParams: richColdParams,
      customerId: opts.customerId,
      source: 'job_completion',
    });
    if (rich.ok) {
      return {
        ...rich,
        usedTemplate: true,
        usedRichColdTemplate: true,
      };
    }
    richError = rich.error;
  }

  const legacy = await sendAdminWhatsAppTemplate({
    to: opts.to,
    templateName: JOB_COMPLETION_COLD_FALLBACK.name,
    languageCode: JOB_COMPLETION_COLD_FALLBACK.language,
    bodyParams: WA_COLD.job_completion.bodyParams(opts.customerName, opts.amountCollected),
    customerId: opts.customerId,
    source: 'job_completion',
  });

  if (legacy.ok) {
    return { ...legacy, usedTemplate: true, usedRichColdTemplate: false };
  }

  if (opts.fallbackWaMe !== false) {
    openWhatsAppMeDeepLink(opts.to, opts.text);
    return {
      ok: true,
      via: 'wa_me',
      needsWindowOrTemplate: true,
      error: legacy.error || richError || textResult.error,
    };
  }

  return {
    ok: false,
    needsWindowOrTemplate: true,
    error: legacy.error || richError || textResult.error || 'Could not send completion template',
  };
}

function requirementsList(job: Record<string, unknown>): Record<string, unknown>[] {
  return parseRequirements(job.requirements ?? job.Requirements);
}

export function jobHasDontSendCompletionMessage(job: Record<string, unknown>): boolean {
  return requirementsList(job).some((r) => r?.dont_send_message === true);
}

export function jobHasCompletionMessageSent(job: Record<string, unknown>): boolean {
  return requirementsList(job).some((r) => {
    if (!r || typeof r !== 'object') return false;
    return r.message_sent === true || r.message_sent === 'true';
  });
}

/**
 * Technician added AMC details on this job (reference only — not an official AMC until admin generates).
 * Those jobs should not get the normal completion auto-send.
 */
export function jobHasTechnicianAmcInfo(job: Record<string, unknown>): boolean {
  return requirementsList(job).some((r) => {
    if (!r || typeof r !== 'object') return false;
    const info = r.amc_info;
    return info != null && typeof info === 'object';
  });
}

function resolveCustomerId(job: Record<string, unknown>): string | null {
  const customer = (job.customer as Record<string, unknown> | undefined) || {};
  const id = customer.id || job.customer_id || job.customerId || null;
  return id ? String(id) : null;
}

function resolveCustomerPhone(job: Record<string, unknown>): string {
  const customer = (job.customer as Record<string, unknown> | undefined) || {};
  return String(customer.phone || '').trim();
}

/** Persist message_sent on the job (same shape as admin Send Message). */
export async function markJobCompletionMessageSent(jobId: string, job: Record<string, unknown>) {
  const requirements = requirementsList(job);
  const sentAt = new Date().toISOString();
  const flagIndex = requirements.findIndex((r) => r?.message_sent !== undefined);
  if (flagIndex >= 0) {
    requirements[flagIndex] = {
      ...requirements[flagIndex],
      message_sent: true,
      message_sent_at: sentAt,
    };
  } else {
    let patched = false;
    for (let i = 0; i < requirements.length; i++) {
      const entry = requirements[i];
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        requirements[i] = { ...entry, message_sent: true, message_sent_at: sentAt };
        patched = true;
        break;
      }
    }
    if (!patched) requirements.push({ message_sent: true, message_sent_at: sentAt });
  }
  await db.jobs.update(jobId, { requirements: JSON.stringify(requirements) } as any);
}

export type AutoSendJobCompletionResult =
  | 'sent'
  | 'skipped'
  | 'window_closed'
  | 'failed';

/**
 * After job completion: if auto-send is ON, send brand completion WhatsApp (24h window).
 * Soft-fails — never blocks completion UI.
 */
export async function maybeAutoSendJobCompletionWhatsApp(opts: {
  job: Job | Record<string, unknown>;
  /** When true, skip the settings auto_send check (manual force). */
  force?: boolean;
  /** Show toasts (tech/admin UI). Default true. */
  notify?: boolean;
}): Promise<AutoSendJobCompletionResult> {
  const job = opts.job as Record<string, unknown>;
  const jobId = String(job.id || '');
  if (!jobId) return 'skipped';

  const notify = opts.notify !== false;

  try {
    if (!opts.force) {
      const { settings } = await fetchWhatsAppCrmSettings();
      if (!settings.enabled || settings.allow_job_completion_whatsapp === false) {
        return 'skipped';
      }
      if (settings.auto_send_job_completion_whatsapp !== true) {
        return 'skipped';
      }
    }

    if (jobHasDontSendCompletionMessage(job)) {
      if (notify) {
        toast.message('Completion WhatsApp skipped — technician asked not to message customer');
      }
      return 'skipped';
    }

    if (jobHasTechnicianAmcInfo(job)) {
      if (notify) {
        toast.message('Completion WhatsApp skipped — technician added AMC info on this job');
      }
      return 'skipped';
    }

    if (!opts.force) {
      const leadSource = getLeadSourceFromJob(job);
      let catalog = null;
      try {
        catalog = await ensureLeadCatalogLoaded();
      } catch {
        catalog = null;
      }
      if (isDirectCallOrCustomLeadSource(leadSource, catalog)) {
        const { missingBill } = getCompletedJobMissingMedia(job);
        if (missingBill) {
          if (notify) {
            toast.message(
              'Completion WhatsApp skipped — Direct call / custom lead needs a bill photo first'
            );
          }
          return 'skipped';
        }
      }
    }

    if (jobHasCompletionMessageSent(job)) {
      return 'skipped';
    }

    if (!jobHasSkipReview(job)) {
      try {
        const { createJobReviewInvite } = await import('@/lib/jobReviews');
        const technicianId =
          (job.completed_by as string) ||
          (job.completedBy as string) ||
          (job.assigned_technician_id as string) ||
          (job.assignedTechnicianId as string) ||
          null;
        const invite = await createJobReviewInvite({
          jobId,
          technicianId,
          brand: normalizeDocumentBrand(job.service_brand) || normalizeDocumentBrand(job.serviceBrand),
          skipCache: true,
        });
        if (invite?.url) {
          job.reviewUrl = invite.url;
          job.reviewToken = invite.token;
        }
      } catch (err) {
        console.warn('[job-completion-wa] review invite failed', err);
      }
    }

    const customerId = resolveCustomerId(job);
    const phone = resolveCustomerPhone(job);
    const to = formatPhoneForWhatsApp(phone);
    if (!to || to.length < 10) {
      if (notify) toast.message('Completion WhatsApp skipped — no customer phone');
      return 'skipped';
    }

    const built = buildJobCompletionMessageFromJob(job);
    const brandLabel = getDocumentBrandLabel(built.documentBrand);
    const toastId = notify
      ? toast.loading(`Sending ${brandLabel} completion WhatsApp…`)
      : undefined;

    let payHttpsLink: string | null = null;
    let upiOpts: import('@/lib/pendingPaymentReminder').PendingPaymentWhatsAppUpiOptions | null =
      null;
    let headerImage: {
      imageBase64: string;
      filename?: string;
      mimeType?: string;
    } | null = null;
    if (built.amountPendingValue > 0) {
      try {
        const { accounts } = await fetchUpiPaymentAccounts();
        const account = resolvePreferredUpiAccount(accounts);
        if (account) {
          const share = await buildPendingPaymentUpiShare(
            account,
            built.amountPendingValue,
            built.jobNumber || null,
            { brand: built.documentBrand }
          );
          if (share?.httpsLink) {
            payHttpsLink = share.httpsLink;
            upiOpts = {
              label: share.account.label,
              upiId: share.account.upiId,
              phone: share.account.phone || undefined,
              deepLink: share.deepLink,
              httpsLink: share.httpsLink,
            };
          }
          const png = await generateUpiQrPngBase64({
            upiId: account.upiId,
            payeeName: account.payeeName || account.label,
            amount: built.amountPendingValue,
            note: ['Pending payment', built.jobNumber || ''].filter(Boolean).join(' '),
            phone: account.phone || undefined,
            brand: built.documentBrand,
          });
          if (png) {
            headerImage = {
              imageBase64: png.base64,
              filename: png.filename,
              mimeType: png.mimeType,
            };
          }
        }
      } catch (err) {
        console.warn('[job-completion-wa] UPI share failed', err);
      }
    }

    const whatsappText =
      built.amountPendingValue > 0 && upiOpts
        ? buildJobCompletionWhatsAppMessage({
            customerName: built.customerName,
            serviceType: built.serviceType,
            serviceSubType: built.serviceSubType,
            amountCollected: built.amountCollected,
            amountPending: built.amountPendingValue,
            pendingDueDate: built.pendingDueDate || null,
            jobRef: built.jobNumber || null,
            documentBrand: built.documentBrand,
            upi: upiOpts,
            withQrImage: Boolean(headerImage),
            reviewUrl: typeof job.reviewUrl === 'string' ? job.reviewUrl : null,
          })
        : built.whatsappMessage;

    const result = await sendJobCompletionWhatsApp({
      to,
      text: whatsappText,
      customerId,
      customerName: built.customerName,
      amountCollected: built.amountCollected,
      documentBrand: built.documentBrand,
      serviceType: built.serviceType,
      serviceSubType: built.serviceSubType,
      amountPending: built.amountPendingValue,
      pendingDueDate: built.pendingDueDate || null,
      jobRef: built.jobNumber || null,
      payHttpsLink,
      headerImage,
      reviewUrl: typeof job.reviewUrl === 'string' ? job.reviewUrl : null,
      reviewToken: typeof job.reviewToken === 'string' ? job.reviewToken : null,
      fallbackWaMe: false,
    });

    if (result.ok && result.via === 'api') {
      try {
        await markJobCompletionMessageSent(jobId, job);
      } catch (err) {
        console.warn('[job-completion-wa] mark sent failed', err);
      }
      if (notify && toastId != null) {
        toast.success(
          result.usedTemplate
            ? result.usedRichColdTemplate
              ? `${brandLabel} completion sent (full cold template)`
              : `${brandLabel} completion template sent`
            : `${brandLabel} completion WhatsApp sent`,
          { id: toastId }
        );
      }
      return 'sent';
    }

    if (result.featureDisabled) {
      if (notify && toastId != null) {
        toast.message('Completion WhatsApp skipped (feature off)', { id: toastId });
      }
      return 'skipped';
    }

    if (result.needsWindowOrTemplate) {
      if (notify && toastId != null) {
        toast.message(
          'Completion WhatsApp not sent — 24h window closed and svc_completed not approved yet. Use Send Message manually if needed.',
          { id: toastId, duration: 6000 }
        );
      }
      return 'window_closed';
    }

    if (notify && toastId != null) {
      toast.message(result.error || 'Completion WhatsApp auto-send failed', { id: toastId });
    }
    return 'failed';
  } catch (err) {
    console.warn('[job-completion-wa] auto-send error', err);
    if (notify) toast.message('Completion WhatsApp auto-send failed');
    return 'failed';
  }
}

/** Fire-and-forget wrapper for completion success paths. */
export function queueJobCompletionWhatsAppAutoSend(
  job: Job | Record<string, unknown>,
  opts?: { onResult?: (result: AutoSendJobCompletionResult) => void }
) {
  void maybeAutoSendJobCompletionWhatsApp({ job })
    .then((result) => {
      opts?.onResult?.(result);
    })
    .catch(() => {
      opts?.onResult?.('failed');
    });
}
