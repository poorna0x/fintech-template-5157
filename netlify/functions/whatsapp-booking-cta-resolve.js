/**
 * Server-side booking CTA template resolver (mirrors src/lib/whatsappBookingCtaTemplates.ts).
 */

function brandSuffix(brand) {
  return String(brand || '').toLowerCase() === 'elevenro' ? 'ero' : 'hro';
}

function cleanName(name) {
  return String(name || 'Customer').trim() || 'Customer';
}

function resolveBrandFromBookingSource(source, domain) {
  const raw = String(source || domain || '').toLowerCase();
  if (raw.includes('eleven')) return 'elevenro';
  if (raw.includes('hydrogen')) return 'hydrogenro';
  return 'hydrogenro';
}

function bookingCtaTemplateName(kind, brand) {
  const suffix = brandSuffix(brand);
  if (kind === 'book_existing_customer') return `existing_service_schedule_${suffix}_cta`;
  if (kind === 'missed_call_book') return `missed_call_callback_${suffix}_cta`;
  if (kind === 'book_new_customer') return `unregistered_number_service_${suffix}_cta`;
  if (kind === 'booking_confirmed') return `svc_booking_confirmed_${suffix}`;
  return `${kind}_${suffix}_cta`;
}

/**
 * @param {'book_existing_customer'|'book_new_customer'|'missed_call_book'|'reschedule_visit'|'booking_confirmed'} kind
 * @param {'elevenro'|'hydrogenro'} brand
 * @param {...string} paramArgs
 */
function resolveBookingCta(kind, brand, ...paramArgs) {
  const customerName = cleanName(paramArgs[0]);
  const templateName = bookingCtaTemplateName(kind, brand);

  if (kind === 'booking_confirmed') {
    return {
      name: templateName,
      language: 'en',
      bodyParams: [
        customerName,
        String(paramArgs[1] || '').trim() || 'your booking',
        String(paramArgs[2] || '').trim() || 'the scheduled time',
      ],
    };
  }
  if (kind === 'reschedule_visit') {
    return {
      name: templateName,
      language: 'en',
      bodyParams: [
        customerName,
        String(paramArgs[1] || '').trim() || 'your scheduled visit',
      ],
    };
  }
  return {
    name: templateName,
    language: 'en',
    bodyParams: [customerName],
  };
}

function formatBookingTimeSlot(timeSlot) {
  const map = {
    FIRST_HALF: 'Morning (9 AM - 2 PM)',
    SECOND_HALF: 'Afternoon (2 PM - 8 PM)',
    MORNING: 'Morning (9 AM - 12 PM)',
    AFTERNOON: 'Afternoon (12 PM - 5 PM)',
    EVENING: 'Evening (5 PM - 8 PM)',
    morning: 'Morning (9 AM - 12 PM)',
    afternoon: 'Afternoon (12 PM - 5 PM)',
    evening: 'Evening (5 PM - 8 PM)',
  };
  const key = String(timeSlot || '').trim();
  return map[key] || key || 'the scheduled time';
}

function formatServiceDate(scheduledDate) {
  const raw = String(scheduledDate || '').trim();
  if (!raw) return '';
  try {
    return new Date(raw).toLocaleDateString('en-IN', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return raw;
  }
}

function buildBookingWhenLabel(scheduledDate, scheduledTimeSlot, customTime) {
  const custom = String(customTime || '').trim();
  if (custom) return custom.slice(0, 160);
  const date = formatServiceDate(scheduledDate);
  const time = formatBookingTimeSlot(scheduledTimeSlot);
  return [date, time].filter(Boolean).join(', ') || 'the scheduled time';
}

module.exports = {
  brandSuffix,
  resolveBrandFromBookingSource,
  resolveBookingCta,
  buildBookingWhenLabel,
  formatBookingTimeSlot,
  formatServiceDate,
};
