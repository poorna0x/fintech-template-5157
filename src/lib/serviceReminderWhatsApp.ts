import type { DocumentBrand } from '@/lib/service-brands';
import { format } from 'date-fns';
import {
  buildCallingWhatsAppMessage,
  callingColdTemplateFor,
  type CallingWhatsAppTemplate,
} from '@/lib/calling-whatsapp-templates';
import type { CallingMessageContext } from '@/lib/calling-whatsapp-templates';
import { parseReminderAtLocalDate } from '@/lib/pendingPaymentReminder';

export function formatServiceReminderWhenLabel(reminderAtYmd: string | null | undefined): string {
  const raw = String(reminderAtYmd || '').trim();
  if (!raw) return 'your upcoming service visit';
  try {
    return format(parseReminderAtLocalDate(raw), 'EEE d MMM yyyy');
  } catch {
    return raw;
  }
}

export function buildServiceReminderWhatsAppMessage(opts: {
  customerName: string;
  reminderTitle?: string;
  intervalMonths?: number | null;
  brand: DocumentBrand;
}): string {
  const name = String(opts.customerName || 'Customer').trim() || 'Customer';
  const title = String(opts.reminderTitle || 'RO service').trim() || 'RO service';
  const every =
    opts.intervalMonths && opts.intervalMonths > 0
      ? `every ${opts.intervalMonths} month${opts.intervalMonths > 1 ? 's' : ''}`
      : 'periodic';

  const ctx: CallingMessageContext = { fullName: name };
  const base = buildCallingWhatsAppMessage(ctx, 'service_due', opts.brand);
  const extra = `Reminder: your scheduled ${title} (${every}).`;
  if (base.includes(name)) {
    return base.replace(
      name,
      `${name}\n\n${extra}`
    );
  }
  return `Hi ${name},\n\n${extra}\n\n${base}`;
}

export function serviceReminderColdTemplate(
  customerName: string,
  whenLabel: string,
  brand: DocumentBrand,
  template: CallingWhatsAppTemplate = 'service_due'
) {
  return callingColdTemplateFor(template, customerName, '', brand, whenLabel);
}
