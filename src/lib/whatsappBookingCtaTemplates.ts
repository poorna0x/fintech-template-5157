/**
 * Dual-brand booking CTAs for one WhatsApp number (Eleven RO line).
 *
 * Meta template body + Book URL are fixed at approval time, so each use-case
 * has TWO templates:
 *   - *_ero_cta  → Eleven RO + https://elevenro.com/book
 *   - *_hro_cta  → Hydrogen RO + https://hydrogenro.com/book
 *
 * CRM picks by DocumentBrand when sending. Call button uses the shared line.
 *
 * Submit: node scripts/submit-whatsapp-booking-cta-templates.mjs --submit
 */

import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel } from '@/lib/service-brands';

export const WA_BOOKING_CTA_BUTTONS = {
  callDisplay: 'Call us',
  /** Eleven RO business line on this WABA */
  callPhone: '+918884944288',
  bookDisplay: 'Book online',
  bookUrl: {
    elevenro: 'https://elevenro.com/book',
    hydrogenro: 'https://hydrogenro.com/book',
  },
} as const;

type BookingCtaKind =
  | 'book_existing_customer'
  | 'book_new_customer'
  | 'missed_call_book'
  | 'reschedule_visit'
  | 'booking_confirmed';

type BrandSuffix = 'ero' | 'hro';

function brandSuffix(brand: DocumentBrand): BrandSuffix {
  return brand === 'elevenro' ? 'ero' : 'hro';
}

function brandCopy(brand: DocumentBrand): {
  label: string;
  short: string;
} {
  const label = getDocumentBrandLabel(brand);
  return { label, short: label };
}

/** Meta template name for a booking CTA + brand. */
export function bookingCtaTemplateName(kind: BookingCtaKind, brand: DocumentBrand): string {
  const suffix = brandSuffix(brand);
  // Avoid marketing-prone names Meta reclassifies.
  if (kind === 'book_existing_customer') {
    return `existing_service_schedule_${suffix}_cta`;
  }
  if (kind === 'missed_call_book') {
    return `missed_call_callback_${suffix}_cta`;
  }
  if (kind === 'book_new_customer') {
    // Avoid marketing-prone “new_customer_*” names Meta reclassifies.
    return `unregistered_number_service_${suffix}_cta`;
  }
  if (kind === 'booking_confirmed') {
    // Phone-only UTILITY (no Book online URL) — faster Meta approval.
    return `svc_booking_confirmed_${suffix}`;
  }
  return `${kind}_${suffix}_cta`;
}

export function bookingCtaBookUrl(brand: DocumentBrand): string {
  return WA_BOOKING_CTA_BUTTONS.bookUrl[brand];
}

export const WA_BOOKING_CTA_KINDS: BookingCtaKind[] = [
  'book_existing_customer',
  'book_new_customer',
  'missed_call_book',
  'reschedule_visit',
  'booking_confirmed',
];

export function bookingCtaBody(
  kind: BookingCtaKind,
  brand: DocumentBrand
): { text: string; sampleParams: string[]; bodyParams: (...args: string[]) => string[] } {
  const { label } = brandCopy(brand);

  switch (kind) {
    case 'book_existing_customer':
      // UTILITY framing (account/service schedule) — not “come book with us” marketing.
      return {
        text: `Hi {{1}}, this is ${label}. Our records show your RO service visit can be scheduled. Please reply BOOK on this chat to confirm a convenient time, or use Call / Book below for assistance.`,
        sampleParams: ['Rahul'],
        bodyParams: (customerName: string) => [cleanName(customerName)],
      };
    case 'book_new_customer':
      // UTILITY framing — unlinked number registration, not a “new customer” promo.
      return {
        text: `Hi {{1}}, this is ${label}. This WhatsApp number is not linked to a service account in our system. Reply BOOK on this chat with your name and service address to register your request, or use Call / Book below for assistance.`,
        sampleParams: ['there'],
        bodyParams: (customerName: string) => [cleanName(customerName) || 'there'],
      };
    case 'missed_call_book':
      // UTILITY framing — callback on missed contact, not a promo book blast.
      return {
        text: `Hi {{1}}, this is ${label}. We tried to reach you and could not connect. Please reply on this chat so we can assist with your RO service, or use Call / Book below.`,
        sampleParams: ['Rahul'],
        bodyParams: (customerName: string) => [cleanName(customerName)],
      };
    case 'reschedule_visit':
      return {
        text: `Hi {{1}}, your ${label} visit is set for {{2}}. To reschedule, reply on this chat or use Call / Book online below.`,
        sampleParams: ['Rahul', 'Mon 12 Aug, 10:00 AM'],
        bodyParams: (customerName: string, whenLabel: string) => [
          cleanName(customerName),
          String(whenLabel || '').trim() || 'your scheduled visit',
        ],
      };
    case 'booking_confirmed':
      return {
        text: `Hi {{1}}, your ${label} water purifier service booking {{2}} is confirmed for {{3}}. Reply on this chat if you need to change the date or time.`,
        sampleParams: ['Rahul', 'RO-2026-123456', 'Tue 13 Aug, 2:00 PM'],
        bodyParams: (customerName: string, jobRef: string, whenLabel: string) => [
          cleanName(customerName),
          String(jobRef || '').trim() || 'your booking',
          String(whenLabel || '').trim() || 'the scheduled time',
        ],
      };
  }
}

/**
 * Resolve Meta send payload for CRM cold booking.
 * Uses dual-brand UTILITY CTA templates (*_ero_cta / *_hro_cta) when APPROVED.
 */
export function resolveBookingCta(
  kind: BookingCtaKind,
  brand: DocumentBrand,
  ...paramArgs: string[]
): { name: string; language: string; bodyParams: string[] } {
  const customerName = String(paramArgs[0] || 'Customer').trim() || 'Customer';
  const templateName = bookingCtaTemplateName(kind, brand);
  const def = bookingCtaBody(kind, brand);

  if (kind === 'booking_confirmed') {
    return {
      name: templateName,
      language: 'en',
      bodyParams: def.bodyParams(
        customerName,
        String(paramArgs[1] || '').trim() || 'your booking',
        String(paramArgs[2] || '').trim() || 'the scheduled time'
      ),
    };
  }
  if (kind === 'reschedule_visit') {
    return {
      name: templateName,
      language: 'en',
      bodyParams: def.bodyParams(
        customerName,
        String(paramArgs[1] || '').trim() || 'your scheduled visit'
      ),
    };
  }
  return {
    name: templateName,
    language: 'en',
    bodyParams: def.bodyParams(customerName),
  };
}

export function listBookingCtaTemplatesForMetaSubmit(): Array<{
  name: string;
  brand: DocumentBrand;
  kind: BookingCtaKind;
  language: string;
  category: 'UTILITY';
  bodyText: string;
  sampleParams: string[];
  bookUrl: string;
  label: string;
}> {
  const brands: DocumentBrand[] = ['elevenro', 'hydrogenro'];
  const out: ReturnType<typeof listBookingCtaTemplatesForMetaSubmit> = [];
  for (const brand of brands) {
    for (const kind of WA_BOOKING_CTA_KINDS) {
      const def = bookingCtaBody(kind, brand);
      out.push({
        name: bookingCtaTemplateName(kind, brand),
        brand,
        kind,
        language: 'en',
        category: 'UTILITY',
        bodyText: def.text,
        sampleParams: def.sampleParams,
        bookUrl: bookingCtaBookUrl(brand),
        label: `${kind} · ${getDocumentBrandLabel(brand)}`,
      });
    }
  }
  return out;
}

function cleanName(customerName: string): string {
  return String(customerName || 'Customer').trim() || 'Customer';
}
