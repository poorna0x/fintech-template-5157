import type { DocumentBrand } from '@/lib/service-brands';
import {
  formatBookingTimeSlot,
  formatServiceDate,
  type BookingConfirmationEmailData,
} from '@/lib/booking-confirmation-email';
import { resolveBookingCta } from '@/lib/whatsappBookingCtaTemplates';

export function buildBookingConfirmationWhenLabel(data: {
  scheduledDate?: string;
  scheduledTimeSlot?: string;
}): string {
  const date = data.scheduledDate ? formatServiceDate(data.scheduledDate) : '';
  const time = formatBookingTimeSlot(data.scheduledTimeSlot || '');
  return [date, time].filter(Boolean).join(', ') || 'the scheduled time';
}

export function resolveBookingConfirmationColdTemplate(
  brand: DocumentBrand,
  data: Pick<BookingConfirmationEmailData, 'customerName' | 'jobNumber' | 'scheduledDate' | 'scheduledTimeSlot'>
) {
  const whenLabel = buildBookingConfirmationWhenLabel(data);
  return resolveBookingCta(
    'booking_confirmed',
    brand,
    data.customerName,
    data.jobNumber,
    whenLabel
  );
}

/** Meta-approved shell preview (3 body vars). */
export function formatBookingConfirmationColdPreview(
  brand: DocumentBrand,
  data: Pick<BookingConfirmationEmailData, 'customerName' | 'jobNumber' | 'scheduledDate' | 'scheduledTimeSlot'>
): string {
  const tpl = resolveBookingConfirmationColdTemplate(brand, data);
  const [name, ref, when] = tpl.bodyParams;
  const brandLabel = brand === 'elevenro' ? 'Eleven RO' : 'Hydrogen RO';
  return `Hi ${name}, your ${brandLabel} water purifier service booking ${ref} is confirmed for ${when}. Reply on this chat if you need to change the date or time.`;
}
