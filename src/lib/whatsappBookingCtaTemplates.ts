/**
 * Dual-brand booking CTAs for one WhatsApp number (Eleven RO / Hydrogen RO WABA).
 *
 * Meta template body + Book URL + Call us phone are fixed at approval time, so each
 * use-case has TWO templates:
 *   - *_ero_cta*  → Eleven RO Call us (+919880693311) + https://elevenro.com/book
 *   - *_hro_cta*  → Hydrogen RO Call us (+918884944288) + https://hydrogenro.com/book
 *
 * Prefer *_cta_v3 (Call us + Book). Older v2 is Book-only; v1 ero Call us had wrong number.
 *
 * Submit: node scripts/submit-whatsapp-full-utility.mjs --submit --only-booking-cta-v3
 */

import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel } from '@/lib/service-brands';
import { resolveBrandLetterTemplateName } from '@/lib/whatsappBrandContact';
import { whatsappGreetingName } from '@/lib/whatsappGreetingName';

export const WA_BOOKING_CTA_BUTTONS = {
  callDisplay: 'Call us',
  callPhone: {
    elevenro: '+919880693311',
    hydrogenro: '+918884944288',
  },
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
    return `existing_service_schedule_${suffix}_cta_v3`;
  }
  if (kind === 'missed_call_book') {
    return `missed_call_callback_${suffix}_cta_v5`;
  }
  if (kind === 'book_new_customer') {
    return `unregistered_number_service_${suffix}_cta_v2`;
  }
  if (kind === 'booking_confirmed') {
    // Letter v4 emoji (Call us + Website) → v3 → v2 via cold fallback.
    return resolveBrandLetterTemplateName('booking_confirmed', brand, 'v4');
  }
  if (kind === 'reschedule_visit') {
    return `reschedule_visit_${suffix}_cta_v2`;
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
      return {
        text: `Hi {{1}}, this is ${label}. Your RO service visit is due. Reply BOOK on this chat to pick date and time — we already have your details on file. Or tap Book online below.`,
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
      return {
        text: `Hi {{1}}, this is ${label}. Sorry we missed your call. We will get back to you shortly. Last service date: {{2}}. Tap Call us if you need us now, or reply on this chat.`,
        sampleParams: ['Rahul', '12 Aug 2026'],
        bodyParams: (customerName: string, lastServiceDate?: string) => [
          cleanName(customerName),
          String(lastServiceDate || '').trim() || 'not on file yet',
        ],
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
  if (kind === 'missed_call_book') {
    return {
      name: templateName,
      language: 'en',
      bodyParams: def.bodyParams(
        customerName,
        String(paramArgs[1] || '').trim() || 'not on file yet'
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
  return whatsappGreetingName(customerName, 'there');
}
