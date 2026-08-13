import type { DocumentBrand } from '@/lib/service-brands';
import {
  formatBookingTimeSlot,
  formatServiceDate,
  type BookingConfirmationEmailData,
} from '@/lib/booking-confirmation-email';
import { brandLetterClosingLines } from '@/lib/whatsappBrandContact';
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

/** Free-form / preview body — matches svc_booking_confirmed_letter_*_v4 (emoji). */
export function buildBookingConfirmationWhatsAppText(opts: {
  brand: DocumentBrand;
  customerName?: string | null;
  jobNumber?: string | null;
  whenLabel?: string | null;
}): string {
  const brand = opts.brand || 'hydrogenro';
  const brandLabel = brand === 'elevenro' ? 'Eleven RO' : 'Hydrogen RO';
  const name = String(opts.customerName || 'Customer').trim() || 'Customer';
  const ref = String(opts.jobNumber || '').trim() || 'your booking';
  const when = String(opts.whenLabel || '').trim() || 'the scheduled time';
  return [
    `Hi ${name}, 👋`,
    `This is an update from ${brandLabel} regarding your service booking. ✅`,
    '',
    `📋 Booking: ${ref}`,
    `📅 Confirmed for: ${when}`,
    '',
    ...brandLetterClosingLines(brand, { skipChatHint: true, includeTextUs: false }),
    '',
    '💬 Reply on this chat if you need to change the date or time.',
  ].join('\n');
}

/** Meta-approved shell preview (3 body vars). */
export function formatBookingConfirmationColdPreview(
  brand: DocumentBrand,
  data: Pick<BookingConfirmationEmailData, 'customerName' | 'jobNumber' | 'scheduledDate' | 'scheduledTimeSlot'>
): string {
  const whenLabel = buildBookingConfirmationWhenLabel(data);
  return [
    buildBookingConfirmationWhatsAppText({
      brand,
      customerName: data.customerName,
      jobNumber: data.jobNumber,
      whenLabel,
    }),
    '',
    'Buttons: Call us · Website',
  ].join('\n');
}
