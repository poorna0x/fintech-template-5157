/**
 * Generate a UPI payment QR PNG (amount baked into upi://pay) for WhatsApp image sends.
 */
import {
  buildUpiPayDeepLink,
  isValidUpiId,
  normalizeUpiId,
  type UpiPayLinkInput,
} from '@/lib/upiPaymentAccounts';

export type GeneratedUpiQrPng = {
  base64: string;
  mimeType: 'image/png';
  filename: string;
  deepLink: string;
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read QR blob'));
    reader.readAsDataURL(blob);
  });
}

function safeQrFilename(input: UpiPayLinkInput): string {
  const brand = input.brand === 'elevenro' ? 'elevenro' : 'hydrogen-ro';
  const am = Number(input.amount);
  const amt = Number.isFinite(am) && am > 0 ? `-${Math.round(am)}` : '';
  return `${brand}-upi-pay${amt}.png`;
}

/** Build PNG base64 for a UPI deep-link QR (for WhatsApp photo+caption / IMAGE header). */
export async function generateUpiQrPngBase64(
  input: UpiPayLinkInput,
  opts?: { size?: number }
): Promise<GeneratedUpiQrPng | null> {
  const pa = normalizeUpiId(input.upiId);
  if (!isValidUpiId(pa)) return null;
  const deepLink = buildUpiPayDeepLink({
    upiId: pa,
    payeeName: input.payeeName,
    amount: input.amount,
    note: input.note,
    phone: input.phone,
    brand: input.brand,
  });
  if (!deepLink) return null;

  const size = Math.max(160, Math.min(512, Number(opts?.size) || 320));
  try {
    const { default: QRCodeStyling } = await import('qr-code-styling');
    const qr = new QRCodeStyling({
      width: size,
      height: size,
      type: 'canvas',
      data: deepLink,
      margin: 8,
      qrOptions: { errorCorrectionLevel: 'M' },
      dotsOptions: { color: '#000000', type: 'square' },
      cornersSquareOptions: { color: '#000000', type: 'square' },
      cornersDotOptions: { color: '#000000', type: 'square' },
      backgroundOptions: { color: '#ffffff' },
    });
    const raw = await qr.getRawData('png');
    if (!raw) return null;
    const blob =
      raw instanceof Blob
        ? raw
        : new Blob([raw as BlobPart], { type: 'image/png' });
    const base64 = await blobToBase64(blob);
    if (!base64) return null;
    return {
      base64,
      mimeType: 'image/png',
      filename: safeQrFilename({ ...input, upiId: pa }),
      deepLink,
    };
  } catch (err) {
    console.warn('[upi-qr] generate failed', err);
    return null;
  }
}
