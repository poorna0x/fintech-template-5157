/**
 * Cloud API UPI QR share (technician Share QR Link + Direct Sales).
 * Uses the approved balance-due IMAGE template (QR + Pay now).
 */
import { generateUpiQrPngBase64 } from '@/lib/generateUpiQrPng';
import { fetchImageUrlAsBase64 } from '@/lib/qrCodeManager';
import {
  getLocalCalendarDateYmd,
  buildPendingPaymentLetterBodyParams,
  buildPendingPaymentLetterButtonUrlParams,
  buildPendingPaymentWhatsAppMessage,
  resolvePendingPaymentLetterImageTemplateFallbackName,
  resolvePendingPaymentLetterImageTemplateName,
  resolvePendingPaymentLetterTemplateName,
} from '@/lib/pendingPaymentReminder';
import {
  sendAdminWhatsAppMedia,
  sendAdminWhatsAppTemplate,
} from '@/lib/sendAdminWhatsAppApi';
import type { DocumentBrand } from '@/lib/service-brands';
import { getDocumentBrandLabel } from '@/lib/service-brands';
import {
  buildUpiPayShortHttpsLink,
  createUpiPayShortLink,
  isValidUpiId,
  normalizePaymentPhone,
  resolveUpiPaySiteOrigin,
} from '@/lib/upiPaymentAccounts';
import type { WhatsAppSendSource } from '@/lib/whatsappCrmSettings';
import { fetchLastInboundAt, isCustomerServiceWindowClosed } from '@/lib/whatsappInbox';
import { supabase } from '@/lib/supabaseClient';

export type SendPayQrWhatsAppInput = {
  to: string;
  amount: number;
  brand: DocumentBrand;
  upiId?: string;
  payeeName?: string | null;
  paymentPhone?: string | null;
  customerName?: string | null;
  customerId?: string | null;
  note?: string | null;
  jobRef?: string | null;
  jobId?: string | null;
  /** Technician share only — server records 30-min photo watch when JWT is a technician. */
  watchPhotos?: boolean;
  source?: WhatsAppSendSource;
  /** Static QR image URL (uploaded standee / bank QR image) */
  staticQrUrl?: string | null;
  /** Whether to dynamically generate QR with amount. Defaults to true if upiId is valid and not explicitly false */
  dynamicUpi?: boolean;
};

export type SendPayQrWhatsAppResult = {
  ok: boolean;
  error?: string;
  payLink?: string | null;
  viaTemplate?: boolean;
};

export async function sendPayQrWhatsApp(
  input: SendPayQrWhatsAppInput
): Promise<SendPayQrWhatsAppResult> {
  const to = String(input.to || '').trim();
  const amount = Number(input.amount);
  const upiId = String(input.upiId || '').trim();
  const staticQrUrl = String(input.staticQrUrl || '').trim();
  if (!to || to.replace(/\D/g, '').length < 10) {
    return { ok: false, error: 'Enter a valid WhatsApp number' };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Enter a valid amount' };
  }
  const hasValidUpiId = isValidUpiId(upiId);
  if (!hasValidUpiId && !staticQrUrl) {
    return { ok: false, error: 'UPI ID is missing or invalid, and no QR image provided' };
  }

  const brand = input.brand === 'elevenro' ? 'elevenro' : 'hydrogenro';
  const payeeName =
    String(input.payeeName || '').trim() || getDocumentBrandLabel(brand);
  const note = String(input.note || input.customerName || payeeName)
    .trim()
    .slice(0, 80);
  const payPhone = normalizePaymentPhone(input.paymentPhone || '') || undefined;

  let payLink: string | null = null;
  if (hasValidUpiId || staticQrUrl) {
    const code = await createUpiPayShortLink({
      upiId: hasValidUpiId ? upiId : '',
      payeeName,
      amount,
      note,
      phone: payPhone,
      brand,
      qrCodeUrl: staticQrUrl || undefined,
      dynamicUpiEnabled: input.dynamicUpi !== false,
    });
    const origin = resolveUpiPaySiteOrigin(brand);
    payLink = code ? buildUpiPayShortHttpsLink(origin, code) : null;
  }

  let headerImage: {
    imageBase64?: string;
    filename: string;
    mimeType: string;
    link?: string;
  } | null = null;

  if (input.dynamicUpi !== false && hasValidUpiId) {
    const qr = await generateUpiQrPngBase64({
      upiId,
      payeeName,
      amount,
      note,
      phone: payPhone,
      brand,
    });
    if (qr?.base64) {
      headerImage = {
        imageBase64: qr.base64,
        filename: qr.filename || 'upi-qr.png',
        mimeType: qr.mimeType || 'image/png',
      };
    }
  }

  if (!headerImage && staticQrUrl) {
    const loaded = await fetchImageUrlAsBase64(staticQrUrl);
    if (loaded?.base64) {
      headerImage = {
        imageBase64: loaded.base64,
        filename: loaded.filename || 'payment-qr.jpg',
        mimeType: loaded.mimeType || 'image/jpeg',
        link: staticQrUrl,
      };
    } else {
      // Fallback: use direct URL so server / Meta Cloud API fetches image directly
      headerImage = {
        imageBase64: '',
        filename: 'payment-qr.jpg',
        mimeType: 'image/jpeg',
        link: staticQrUrl,
      };
    }
  }

  // If dynamic UPI is disabled and no static photo is uploaded, but UPI ID exists:
  // Generate a static QR code (without amount embedded) so customer can scan and type amount
  if (!headerImage && hasValidUpiId) {
    const qr = await generateUpiQrPngBase64({
      upiId,
      payeeName,
      note,
      phone: payPhone,
      brand,
    });
    if (qr?.base64) {
      headerImage = {
        imageBase64: qr.base64,
        filename: qr.filename || 'upi-qr.png',
        mimeType: qr.mimeType || 'image/png',
      };
    }
  }

  if (!payLink && !headerImage) {
    return {
      ok: false,
      error: 'Could not create pay link or QR image — verify UPI ID or uploaded QR',
    };
  }

  const customerName = String(input.customerName || '').trim() || 'there';
  const dueYmd = getLocalCalendarDateYmd();
  const jobRef = String(input.jobRef || '').trim() || 'your service visit';
  const bodyParams = buildPendingPaymentLetterBodyParams(
    customerName,
    amount,
    dueYmd,
    jobRef
  );
  const buttonUrlParams = buildPendingPaymentLetterButtonUrlParams(payLink);
  const source: WhatsAppSendSource = input.source || 'pending_payment';
  const watch = {
    ...(input.watchPhotos ? { watchPhotos: true as const } : {}),
    ...(input.jobId ? { jobId: input.jobId } : {}),
  };

  const sendSessionQr = async () => {
    if (!headerImage) return { ok: false as const, error: 'QR image missing' };
    const caption = buildPendingPaymentWhatsAppMessage(
      customerName,
      amount,
      dueYmd,
      brand,
      { label: payeeName, upiId, phone: payPhone, httpsLink: payLink || undefined },
      jobRef,
      { withQrImage: true, ctaButton: false }
    );
    return sendAdminWhatsAppMedia({
      to,
      fileBase64: headerImage.imageBase64 || undefined,
      link: headerImage.link || staticQrUrl || undefined,
      mediaUrl: headerImage.link || staticQrUrl || undefined,
      filename: headerImage.filename,
      mimeType: headerImage.mimeType,
      caption,
      customerId: input.customerId,
      source,
      ...watch,
    });
  };

  const inboundAt = await fetchLastInboundAt(to, supabase);
  const windowClosed = isCustomerServiceWindowClosed(inboundAt);

  // Open / unknown 24h window: send the actual QR as a session image (not a text template).
  if (!windowClosed && headerImage) {
    const media = await sendSessionQr();
    if (media.ok) {
      return { ok: true, payLink, viaTemplate: false };
    }
    if (media.featureDisabled) {
      return { ok: false, error: media.error };
    }
  }

  if (headerImage) {
    for (const templateName of [
      resolvePendingPaymentLetterImageTemplateName(brand),
      resolvePendingPaymentLetterImageTemplateFallbackName(brand),
    ]) {
      const cold = await sendAdminWhatsAppTemplate({
        to,
        templateName,
        languageCode: 'en',
        bodyParams,
        buttonUrlParams,
        headerImage: {
          imageBase64: headerImage.imageBase64,
          filename: headerImage.filename,
          mimeType: headerImage.mimeType,
          link: headerImage.link || staticQrUrl || undefined,
        },
        customerId: input.customerId,
        customerName,
        source,
        ...watch,
      });
      if (cold.ok) {
        return { ok: true, payLink, viaTemplate: true };
      }
      if (cold.featureDisabled) {
        return { ok: false, error: cold.error };
      }
    }
  }

  // IMAGE templates pending/failed — still try session QR (works inside 24h).
  if (headerImage) {
    const media = await sendSessionQr();
    if (media.ok) {
      return { ok: true, payLink, viaTemplate: false };
    }
    if (media.featureDisabled) {
      return { ok: false, error: media.error };
    }
  }

  const textCold = await sendAdminWhatsAppTemplate({
    to,
    templateName: resolvePendingPaymentLetterTemplateName(brand, {
      withPayButton: buttonUrlParams.length > 0,
    }),
    languageCode: 'en',
    bodyParams,
    buttonUrlParams,
    customerId: input.customerId,
    customerName,
    source,
    ...watch,
  });
  if (textCold.ok) {
    return { ok: true, payLink, viaTemplate: true };
  }
  if (textCold.featureDisabled) {
    return { ok: false, error: textCold.error };
  }

  return {
    ok: false,
    error: textCold.error || 'Could not send pay QR on WhatsApp',
  };
}
