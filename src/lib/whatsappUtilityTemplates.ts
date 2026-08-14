/**
 * UTILITY cold-template helpers — payment received, AMC expiry, reschedule, etc.
 * Keep Meta names in sync with scripts/submit-whatsapp-full-utility.mjs
 */
import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel } from '@/lib/service-brands';
import { resolveBookingCta } from '@/lib/whatsappBookingCtaTemplates';
import { WA_COLD } from '@/lib/whatsappColdTemplates';
import { resolveWaTemplateName } from '@/lib/whatsappTemplateResolve';
import { sendAdminWhatsAppTextWithOptionalTemplate } from '@/lib/sendAdminWhatsAppApi';
import type { AdminWhatsAppSendResult } from '@/lib/sendAdminWhatsAppApi';
import { brandLetterClosingLines, resolveBrandLetterTemplateName } from '@/lib/whatsappBrandContact';
import { whatsappGreetingName } from '@/lib/whatsappGreetingName';

export type ColdTemplatePayload = {
  name: string;
  languageCode: string;
  bodyParams: string[];
};

function cleanName(name: string): string {
  return whatsappGreetingName(name, 'there');
}

function cleanAmount(amount: number | string): string {
  return (
    String(amount ?? '0')
      .replace(/[^\d.]/g, '')
      .replace(/\.0+$/, '') || '0'
  );
}

export function resolveColdPaymentReceived(
  customerName: string,
  amount: number | string
): ColdTemplatePayload {
  return {
    name: resolveWaTemplateName(WA_COLD.payment_received.name),
    languageCode: WA_COLD.payment_received.language,
    bodyParams: WA_COLD.payment_received.bodyParams(customerName, amount),
  };
}

export function resolveColdAmcExpiry(
  customerName: string,
  endDate: string
): ColdTemplatePayload {
  return {
    name: resolveWaTemplateName(WA_COLD.amc_expiry_notice.name),
    languageCode: WA_COLD.amc_expiry_notice.language,
    bodyParams: WA_COLD.amc_expiry_notice.bodyParams(customerName, endDate),
  };
}

export function resolveColdRescheduleVisit(
  brand: DocumentBrand,
  customerName: string,
  whenLabel: string
): ColdTemplatePayload {
  const cta = resolveBookingCta('reschedule_visit', brand, customerName, whenLabel);
  return {
    name: resolveWaTemplateName(cta.name),
    languageCode: cta.language,
    bodyParams: cta.bodyParams,
  };
}

export function resolveColdMissedCall(
  customerName: string,
  brand: DocumentBrand = 'hydrogenro'
): ColdTemplatePayload {
  const cta = resolveBookingCta('missed_call_book', brand, customerName);
  return {
    name: resolveWaTemplateName(cta.name),
    languageCode: cta.language,
    bodyParams: cta.bodyParams,
  };
}

export function resolveColdUnregisteredNumber(
  brand: DocumentBrand,
  customerName?: string
): ColdTemplatePayload {
  const cta = resolveBookingCta('book_new_customer', brand, customerName || 'there');
  return {
    name: resolveWaTemplateName(cta.name),
    languageCode: cta.language,
    bodyParams: cta.bodyParams,
  };
}

export function visitCancelledTemplateName(brand: DocumentBrand): string {
  return resolveBrandLetterTemplateName('booking_cancelled', brand, 'v5');
}

export function visitCancelledTemplateFallbackName(brand: DocumentBrand): string {
  return resolveBrandLetterTemplateName('booking_cancelled', brand, 'v4');
}

export function resolveColdVisitCancelled(
  brand: DocumentBrand,
  customerName: string,
  whenLabel: string
): ColdTemplatePayload {
  return {
    name: visitCancelledTemplateName(brand),
    languageCode: 'en',
    bodyParams: [
      cleanName(customerName),
      String(whenLabel || '').trim() || 'your scheduled visit',
    ],
  };
}

export function resolveColdPartsReady(customerName: string): ColdTemplatePayload {
  return {
    name: resolveWaTemplateName('svc_parts_ready'),
    languageCode: 'en',
    bodyParams: [cleanName(customerName)],
  };
}

export function resolveColdTechDelayed(
  customerName: string,
  whenLabel?: string
): ColdTemplatePayload {
  return {
    name: resolveWaTemplateName('svc_tech_delayed'),
    languageCode: 'en',
    bodyParams: [
      cleanName(customerName),
      String(whenLabel || '').trim() || 'your scheduled visit',
    ],
  };
}

export function resolveColdServiceRequest(customerName: string): ColdTemplatePayload {
  return {
    name: resolveWaTemplateName('svc_service_request'),
    languageCode: 'en',
    bodyParams: [cleanName(customerName)],
  };
}

export function buildMissedCallWhatsAppMessage(customerName: string, brand: DocumentBrand): string {
  const label = getDocumentBrandLabel(brand);
  return [
    `Hi ${cleanName(customerName)},`,
    `This is ${label}. We received your incoming call and could not answer.`,
    'We will return your call to continue your water purifier service.',
    'Reply on this chat if you need to add any details before we call.',
  ].join('\n');
}

export function buildAmcExpiryWhatsAppMessage(
  customerName: string,
  endDateLabel: string,
  brand: DocumentBrand
): string {
  const label = getDocumentBrandLabel(brand);
  return [
    `Hi ${cleanName(customerName)},`,
    '',
    `Your ${label} AMC for your water purifier is due to end on ${endDateLabel}.`,
    '',
    'Reply on this chat to renew your AMC or schedule a service visit before expiry.',
  ].join('\n');
}

export function buildJobRescheduleWhatsAppMessage(
  customerName: string,
  whenLabel: string,
  brand: DocumentBrand
): string {
  const label = getDocumentBrandLabel(brand);
  return [
    `Hi ${cleanName(customerName)},`,
    '',
    `Your ${label} service visit has been updated to ${whenLabel}.`,
    '',
    'Reply on this chat if you need to change the date or time.',
  ].join('\n');
}

export function buildVisitCancelledWhatsAppMessage(
  customerName: string,
  whenLabel: string,
  brand: DocumentBrand
): string {
  const label = getDocumentBrandLabel(brand);
  const when = String(whenLabel || '').trim() || 'your scheduled visit';
  return [
    `Hi ${cleanName(customerName)},`,
    `This is an update from ${label} regarding your water purifier service booking.`,
    '',
    `Your booking for ${when} has been cancelled.`,
    '',
    ...brandLetterClosingLines(brand, { includeTextUs: false }),
    '',
    'Reply on this chat if you need any help.',
  ].join('\n');
}

export function buildPartsReadyWhatsAppMessage(customerName: string, brand: DocumentBrand): string {
  const label = getDocumentBrandLabel(brand);
  return [
    `Hi ${cleanName(customerName)},`,
    '',
    `The spare parts required for your ${label} water purifier service have arrived.`,
    '',
    'Reply on this chat and we will schedule the technician visit.',
  ].join('\n');
}

export function buildTechDelayedWhatsAppMessage(
  customerName: string,
  whenLabel: string,
  brand: DocumentBrand
): string {
  const label = getDocumentBrandLabel(brand);
  return [
    `Hi ${cleanName(customerName)},`,
    '',
    `Our ${label} technician is slightly delayed for ${whenLabel}.`,
    '',
    'Sorry for the inconvenience — we will update you on this chat shortly.',
  ].join('\n');
}

export async function sendUtilityWhatsAppWithColdFallback(opts: {
  to: string;
  text: string;
  customerId?: string | null;
  source: import('@/lib/whatsappCrmSettings').WhatsAppSendSource;
  coldTemplate: ColdTemplatePayload;
  fallbackWaMe?: boolean;
}): Promise<AdminWhatsAppSendResult & { usedTemplate?: boolean }> {
  return sendAdminWhatsAppTextWithOptionalTemplate({
    to: opts.to,
    text: opts.text,
    customerId: opts.customerId,
    source: opts.source,
    fallbackWaMe: opts.fallbackWaMe ?? true,
    coldTemplate: {
      name: opts.coldTemplate.name,
      languageCode: opts.coldTemplate.languageCode,
      bodyParams: opts.coldTemplate.bodyParams,
    },
  });
}
