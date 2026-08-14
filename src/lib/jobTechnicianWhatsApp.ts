import { toast } from 'sonner';
import { getJobCustomTimeLabel, getLeadSourceFromJob } from '@/lib/adminUtils';
import { getJobLocationLabelForWhatsApp } from '@/lib/customer-locations';
import { getJobAgreedCostLabel, getJobDescriptionText } from '@/lib/jobAssignMessageDetails';
import { getTechnicianAdminWhatsAppPhone } from '@/lib/technicianContact';
import { waPlainLabelValue } from '@/lib/whatsappMessageFormat';
import { sendAdminWhatsAppText } from '@/lib/sendAdminWhatsAppApi';
import { ensureJobWhatsAppNotifyPrefs } from '@/lib/jobAssignWhatsAppSettingsCache';
import { isWhatsAppJobNotifyAllowed } from '@/lib/whatsappCrmSettings';
import { supabase } from '@/lib/supabaseClient';
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
  if (!isUnassign && customTimeText) extraLines.push(waPlainLabelValue('Time', customTimeText));
  if (!isUnassign && agreedCostText) extraLines.push(waPlainLabelValue('Agreed cost', agreedCostText));
  if (descriptionText) {
    extraLines.push(
      isUnassign ? descriptionText : waPlainLabelValue('Description', descriptionText)
    );
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
): Promise<'api' | 'failed'> {
  const toastId = toast.loading(
    mode === 'unassign' ? 'Sending unassign WhatsApp…' : 'Sending assign WhatsApp…'
  );
  try {
    const result = await sendAdminWhatsAppText({
      to: phone,
      text: message,
      fallbackWaMe: false,
    });
    if (result.ok && result.via === 'api') {
      toast.success('WhatsApp sent to technician', { id: toastId });
      return 'api';
    }
    // Auto-send stays in-app: do not open wa.me (that steals focus after assign).
    toast.message(
      result.needsWindowOrTemplate
        ? 'WhatsApp API window closed — message not sent (open chat or use manual dialog)'
        : result.featureDisabled
          ? 'WhatsApp send skipped (feature off)'
          : 'WhatsApp auto-send failed',
      { id: toastId }
    );
    return 'failed';
  } catch {
    toast.message('WhatsApp auto-send failed', { id: toastId });
    return 'failed';
  }
}

export type NotifyJobTechWhatsAppResult = 'auto' | 'dialog' | 'skipped';

/** Per-tech WhatsApp off or Dashboard master off → silent skip (admin already chose that). */
function shouldToastJobWhatsAppSkip(reason?: string): boolean {
  const r = String(reason || '');
  if (!r.trim()) return false;
  if (/disabled for this technician/i.test(r)) return false;
  if (/Job WhatsApp is off/i.test(r)) return false;
  if (/Dashboard Settings/i.test(r)) return false;
  return true;
}

/**
 * After assign/reassign/unassign:
 * - Dashboard master OFF → skipped (no popup)
 * - Per-tech job_assigned / job_unassigned OFF → skipped silently (no dialog, no toast)
 * - Auto-send ON → return immediately; Cloud API runs in background (no dialog, no wa.me)
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
  const category = opts.mode === 'unassign' ? 'job_unassigned' : 'job_assigned';
  const techId = opts.technician.id || '';
  const phone =
    getTechnicianAdminWhatsAppPhone(opts.technician) || opts.technician.phone || '';

  if (!phone.trim()) {
    return 'skipped';
  }

  // Cache-first master + auto flags (0 egress when warm) so assign UI can close instantly.
  const prefs = await ensureJobWhatsAppNotifyPrefs();
  if (!prefs.enabled) {
    return 'skipped';
  }

  // Check per-tech + master before dialog / auto-send — no WhatsApp UI when disabled.
  const allowed = await isWhatsAppJobNotifyAllowed(category, techId || null);
  if (!allowed.ok) {
    if (opts.mode === 'assign' && shouldToastJobWhatsAppSkip(allowed.reason)) {
      toast.message(allowed.reason || 'Job WhatsApp notify is off — skipped');
    }
    return 'skipped';
  }

  const autoSend = opts.mode === 'unassign' ? prefs.autoUnassign : prefs.autoAssign;
  const payload = buildJobTechnicianWhatsAppPayload(opts.job, opts.mode);

  if (autoSend) {
    // Fire-and-forget: do not block assign/unassign dialogs on API latency.
    void autoSendJobTechWhatsApp(phone, payload.message, opts.mode);
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

/**
 * Background WhatsApp for job updates / team / visit-order (no dialog).
 * Needs Dashboard job WhatsApp master ON. Does NOT require Auto-send
 * (Auto-send only controls assign/unassign dialog vs instant).
 */
export function queueTechnicianJobWhatsAppAutoMessage(opts: {
  technicianId: string;
  category?: 'job_assigned' | 'job_unassigned';
  title: string;
  body: string;
  phone?: string;
  whatsappPhone?: string;
  /** When true, show why send was skipped (edit job). */
  notifyIfSkipped?: boolean;
}): void {
  const category = opts.category || 'job_assigned';
  const notify = opts.notifyIfSkipped === true;
  void (async () => {
    try {
      const prefs = await ensureJobWhatsAppNotifyPrefs();
      if (!prefs.enabled) {
        return;
      }

      const allowed = await isWhatsAppJobNotifyAllowed(category, opts.technicianId);
      if (!allowed.ok) {
        if (notify && shouldToastJobWhatsAppSkip(allowed.reason)) {
          toast.message(allowed.reason || 'WhatsApp notify skipped for this technician');
        }
        return;
      }

      let phone =
        getTechnicianAdminWhatsAppPhone({
          phone: opts.phone || '',
          whatsappPhone: opts.whatsappPhone,
          whatsapp_phone: opts.whatsappPhone,
        }) || '';

      if (!phone.trim()) {
        const { data } = await supabase
          .from('technicians')
          .select('phone, whatsapp_phone')
          .eq('id', opts.technicianId)
          .maybeSingle();
        phone =
          getTechnicianAdminWhatsAppPhone({
            phone: data?.phone || '',
            whatsapp_phone: data?.whatsapp_phone,
          }) || '';
      }
      if (!phone.trim()) {
        if (notify) toast.message('No technician phone for WhatsApp');
        return;
      }

      const title = String(opts.title || '').trim();
      const body = String(opts.body || '').trim();
      const text = title && body ? `*${title}*\n\n${body}` : title || body;
      if (!text.trim()) return;

      await autoSendJobTechWhatsApp(
        phone,
        text,
        category === 'job_unassigned' ? 'unassign' : 'assign'
      );
    } catch (err) {
      console.warn('[job-wa] edit/update notify failed', err);
      if (notify) toast.message('WhatsApp notify failed');
    }
  })();
}
