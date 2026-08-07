import type { DocumentBrand } from '@/lib/service-brands';
import { getCompanyInfoForBrand, getDocumentBrandLabel } from '@/lib/service-brands';
import { WA_COLD } from '@/lib/whatsappColdTemplates';

export type CallingWhatsAppTemplate =
  | 'service_due'
  | 'easy_booking'
  | 'follow_up'
  | 'contact'
  | 'website'
  | 'custom';

export const CALLING_WA_TEMPLATE_ORDER: CallingWhatsAppTemplate[] = [
  'service_due',
  'easy_booking',
  'follow_up',
  'contact',
  'website',
  'custom',
];

export const CALLING_WA_TEMPLATE_META: Record<
  CallingWhatsAppTemplate,
  { label: string; description: string }
> = {
  service_due: {
    label: 'Service due',
    description: 'Friendly reminder when service is due',
  },
  easy_booking: {
    label: 'Book online',
    description: 'Quick booking link + reply option',
  },
  follow_up: {
    label: 'Follow up',
    description: 'Check in after a visit',
  },
  contact: {
    label: 'General',
    description: 'Offer help and support',
  },
  website: {
    label: 'Website',
    description: 'Share site and contact numbers',
  },
  custom: {
    label: 'Custom',
    description: 'Edit the message below',
  },
};

export type CallingMessageContext = {
  fullName: string;
  daysSinceService?: number | null;
  lastServiceSubType?: string | null;
  deviceBrand?: string | null;
  deviceModel?: string | null;
};

function formatDaysAgo(days: number): string {
  if (days < 30) return `${days} day${days === 1 ? '' : 's'}`;
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months} month${months === 1 ? '' : 's'}`;
  }
  const years = Math.floor(days / 365);
  const remMonths = Math.floor((days % 365) / 30);
  if (remMonths > 0) {
    return `${years} year${years === 1 ? '' : 's'} ${remMonths} month${remMonths === 1 ? '' : 's'}`;
  }
  return `${years} year${years === 1 ? '' : 's'}`;
}

function isMeaningfulEquipment(val?: string | null): boolean {
  if (!val) return false;
  const t = val.trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  return lower !== 'not specified' && lower !== 'n/a' && lower !== 'na';
}

function firstEquipmentPart(value?: string | null): string | null {
  if (!isMeaningfulEquipment(value)) return null;
  const part = (value || '').split(',')[0]?.trim();
  return isMeaningfulEquipment(part) ? part : null;
}

export function callingContextFromCustomer(customer: {
  fullName?: string;
  brand?: string;
  model?: string;
  daysSinceService?: number | null;
  lastServiceSubType?: string | null;
}): CallingMessageContext {
  return {
    fullName: customer.fullName?.trim() || 'Customer',
    daysSinceService: customer.daysSinceService ?? null,
    lastServiceSubType: customer.lastServiceSubType ?? null,
    deviceBrand: firstEquipmentPart(customer.brand),
    deviceModel: firstEquipmentPart(customer.model),
  };
}

function brandFooter(brand: DocumentBrand): string {
  const info = getCompanyInfoForBrand(brand);
  const website = info.website.startsWith('http') ? info.website : `https://${info.website}`;
  const bookingUrl = `${website.replace(/\/$/, '')}/book`;
  return [
    '—',
    brand === 'hydrogenro' ? 'Hydrogen RO Team' : 'Eleven RO Team',
    `📞 ${info.phone}`,
    `🌐 ${website}`,
    `📅 Book online: ${bookingUrl}`,
  ].join('\n');
}

function deviceLine(ctx: CallingMessageContext): string | null {
  if (ctx.deviceBrand && ctx.deviceModel) {
    return `Your purifier: ${ctx.deviceBrand} — ${ctx.deviceModel}`;
  }
  if (ctx.deviceBrand) return `Your purifier: ${ctx.deviceBrand}`;
  return null;
}

function serviceTypeLabel(ctx: CallingMessageContext): string {
  const sub = ctx.lastServiceSubType?.trim();
  if (sub && sub.toLowerCase() !== 'service') return sub;
  return 'RO service';
}

export function buildCallingWhatsAppMessage(
  ctx: CallingMessageContext,
  template: CallingWhatsAppTemplate,
  documentBrand: DocumentBrand
): string {
  const brandName = getDocumentBrandLabel(documentBrand);
  const info = getCompanyInfoForBrand(documentBrand);
  const website = info.website.startsWith('http') ? info.website : `https://${info.website}`;
  const bookingUrl = `${website.replace(/\/$/, '')}/book`;
  const name = ctx.fullName;
  const device = deviceLine(ctx);

  switch (template) {
    case 'service_due': {
      const lines = [`Hi ${name},`, '', `This is ${brandName}.`];
      if (ctx.daysSinceService != null && ctx.daysSinceService > 0) {
        lines.push(
          '',
          `It's been about ${formatDaysAgo(ctx.daysSinceService)} since your last ${serviceTypeLabel(ctx).toLowerCase()}.`
        );
      }
      lines.push(
        '',
        'Your water purifier service is due. Regular service keeps water safe and the unit running well.',
        ...(device ? ['', device] : []),
        '',
        'Would you like to schedule a visit?',
        `💬 Reply to this message`,
        `📞 ${info.phone}`,
        `📅 Or book online: ${bookingUrl}`,
        '',
        brandFooter(documentBrand)
      );
      return lines.join('\n');
    }

    case 'easy_booking':
      return [
        `Hi ${name},`,
        '',
        `Book your next service with ${brandName} in just a few taps 👇`,
        '',
        `📅 ${bookingUrl}`,
        '',
        'Pick your date & time — we’ll confirm on WhatsApp.',
        ...(device ? ['', device] : []),
        '',
        'Prefer a call?',
        `📞 ${info.phone}`,
        `💬 Or reply “BOOK” to this message`,
        '',
        brandFooter(documentBrand),
      ].join('\n');

    case 'follow_up':
      return [
        `Hi ${name},`,
        '',
        `Hope you're doing well! This is ${brandName} checking in after your recent service.`,
        '',
        'Is everything working fine with your water purifier?',
        'Any questions or issues — we’re happy to help.',
        '',
        `📞 ${info.phone}`,
        `💬 Reply to this message`,
        '',
        `Thank you for choosing ${brandName}!`,
        '',
        brandFooter(documentBrand),
      ].join('\n');

    case 'contact':
      return [
        `Hi ${name},`,
        '',
        `This is ${brandName}. We wanted to check if you need any help with your water purifier.`,
        ...(device ? ['', device] : []),
        '',
        'For service, spare parts, or questions:',
        `📞 ${info.phone}`,
        `💬 Reply to this message`,
        `📅 Book online: ${bookingUrl}`,
        '',
        brandFooter(documentBrand),
      ].join('\n');

    case 'website':
      return [
        `Hi ${name},`,
        '',
        `Thank you for being a valued ${brandName} customer!`,
        '',
        `🌐 ${website}`,
        `📅 Book service: ${bookingUrl}`,
        '',
        'For support or inquiries:',
        `📞 ${info.phone}`,
        `💬 WhatsApp: reply here`,
        '',
        brandFooter(documentBrand),
      ].join('\n');

    case 'custom':
    default:
      return [
        `Hi ${name},`,
        '',
        `This is ${brandName}. How can we help you today?`,
        '',
        `📞 ${info.phone}`,
        `📅 Book online: ${bookingUrl}`,
        `💬 Reply to this message`,
        '',
        brandFooter(documentBrand),
      ].join('\n');
  }
}

/** Meta cold template when Calling free-form fails outside the 24h window. */
export function callingColdTemplateFor(
  template: CallingWhatsAppTemplate,
  customerName: string,
  freeformMessage: string
): { name: string; languageCode: string; bodyParams: string[] } {
  const name = String(customerName || 'Customer').trim() || 'Customer';
  if (template === 'service_due') {
    return {
      name: WA_COLD.service_reminder.name,
      languageCode: WA_COLD.service_reminder.language,
      bodyParams: WA_COLD.service_reminder.bodyParams(name),
    };
  }
  if (template === 'follow_up') {
    return {
      name: WA_COLD.customer_followup.name,
      languageCode: WA_COLD.customer_followup.language,
      bodyParams: WA_COLD.customer_followup.bodyParams(name, 'your recent service'),
    };
  }
  if (template === 'easy_booking') {
    return {
      name: WA_COLD.appointment_reminder.name,
      languageCode: WA_COLD.appointment_reminder.language,
      bodyParams: WA_COLD.appointment_reminder.bodyParams(name, 'a convenient time'),
    };
  }
  const notice =
    String(freeformMessage || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'please reply on this chat';
  return {
    name: WA_COLD.general_notice.name,
    languageCode: WA_COLD.general_notice.language,
    bodyParams: WA_COLD.general_notice.bodyParams(name, notice),
  };
}
