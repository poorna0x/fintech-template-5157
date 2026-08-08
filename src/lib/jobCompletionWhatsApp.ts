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
import { formatPhoneForWhatsApp } from '@/lib/utils';
import { parseRequirements } from '@/lib/followUpToOngoing';
import { buildJobCompletionMessageFromJob } from '@/lib/job-completion-message';
import { sendAdminWhatsAppTextWithOptionalTemplate } from '@/lib/sendAdminWhatsAppApi';
import { fetchWhatsAppCrmSettings } from '@/lib/whatsappCrmSettings';
import { getDocumentBrandLabel } from '@/lib/service-brands';
import { WA_COLD } from '@/lib/whatsappColdTemplates';
import type { Job } from '@/types';

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

    if (jobHasCompletionMessageSent(job)) {
      return 'skipped';
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

    const result = await sendAdminWhatsAppTextWithOptionalTemplate({
      to,
      text: built.whatsappMessage,
      customerId,
      source: 'job_completion',
      fallbackWaMe: false,
      coldTemplate: {
        name: WA_COLD.job_completion.name,
        languageCode: WA_COLD.job_completion.language,
        bodyParams: WA_COLD.job_completion.bodyParams(
          built.customerName,
          built.amountCollected
        ),
      },
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
            ? `${brandLabel} completion template sent`
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
