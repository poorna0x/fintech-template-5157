import type { DocumentBrand } from '@/lib/service-brands';
import { getCompanyInfoForBrand, getDocumentBrandLabel } from '@/lib/service-brands';
import { WA_COLD } from '@/lib/whatsappColdTemplates';
import { resolveBookingCta } from '@/lib/whatsappBookingCtaTemplates';
import {
  waBrandBookingUrl,
  waBrandWebsiteUrl,
  waLabeledLink,
  waLabeledValue,
} from '@/lib/whatsappMessageFormat';

export type CallingWhatsAppTemplate =
  | 'service_due'
  | 'easy_booking'
  | 'missed_call'
  | 'follow_up'
  | 'contact'
  | 'website'
  | 'custom';

export const CALLING_WA_TEMPLATE_ORDER: CallingWhatsAppTemplate[] = [
  'service_due',
  'easy_booking',
  'missed_call',
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
  missed_call: {
    label: 'Missed call',
    description: 'Callback after a missed customer call',
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
  const website = waBrandWebsiteUrl(info.website);
  const bookingUrl = waBrandBookingUrl(info.website);
  return [
    '—',
    brand === 'hydrogenro' ? 'Hydrogen RO Team' : 'Eleven RO Team',
    waLabeledValue('📞', 'Phone', info.phone),
    waLabeledLink('🌐', 'Website', website),
    waLabeledLink('📅', 'Book online', bookingUrl),
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
  const website = waBrandWebsiteUrl(info.website);
  const bookingUrl = waBrandBookingUrl(info.website);
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
        waLabeledValue('📞', 'Phone', info.phone),
        waLabeledLink('📅', 'Book online', bookingUrl),
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
        waLabeledLink('📅', 'Book online', bookingUrl),
        '',
        'Pick your date & time — we’ll confirm on WhatsApp.',
        ...(device ? ['', device] : []),
        '',
        'Prefer a call?',
        waLabeledValue('📞', 'Phone', info.phone),
        `💬 Or reply “BOOK” to this message`,
        '',
        brandFooter(documentBrand),
      ].join('\n');

    case 'missed_call':
      return [
        `Hi ${name},`,
        '',
        `This is ${brandName}. We tried to reach you and could not connect.`,
        '',
        'Please reply on this chat so we can assist with your RO service,',
        'or call / book online below.',
        '',
        waLabeledValue('📞', 'Phone', info.phone),
        waLabeledLink('📅', 'Book online', bookingUrl),
        `💬 Reply here`,
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
        waLabeledValue('📞', 'Phone', info.phone),
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
        waLabeledValue('📞', 'Phone', info.phone),
        `💬 Reply to this message`,
        waLabeledLink('📅', 'Book online', bookingUrl),
        '',
        brandFooter(documentBrand),
      ].join('\n');

    case 'website':
      return [
        `Hi ${name},`,
        '',
        `Thank you for being a valued ${brandName} customer!`,
        '',
        waLabeledLink('🌐', 'Website', website),
        waLabeledLink('📅', 'Book service', bookingUrl),
        '',
        'For support or inquiries:',
        waLabeledValue('📞', 'Phone', info.phone),
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
        waLabeledValue('📞', 'Phone', info.phone),
        waLabeledLink('📅', 'Book online', bookingUrl),
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
  freeformMessage: string,
  documentBrand: DocumentBrand = 'elevenro',
  whenLabel?: string
): { name: string; languageCode: string; bodyParams: string[] } {
  const name = String(customerName || 'Customer').trim() || 'Customer';
  const when =
    String(whenLabel || '').trim() ||
    'your upcoming visit';
  if (template === 'service_due') {
    return {
      name: WA_COLD.service_reminder.name,
      languageCode: WA_COLD.service_reminder.language,
      bodyParams: WA_COLD.service_reminder.bodyParams(name, when),
    };
  }
  if (template === 'follow_up') {
    return {
      name: WA_COLD.service_reminder.name,
      languageCode: WA_COLD.service_reminder.language,
      bodyParams: WA_COLD.service_reminder.bodyParams(name, 'after your recent service'),
    };
  }
  if (template === 'easy_booking') {
    // Dual-brand booking CTA (*_ero_cta / *_hro_cta). Falls back if not yet APPROVED at send time.
    const booking = resolveBookingCta('book_existing_customer', documentBrand, name);
    return {
      name: booking.name,
      languageCode: booking.language,
      bodyParams: booking.bodyParams,
    };
  }
  if (template === 'missed_call') {
    return {
      name: WA_COLD.missed_call.name,
      languageCode: WA_COLD.missed_call.language,
      bodyParams: WA_COLD.missed_call.bodyParams(name),
    };
  }
  if (template === 'contact' || template === 'website') {
    return {
      name: WA_COLD.general_notice.name,
      languageCode: WA_COLD.general_notice.language,
      bodyParams: WA_COLD.general_notice.bodyParams(name),
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
