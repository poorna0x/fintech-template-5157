import { toast } from 'sonner';
import { getJobCustomTimeLabel, getLeadSourceFromJob } from '@/lib/adminUtils';
import { getJobLocationLabelForWhatsApp } from '@/lib/customer-locations';
import { getJobAgreedCostLabel, getJobDescriptionText } from '@/lib/jobAssignMessageDetails';
import { getTechnicianAdminWhatsAppPhone } from '@/lib/technicianContact';
import {
  openWhatsAppMeDeepLink,
  sendAdminWhatsAppText,
} from '@/lib/sendAdminWhatsAppApi';
import { ensureJobWhatsAppNotifyPrefs } from '@/lib/jobAssignWhatsAppSettingsCache';
import { isWhatsAppJobNotifyAllowed } from '@/lib/whatsappCrmSettings';
import type { Job } from '@/types';
import type { OpenAdminWhatsappForJobCtx } from '@/lib/openAdminWhatsappForJobAssign';

export type JobTechWhatsAppMode = 'assign' | 'unassign';

export type TechLikeForWhatsApp = {
  id?: string;
  fullName: string;
  phone: string;
  whatsappPhone?: string;
  whatsapp_phone?: string;
};

export function buildJobTechnicianWhatsAppMessage(opts: {
  mode: JobTechWhatsAppMode;
  serviceSubType: string;
  customerName: string;
  location?: string;
  leadSource?: string;
  customTime?: string;
  description?: string;
  agreedCost?: string;
}): string {
  const locationText = opts.location?.trim() ?? '';
  const leadSourceText = opts.leadSource?.trim() ?? '';
  const customTimeText = opts.customTime?.trim() ?? '';
  const descriptionText = opts.description?.trim() ?? '';
  const agreedCostText = opts.agreedCost?.trim() ?? '';
  const isUnassign = opts.mode === 'unassign';
  const serviceSubType = opts.serviceSubType || 'Service';
  const customerName = opts.customerName || 'Customer';

  const mainLine = isUnassign
    ? `Job unassigned - ${customerName}${locationText ? ` - ${locationText}` : ''} (${serviceSubType})`
    : `New ${serviceSubType.toLowerCase()} assigned - ${customerName}${locationText ? ` - ${locationText}` : ''}${leadSourceText ? ` - ${leadSourceText}` : ''}`;

  const extraLines: string[] = [];
  if (!isUnassign && customTimeText) extraLines.push(`Time : ${customTimeText}`);
  if (!isUnassign && agreedCostText) extraLines.push(`Agreed cost : ${agreedCostText}`);
  if (descriptionText) {
    extraLines.push(isUnassign ? descriptionText : `Description : ${descriptionText}`);
  }
  return extraLines.length > 0 ? `${mainLine}\n\n${extraLines.join('\n')}` : mainLine;
}

export function buildJobTechnicianWhatsAppPayload(
  job: Job,
  mode: JobTechWhatsAppMode
): {
  serviceSubType: string;
  customerName: string;
  location: string;
  leadSource: string;
  customTime: string;
  description: string;
  agreedCost: string;
  message: string;
} {
  const serviceSubType =
    (job as { service_sub_type?: string; serviceSubType?: string }).service_sub_type ||
    job.serviceSubType ||
    'Service';
  const customerFromJob = (job.customer as Record<string, unknown>) || {};
  const customerName =
    (customerFromJob.full_name as string) ||
    (customerFromJob.fullName as string) ||
    'Customer';
  const location = getJobLocationLabelForWhatsApp(
    job as { service_site?: string; service_address?: unknown },
    customerFromJob
  );

  if (mode === 'unassign') {
    const description = 'This job was unassigned from you.';
    return {
      serviceSubType,
      customerName,
      location: location || '',
      leadSource: 'Unassigned',
      customTime: '',
      description,
      agreedCost: '',
      message: buildJobTechnicianWhatsAppMessage({
        mode,
        serviceSubType,
        customerName,
        location,
        description,
      }),
    };
  }

  const leadSource = getLeadSourceFromJob(job as Record<string, unknown>);
  const customTime = getJobCustomTimeLabel(job as Record<string, unknown>) || '';
  const description = getJobDescriptionText(job as Record<string, unknown>);
  const agreedCost = getJobAgreedCostLabel(job as Record<string, unknown>);
  return {
    serviceSubType,
    customerName,
    location: location || '',
    leadSource,
    customTime,
    description,
    agreedCost,
    message: buildJobTechnicianWhatsAppMessage({
      mode,
      serviceSubType,
      customerName,
      location,
      leadSource,
      customTime,
      description,
      agreedCost,
    }),
  };
}

async function autoSendJobTechWhatsApp(
  phone: string,
  message: string,
  mode: JobTechWhatsAppMode
): Promise<'api' | 'wa_me' | 'failed'> {
  const toastId = toast.loading(
    mode === 'unassign' ? 'Auto-sending unassign WhatsApp…' : 'Auto-sending assign WhatsApp…'
  );
  try {
    const result = await sendAdminWhatsAppText({
      to: phone,
      text: message,
      fallbackWaMe: false,
    });
    if (result.ok && result.via === 'api') {
      toast.success('WhatsApp sent to technician via API', { id: toastId });
      return 'api';
    }
    openWhatsAppMeDeepLink(phone, message);
    toast.success(
      result.needsWindowOrTemplate || result.featureDisabled
        ? 'Opened phone WhatsApp (API window closed or unavailable)'
        : 'Opened phone WhatsApp',
      { id: toastId }
    );
    return 'wa_me';
  } catch {
    openWhatsAppMeDeepLink(phone, message);
    toast.success('Opened phone WhatsApp', { id: toastId });
    return 'wa_me';
  }
}

export type NotifyJobTechWhatsAppResult = 'auto' | 'dialog' | 'skipped';

/**
 * After assign/reassign/unassign:
 * - Dashboard master OFF → skipped (no popup)
 * - Auto-send ON (WhatsApp Settings) → Cloud API (wa.me backup), no dialog
 * - Else if ctx → manual dialog (wa.me only on Send)
 * - Else → skipped
 */
export async function notifyTechnicianJobWhatsApp(opts: {
  job: Job;
  technician: TechLikeForWhatsApp;
  mode: JobTechWhatsAppMode;
  scrollY?: number;
  ctx?: OpenAdminWhatsappForJobCtx | null;
}): Promise<NotifyJobTechWhatsAppResult> {
  const category = opts.mode === 'unassign' ? 'job_unassign' : 'job_assign';
  const techId = opts.technician.id || '';
  const phone =
    getTechnicianAdminWhatsAppPhone(opts.technician) || opts.technician.phone || '';

  if (!phone.trim()) {
    return 'skipped';
  }

  const allowed = await isWhatsAppJobNotifyAllowed(category, techId || null);
  if (!allowed.ok) {
    if (opts.mode === 'assign') {
      toast.message(allowed.reason || 'Job WhatsApp notify is off — skipped');
    }
    return 'skipped';
  }

  const prefs = await ensureJobWhatsAppNotifyPrefs();
  const autoSend = opts.mode === 'unassign' ? prefs.autoUnassign : prefs.autoAssign;

  const payload = buildJobTechnicianWhatsAppPayload(opts.job, opts.mode);

  if (autoSend) {
    await autoSendJobTechWhatsApp(phone, payload.message, opts.mode);
    return 'auto';
  }

  if (!opts.ctx) {
    return 'skipped';
  }

  const scrollY = opts.scrollY ?? window.scrollY;
  opts.ctx.scrollPositionBeforeWhatsAppRef.current = scrollY;
  opts.ctx.setWhatsappTechnician({
    name: opts.technician.fullName,
    phone,
  });
  opts.ctx.setWhatsappServiceSubType(payload.serviceSubType);
  opts.ctx.setWhatsappCustomerName(payload.customerName);
  opts.ctx.setWhatsappLocation(payload.location);
  opts.ctx.setWhatsappLeadSource(payload.leadSource);
  opts.ctx.setWhatsappCustomTime(payload.customTime);
  opts.ctx.setWhatsappDescription(payload.description);
  opts.ctx.setWhatsappAgreedCost(payload.agreedCost);
  opts.ctx.openAdminWhatsappModal();
  opts.ctx.setWhatsappDialogOpen(true);
  return 'dialog';
}
