import type {
  AdminDocumentEmailData,
  AdminEmailTemplateType,
} from '@/lib/admin-email-templates';
import type { BookingConfirmationEmailData } from '@/lib/booking-confirmation-email';
import { resolveBookingConfirmationColdTemplate } from '@/lib/bookingConfirmationWhatsApp';
import {
  callingColdTemplateFor,
  type CallingWhatsAppTemplate,
} from '@/lib/calling-whatsapp-templates';
import { WA_COLD } from '@/lib/whatsappColdTemplates';
import type { DocumentBrand } from '@/lib/service-brands';

/** Map composer template → cold Meta template when 24h window is closed. */
export function resolveComposerColdTemplate(
  templateType: AdminEmailTemplateType,
  brand: DocumentBrand,
  opts: {
    customerName: string;
    freeformMessage: string;
    bookingForm?: BookingConfirmationEmailData;
    documentForm?: AdminDocumentEmailData;
  }
): { name: string; languageCode: string; bodyParams: string[] } | null {
  const name = String(opts.customerName || 'Customer').trim() || 'Customer';

  if (templateType === 'booking_confirmation' && opts.bookingForm) {
    const tpl = resolveBookingConfirmationColdTemplate(brand, opts.bookingForm);
    return { name: tpl.name, languageCode: tpl.language, bodyParams: tpl.bodyParams };
  }

  if (templateType === 'service_reminder') {
    const when =
      String(opts.documentForm?.dueDate || '').trim() || 'your upcoming service visit';
    return {
      name: WA_COLD.service_reminder.name,
      languageCode: WA_COLD.service_reminder.language,
      bodyParams: WA_COLD.service_reminder.bodyParams(name, when),
    };
  }

  if (templateType === 'tech_running_late') {
    const when =
      String(opts.documentForm?.dueDate || '').trim() || 'your scheduled visit';
    return {
      name: WA_COLD.tech_delayed.name,
      languageCode: WA_COLD.tech_delayed.language,
      bodyParams: WA_COLD.tech_delayed.bodyParams(name, when),
    };
  }

  const callingMap: Partial<Record<AdminEmailTemplateType, CallingWhatsAppTemplate>> = {
    general: 'contact',
  };
  const callingKey = callingMap[templateType];
  if (callingKey) {
    const cold = callingColdTemplateFor(callingKey, name, opts.freeformMessage, brand);
    return {
      name: cold.name,
      languageCode: cold.languageCode,
      bodyParams: cold.bodyParams,
    };
  }

  return {
    name: WA_COLD.general_notice.name,
    languageCode: WA_COLD.general_notice.language,
    bodyParams: WA_COLD.general_notice.bodyParams(name),
  };
}

export function formatComposerColdPreview(
  templateType: AdminEmailTemplateType,
  brand: DocumentBrand,
  opts: Parameters<typeof resolveComposerColdTemplate>[2]
): string | null {
  const cold = resolveComposerColdTemplate(templateType, brand, opts);
  if (!cold) return null;
  return `${cold.name}: ${cold.bodyParams.join(' · ')}`;
}
