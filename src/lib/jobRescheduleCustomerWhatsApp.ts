import { formatCustomTimeLabel } from '@/lib/adminUtils';
import { resolveCustomerSendBrand } from '@/lib/admin-email-sources';
import { formatPhoneForWhatsApp } from '@/lib/utils';
import type { DocumentBrand } from '@/lib/service-brands';
import { normalizeDocumentBrand } from '@/lib/service-brands';
import { fetchWhatsAppCrmSettings } from '@/lib/whatsappCrmSettings';
import {
  buildJobRescheduleWhatsAppMessage,
  resolveColdRescheduleVisit,
  sendUtilityWhatsAppWithColdFallback,
} from '@/lib/whatsappUtilityTemplates';
import type { JobEditSnapshot } from '@/lib/notifyTechJobEdit';

function scheduleWhenLabel(snap: JobEditSnapshot): string {
  const date = String(snap.scheduledDate || '').trim() || 'date TBD';
  let time = snap.scheduledTimeSlot || '';
  if (time === 'CUSTOM' && snap.scheduledTimeCustom) {
    time = formatCustomTimeLabel(snap.scheduledTimeCustom) || snap.scheduledTimeCustom;
  } else if (time === 'FLEXIBLE') {
    time = 'Flexible';
  } else {
    const slotMap: Record<string, string> = {
      MORNING: 'Morning',
      AFTERNOON: 'Afternoon',
      EVENING: 'Evening',
    };
    time = slotMap[time] || time || 'time TBD';
  }
  return `${date}, ${time}`;
}

export function jobScheduleChanged(before: JobEditSnapshot, after: JobEditSnapshot): boolean {
  const norm = (s: string | null | undefined) => String(s ?? '').trim();
  return (
    norm(before.scheduledDate) !== norm(after.scheduledDate) ||
    norm(before.scheduledTimeSlot) !== norm(after.scheduledTimeSlot) ||
    norm(before.scheduledTimeCustom) !== norm(after.scheduledTimeCustom)
  );
}

/** Soft-fail customer WhatsApp when admin reschedules a job. */
export async function maybeNotifyCustomerJobReschedule(opts: {
  customerPhone?: string | null;
  customerName: string;
  customerId?: string | null;
  brand?: DocumentBrand | string | null;
  before: JobEditSnapshot;
  after: JobEditSnapshot;
}): Promise<void> {
  if (!jobScheduleChanged(opts.before, opts.after)) return;

  const phone = formatPhoneForWhatsApp(String(opts.customerPhone || ''));
  if (!phone) return;

  try {
    const settings = await fetchWhatsAppCrmSettings();
    if (!settings.enabled || !settings.allow_service_reminder) return;

    let brand: DocumentBrand = normalizeDocumentBrand(opts.brand) || 'hydrogenro';
    if (opts.customerId) {
      const resolved = await resolveCustomerSendBrand(opts.customerId, brand);
      brand = resolved.sendBrand;
    }
    const whenLabel = scheduleWhenLabel(opts.after);
    const text = buildJobRescheduleWhatsAppMessage(opts.customerName, whenLabel, brand);
    const cold = resolveColdRescheduleVisit(brand, opts.customerName, whenLabel);

    await sendUtilityWhatsAppWithColdFallback({
      to: phone,
      text,
      customerId: opts.customerId,
      source: 'service_reminder',
      coldTemplate: cold,
      fallbackWaMe: false,
    });
  } catch (err) {
    console.warn('[jobRescheduleCustomerWhatsApp]', err);
  }
}
