import { buildTechSharePayMessage } from '@/components/job/ShareQrLinkPanel';
import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel } from '@/lib/service-brands';
import {
  buildUpiPayShortHttpsLink,
  createUpiPayShortLink,
  isValidUpiId,
  normalizePaymentPhone,
  resolveUpiPaySiteOrigin,
} from '@/lib/upiPaymentAccounts';
import { formatPhoneForWhatsApp } from '@/lib/utils';
import { sendPayQrWhatsApp } from '@/lib/whatsappPayQrShare';

/** Default pay-link brand for office sales (user can switch to Hydrogen RO in the UI). */
export const DEFAULT_OFFICE_SALE_UPI_BRAND: DocumentBrand = 'elevenro';

export type OfficeSaleUpiShareInput = {
  brand: DocumentBrand;
  amount: number;
  upiId: string;
  payeeName?: string;
  /** UPI account payment phone (for iPhone fallback). */
  paymentPhone?: string;
  customerPhone: string;
  customerName?: string;
  customerId?: string | null;
  note?: string;
};

export async function buildOfficeSaleUpiPayHttpsLink(
  input: OfficeSaleUpiShareInput
): Promise<string | null> {
  const upiId = String(input.upiId || '').trim();
  if (!isValidUpiId(upiId)) return null;
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const payInput = {
    upiId,
    payeeName:
      String(input.payeeName || '').trim() ||
      getDocumentBrandLabel(input.brand),
    amount,
    note: String(input.note || 'Office sale').trim().slice(0, 80) || 'Office sale',
    phone: normalizePaymentPhone(input.paymentPhone || '') || undefined,
    brand: input.brand,
  };

  const code = await createUpiPayShortLink(payInput);
  const origin = resolveUpiPaySiteOrigin(input.brand);
  return code ? buildUpiPayShortHttpsLink(origin, code) : null;
}

export async function buildOfficeSaleUpiShareMessage(
  input: OfficeSaleUpiShareInput
): Promise<string | null> {
  const payLink = await buildOfficeSaleUpiPayHttpsLink(input);
  if (!payLink) return null;
  const brandLabel = getDocumentBrandLabel(input.brand);
  return buildTechSharePayMessage({
    brandLabel,
    amount: input.amount,
    payeeName: input.payeeName,
    upiId: input.upiId,
    phone: normalizePaymentPhone(input.paymentPhone || ''),
    payLink,
  });
}

/** Send Cloud API UPI QR (image template), or open wa.me when Cloud API is off. */
export async function shareOfficeSaleUpiOnWhatsApp(
  input: OfficeSaleUpiShareInput
): Promise<{ ok: boolean; error?: string }> {
  const phone = formatPhoneForWhatsApp(input.customerPhone);
  if (!phone || phone.length < 10) {
    return { ok: false, error: 'Enter a valid 10-digit customer phone' };
  }

  const { fetchWhatsAppCrmSettings, isWhatsAppCloudApiMasterEnabled } = await import(
    '@/lib/whatsappCrmSettings'
  );
  const { settings } = await fetchWhatsAppCrmSettings();
  if (!isWhatsAppCloudApiMasterEnabled(settings) || settings.allow_pending_payment === false) {
    const { openWhatsAppMeDeepLink } = await import('@/lib/sendAdminWhatsAppApi');
    const text = await buildOfficeSaleUpiShareMessage(input);
    if (!text) return { ok: false, error: 'Could not build pay link message' };
    openWhatsAppMeDeepLink(phone, text);
    return { ok: true };
  }

  const result = await sendPayQrWhatsApp({
    to: input.customerPhone,
    amount: input.amount,
    brand: input.brand,
    upiId: input.upiId,
    payeeName: input.payeeName,
    paymentPhone: input.paymentPhone,
    customerName: input.customerName || input.note || 'there',
    customerId: input.customerId,
    note: input.note,
    jobRef: 'office sale',
    watchPhotos: false,
    source: 'pending_payment',
  });
  if (!result.ok) {
    return { ok: false, error: result.error || 'Could not send pay QR on WhatsApp' };
  }
  return { ok: true };
}
