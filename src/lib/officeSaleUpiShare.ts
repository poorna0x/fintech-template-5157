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

export type OfficeSaleUpiShareInput = {
  brand: DocumentBrand;
  amount: number;
  upiId: string;
  payeeName?: string;
  /** UPI account payment phone (for iPhone fallback). */
  paymentPhone?: string;
  customerPhone: string;
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
    payeeName: String(input.payeeName || 'Hydrogen RO').trim() || 'Hydrogen RO',
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

/** Open wa.me with short HTTPS UPI pay link (same as technician Share QR Link). */
export async function shareOfficeSaleUpiOnWhatsApp(
  input: OfficeSaleUpiShareInput
): Promise<{ ok: boolean; error?: string }> {
  const phone = formatPhoneForWhatsApp(input.customerPhone);
  if (!phone || phone.length < 10) {
    return { ok: false, error: 'Enter a valid 10-digit customer phone' };
  }
  const message = await buildOfficeSaleUpiShareMessage(input);
  if (!message) {
    return {
      ok: false,
      error: 'Could not create pay link — check UPI ID or run UPI pay-link SQL in Supabase',
    };
  }
  window.open(
    `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
    '_blank',
    'noopener,noreferrer'
  );
  return { ok: true };
}
