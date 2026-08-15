/**
 * Document Accept (preview PDF → WhatsApp button or secure email link → original).
 * Client helpers — watermark + admin send API.
 */
import { toast } from 'sonner';
import { ensureSupabaseSessionForWrite, resolveSupabaseAccessTokenForApi } from '@/lib/ensureSupabaseSession';
import { generateDocumentPdfBase64 } from '@/lib/server-pdf-download';
import {
  generateDocumentPdfVerifyCode,
  recordDocumentPdfAuthenticity,
  type DocumentPdfDocType,
} from '@/lib/documentPdfAuthenticity';
import type { DocumentBrand } from '@/lib/service-brands';
import type { Bill } from '@/types';
import {
  generateGeneratorDocumentPdfBase64,
  type GeneratorDocumentEmailKind,
} from '@/lib/send-generator-document-email';
import { generateBillHTML } from '@/lib/pdf-generator';
import { generateQuotationHTML } from '@/lib/quotation-pdf-generator';
import { generateTaxInvoiceHTML } from '@/lib/tax-invoice-pdf-generator';
import {
  billToBillPdfData,
  billToQuotationPdfData,
  billToTaxInvoicePdfData,
} from '@/lib/document-preview-utils';
import { billToAmcPdfData, generateAMCHTML, type AMCPDFOptions } from '@/lib/amc-pdf-generator';
import {
  generateWarrantyCardHTML,
  type WarrantyCardPDFData,
} from '@/lib/warranty-card-pdf-generator';
import { todayYmdIst } from '@/lib/documentPdfAuthenticity';

const PREVIEW_WATERMARK_CSS = `
@page { margin: 0; }
.wa-preview-watermark-banner {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 99999;
  background: #b45309;
  color: #fff;
  text-align: center;
  font: 700 13px/1.3 system-ui, sans-serif;
  padding: 8px 12px;
  letter-spacing: 0.04em;
}
.wa-preview-watermark-diag {
  position: fixed;
  inset: 0;
  z-index: 99998;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.wa-preview-watermark-diag span {
  transform: rotate(-32deg);
  font: 800 42px/1.1 system-ui, sans-serif;
  color: rgba(180, 83, 9, 0.18);
  white-space: nowrap;
  letter-spacing: 0.08em;
  border: 4px solid rgba(180, 83, 9, 0.22);
  padding: 12px 28px;
  border-radius: 8px;
  text-transform: uppercase;
}
`;

/** Inject PREVIEW – NOT VALID watermark into document HTML (preview PDF only). */
export function withDocumentAcceptPreviewWatermark(html: string): string {
  const banner =
    '<div class="wa-preview-watermark-banner" aria-hidden="true">PREVIEW – NOT VALID · Accept securely to receive the original</div>';
  const diag =
    '<div class="wa-preview-watermark-diag" aria-hidden="true"><span>PREVIEW – NOT VALID</span></div>';
  const style = `<style id="wa-preview-watermark">${PREVIEW_WATERMARK_CSS}</style>`;
  let out = String(html || '');
  if (/<\/head>/i.test(out)) {
    out = out.replace(/<\/head>/i, `${style}</head>`);
  } else {
    out = `${style}${out}`;
  }
  if (/<body[^>]*>/i.test(out)) {
    out = out.replace(/<body([^>]*)>/i, `<body$1>${banner}${diag}`);
  } else {
    out = `${banner}${diag}${out}`;
  }
  return out;
}

function previewHtmlForKind(
  kind: GeneratorDocumentEmailKind,
  bill: Bill,
  verifyCode?: string
): string {
  const code = verifyCode;
  switch (kind) {
    case 'service_bill':
      return generateBillHTML({
        ...billToBillPdfData(bill),
        authenticityVerifyCode: code,
      });
    case 'quotation':
      return generateQuotationHTML({
        ...(billToQuotationPdfData(bill) as Parameters<typeof generateQuotationHTML>[0]),
        authenticityVerifyCode: code,
        authenticityCustomerId: bill.customer?.id || undefined,
      });
    case 'invoice': {
      const data = billToTaxInvoicePdfData(bill) as Parameters<typeof generateTaxInvoiceHTML>[0] & {
        pdfOptions?: Record<string, unknown>;
      };
      return generateTaxInvoiceHTML({
        ...data,
        pdfOptions: {
          ...(data.pdfOptions || {}),
          authenticityVerifyCode: code,
        },
      });
    }
  }
}

function resolveAcceptSourceKey(bill: Bill, kind: GeneratorDocumentEmailKind): string {
  const billNumber = String(bill.billNumber || '').trim();
  if (billNumber) return billNumber;
  return `${kind}-${Date.now()}`;
}

function pdfFilenameForKind(kind: GeneratorDocumentEmailKind, bill: Bill): string {
  const safeNumber = bill.billNumber.replace(/\s+/g, '_');
  switch (kind) {
    case 'service_bill':
      return `Bill_${safeNumber}.pdf`;
    case 'quotation':
      return `Quotation_${safeNumber}.pdf`;
    case 'invoice':
      return `TaxInvoice_${safeNumber}.pdf`;
  }
}

export type DocumentAcceptPdfPair = {
  originalPdfBase64: string;
  previewPdfBase64: string;
  filename: string;
  /** Original PDF verify code (sent after accept). */
  verifyCode: string;
  /** Preview PDF verify code (watermarked bytes sent first). */
  previewVerifyCode: string;
  sizeOriginal: number;
  sizePreview: number;
};

function previewAuthenticitySourceKey(sourceKey: string): string {
  const key = String(sourceKey || '').trim();
  return key.endsWith(':preview') ? key : `${key}:preview`;
}

async function recordAcceptPreviewAuthenticity(params: {
  docType: DocumentPdfDocType;
  sourceKey: string;
  verifyCode: string;
  pdfBase64: string;
  filename?: string;
  customerId?: string | null;
  documentRef?: string | null;
  generatedOnYmd?: string;
}): Promise<{ ok: true; sha256Hex: string } | { ok: false; error: string }> {
  const sourceKey = String(params.sourceKey || '').trim();
  const documentRef = String(params.documentRef || sourceKey).trim();
  return recordDocumentPdfAuthenticity({
    ...params,
    sourceKey: previewAuthenticitySourceKey(sourceKey),
    documentRef: documentRef ? `${documentRef} (preview)` : 'preview',
  });
}

/** Original (fingerprinted) + watermarked preview PDFs for Accept flow. */
export async function generateDocumentAcceptPdfPair(
  kind: GeneratorDocumentEmailKind,
  bill: Bill
): Promise<DocumentAcceptPdfPair> {
  const sessionReady = await ensureSupabaseSessionForWrite();
  if (!sessionReady.ok) {
    throw new Error('Could not verify your session. Please try again.');
  }

  const verifyCode = generateDocumentPdfVerifyCode();
  const previewVerifyCode = generateDocumentPdfVerifyCode();
  const filename = pdfFilenameForKind(kind, bill);
  const sourceKey = resolveAcceptSourceKey(bill, kind);
  const originalHtml = previewHtmlForKind(kind, bill, verifyCode);
  const previewHtml = withDocumentAcceptPreviewWatermark(
    previewHtmlForKind(kind, bill, previewVerifyCode)
  );

  const [original, preview] = await Promise.all([
    generateDocumentPdfBase64({ html: originalHtml, filename }),
    generateDocumentPdfBase64({
      html: previewHtml,
      filename: `PREVIEW_${filename}`,
    }),
  ]);

  const generatedOnYmd = todayYmdIst();
  const [originalRecord, previewRecord] = await Promise.all([
    recordDocumentPdfAuthenticity({
      docType: kind as DocumentPdfDocType,
      sourceKey,
      verifyCode,
      pdfBase64: original.pdfBase64,
      filename: original.filename,
      customerId: bill.customer?.id || null,
      documentRef: sourceKey,
      generatedOnYmd,
    }),
    recordAcceptPreviewAuthenticity({
      docType: kind as DocumentPdfDocType,
      sourceKey,
      verifyCode: previewVerifyCode,
      pdfBase64: preview.pdfBase64,
      filename: preview.filename,
      customerId: bill.customer?.id || null,
      documentRef: sourceKey,
      generatedOnYmd,
    }),
  ]);

  if (!previewRecord.ok) {
    throw new Error(
      previewRecord.error || 'Preview PDF authenticity fingerprint was not saved'
    );
  }
  if (!originalRecord.ok) {
    throw new Error(
      originalRecord.error || 'Original PDF authenticity fingerprint was not saved'
    );
  }

  return {
    originalPdfBase64: original.pdfBase64,
    previewPdfBase64: preview.pdfBase64,
    filename: original.filename,
    verifyCode,
    previewVerifyCode,
    sizeOriginal: original.size,
    sizePreview: preview.size,
  };
}

/** AMC original + watermarked preview for Accept flow. */
export async function generateAmcAcceptPdfPair(
  bill: Bill,
  pdfOptions?: AMCPDFOptions
): Promise<DocumentAcceptPdfPair> {
  const sessionReady = await ensureSupabaseSessionForWrite();
  if (!sessionReady.ok) {
    throw new Error('Could not verify your session. Please try again.');
  }
  const verifyCode = generateDocumentPdfVerifyCode();
  const previewVerifyCode = generateDocumentPdfVerifyCode();
  const generatedOnYmd = todayYmdIst();
  const opts: AMCPDFOptions = {
    ...pdfOptions,
    authenticityVerifyCode: verifyCode,
    authenticityGeneratedOnYmd: generatedOnYmd,
  };
  const previewOpts: AMCPDFOptions = {
    ...pdfOptions,
    authenticityVerifyCode: previewVerifyCode,
    authenticityGeneratedOnYmd: generatedOnYmd,
  };
  const data = billToAmcPdfData(bill);
  const filename = `AMC_${String(bill.billNumber || 'agreement').replace(/\s+/g, '_')}.pdf`;
  const html = generateAMCHTML(data, opts);
  const previewHtml = withDocumentAcceptPreviewWatermark(generateAMCHTML(data, previewOpts));
  const [original, preview] = await Promise.all([
    generateDocumentPdfBase64({ html, filename }),
    generateDocumentPdfBase64({
      html: previewHtml,
      filename: `PREVIEW_${filename}`,
    }),
  ]);
  const sourceKey = String(bill.billNumber || '').trim() || `amc-${Date.now()}`;
  const [originalRecord, previewRecord] = await Promise.all([
    recordDocumentPdfAuthenticity({
      docType: 'amc',
      sourceKey,
      verifyCode,
      pdfBase64: original.pdfBase64,
      filename: original.filename,
      customerId: bill.customer?.id || null,
      documentRef: bill.billNumber,
      generatedOnYmd,
    }),
    recordAcceptPreviewAuthenticity({
      docType: 'amc',
      sourceKey,
      verifyCode: previewVerifyCode,
      pdfBase64: preview.pdfBase64,
      filename: preview.filename,
      customerId: bill.customer?.id || null,
      documentRef: bill.billNumber,
      generatedOnYmd,
    }),
  ]);
  if (!originalRecord.ok) {
    throw new Error(originalRecord.error || 'Original PDF authenticity fingerprint was not saved');
  }
  if (!previewRecord.ok) {
    throw new Error(previewRecord.error || 'Preview PDF authenticity fingerprint was not saved');
  }
  return {
    originalPdfBase64: original.pdfBase64,
    previewPdfBase64: preview.pdfBase64,
    filename: original.filename,
    verifyCode,
    previewVerifyCode,
    sizeOriginal: original.size,
    sizePreview: preview.size,
  };
}

/** Warranty original + watermarked preview for Accept flow. */
export async function generateWarrantyAcceptPdfPair(
  data: WarrantyCardPDFData,
  opts?: { customerId?: string | null }
): Promise<DocumentAcceptPdfPair> {
  const sessionReady = await ensureSupabaseSessionForWrite();
  if (!sessionReady.ok) {
    throw new Error('Could not verify your session. Please try again.');
  }
  const verifyCode = generateDocumentPdfVerifyCode();
  const previewVerifyCode = generateDocumentPdfVerifyCode();
  const generatedOnYmd = todayYmdIst();
  const fingerprinted: WarrantyCardPDFData = {
    ...data,
    authenticityVerifyCode: verifyCode,
    authenticityGeneratedOnYmd: generatedOnYmd,
  };
  const previewFingerprinted: WarrantyCardPDFData = {
    ...data,
    authenticityVerifyCode: previewVerifyCode,
    authenticityGeneratedOnYmd: generatedOnYmd,
  };
  const safeId = fingerprinted.customer.customer_id.replace(/[/\\?%*:|"<>]/g, '_');
  const datePart = (fingerprinted.warranty.start_date || 'card').replace(/-/g, '');
  const draft = fingerprinted.warranty.id === 'draft' ? '_draft' : '';
  const filename = `Warranty_${safeId}_${datePart}${draft}.pdf`;
  const html = generateWarrantyCardHTML(fingerprinted);
  const previewHtml = withDocumentAcceptPreviewWatermark(
    generateWarrantyCardHTML(previewFingerprinted)
  );
  const [original, preview] = await Promise.all([
    generateDocumentPdfBase64({ html, filename }),
    generateDocumentPdfBase64({
      html: previewHtml,
      filename: `PREVIEW_${filename}`,
    }),
  ]);
  const sourceKey =
    fingerprinted.warranty.id && fingerprinted.warranty.id !== 'draft'
      ? fingerprinted.warranty.id
      : `draft:${fingerprinted.customer.customer_id}:${fingerprinted.warranty.start_date || 'na'}`;
  const [originalRecord, previewRecord] = await Promise.all([
    recordDocumentPdfAuthenticity({
      docType: 'warranty',
      sourceKey,
      verifyCode,
      pdfBase64: original.pdfBase64,
      filename: original.filename,
      customerId: opts?.customerId || null,
      documentRef: fingerprinted.customer.customer_id,
      generatedOnYmd,
    }),
    recordAcceptPreviewAuthenticity({
      docType: 'warranty',
      sourceKey,
      verifyCode: previewVerifyCode,
      pdfBase64: preview.pdfBase64,
      filename: preview.filename,
      customerId: opts?.customerId || null,
      documentRef: fingerprinted.customer.customer_id,
      generatedOnYmd,
    }),
  ]);
  if (!originalRecord.ok) {
    throw new Error(originalRecord.error || 'Original PDF authenticity fingerprint was not saved');
  }
  if (!previewRecord.ok) {
    throw new Error(previewRecord.error || 'Preview PDF authenticity fingerprint was not saved');
  }
  return {
    originalPdfBase64: original.pdfBase64,
    previewPdfBase64: preview.pdfBase64,
    filename: original.filename,
    verifyCode,
    previewVerifyCode,
    sizeOriginal: original.size,
    sizePreview: preview.size,
  };
}

export type SendDocumentAcceptInviteParams = {
  to: string;
  brand: DocumentBrand | string;
  docType: DocumentPdfDocType | 'generic' | GeneratorDocumentEmailKind;
  documentLabel: string;
  documentRef?: string;
  sourceKey?: string;
  customerId?: string | null;
  customerName: string;
  amountDisplay?: string | number | null;
  filename: string;
  verifyCode: string;
  previewVerifyCode: string;
  originalPdfBase64: string;
  previewPdfBase64: string;
  /** When 24h window is closed, skip interactive (Meta 200 then Re-engagement). */
  preferColdTemplate?: boolean;
};

export async function sendDocumentAcceptInvite(
  params: SendDocumentAcceptInviteParams
): Promise<{
  ok: boolean;
  error?: string;
  inviteId?: string;
  expiresAt?: string;
  via?: 'interactive' | 'cold_template' | string;
}> {
  const sessionReady = await ensureSupabaseSessionForWrite();
  if (!sessionReady.ok) {
    return { ok: false, error: 'Could not verify your session' };
  }
  const token = await resolveSupabaseAccessTokenForApi();
  if (!token) return { ok: false, error: 'Not signed in' };

  const res = await fetch('/.netlify/functions/document-accept-send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: params.to,
      brand: params.brand,
      docType: params.docType,
      documentLabel: params.documentLabel,
      documentRef: params.documentRef,
      sourceKey: params.sourceKey,
      customerId: params.customerId,
      customerName: params.customerName,
      amountDisplay: params.amountDisplay,
      filename: params.filename,
      verifyCode: params.verifyCode,
      previewVerifyCode: params.previewVerifyCode,
      originalPdfBase64: params.originalPdfBase64,
      previewPdfBase64: params.previewPdfBase64,
      preferColdTemplate: params.preferColdTemplate === true,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error || data?.details || `Accept send failed (${res.status})` };
  }
  return {
    ok: true,
    inviteId: data.inviteId,
    expiresAt: data.expiresAt,
    via: data.via,
  };
}

export async function sendDocumentEmailAcceptInvite(
  params: SendDocumentAcceptInviteParams
): Promise<{
  ok: boolean;
  error?: string;
  inviteId?: string;
  expiresAt?: string;
}> {
  const sessionReady = await ensureSupabaseSessionForWrite();
  if (!sessionReady.ok) return { ok: false, error: 'Could not verify your session' };
  const token = await resolveSupabaseAccessTokenForApi();
  if (!token) return { ok: false, error: 'Not signed in' };

  const res = await fetch('/.netlify/functions/document-accept-email-send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: params.to,
      brand: params.brand,
      docType: params.docType,
      documentLabel: params.documentLabel,
      documentRef: params.documentRef,
      sourceKey: params.sourceKey,
      customerId: params.customerId,
      customerName: params.customerName,
      amountDisplay: params.amountDisplay,
      filename: params.filename,
      verifyCode: params.verifyCode,
      previewVerifyCode: params.previewVerifyCode,
      originalPdfBase64: params.originalPdfBase64,
      previewPdfBase64: params.previewPdfBase64,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    return {
      ok: false,
      error: data?.error || data?.details || `Email Accept send failed (${res.status})`,
    };
  }
  return {
    ok: true,
    inviteId: data.inviteId,
    expiresAt: data.expiresAt,
  };
}

export type PublicDocumentAcceptInvite = {
  brand: DocumentBrand;
  documentLabel: string;
  documentRef: string | null;
  customerName: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked' | 'failed';
  expiresAt: string;
  acceptedAt: string | null;
  confirmationId: string | null;
  deliveryStatus: 'pending' | 'sending' | 'sent' | 'failed';
};

function publicAcceptFunctionUrl(): string {
  if (typeof window !== 'undefined' && window.location.hostname.endsWith('elevenro.com')) {
    return 'https://hydrogenro.com/.netlify/functions/document-accept-public';
  }
  return '/.netlify/functions/document-accept-public';
}

async function callPublicAccept(
  token: string,
  action: 'get' | 'accept'
): Promise<Record<string, unknown>> {
  const response = await fetch(publicAcceptFunctionUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, action }),
  });
  return response.json().catch(() => ({ ok: false, error: 'failed' }));
}

export async function fetchPublicDocumentAcceptInvite(token: string): Promise<{
  invite: PublicDocumentAcceptInvite | null;
  error?: string;
}> {
  const data = await callPublicAccept(token, 'get');
  return {
    invite: data.ok && data.invite ? data.invite as PublicDocumentAcceptInvite : null,
    error: typeof data.error === 'string' ? data.error : undefined,
  };
}

export async function acceptPublicDocument(token: string): Promise<{
  ok: boolean;
  accepted?: boolean;
  alreadyAccepted?: boolean;
  confirmationId?: string;
  deliveryStatus?: string;
  error?: string;
}> {
  return callPublicAccept(token, 'accept') as Promise<{
    ok: boolean;
    accepted?: boolean;
    alreadyAccepted?: boolean;
    confirmationId?: string;
    deliveryStatus?: string;
    error?: string;
  }>;
}

export function showAcceptPreviewSentToast(
  toastId: string | number,
  via?: string | null
): void {
  const cold = via === 'cold_template';
  toast.success(
    cold
      ? 'Preview sent (cold template) — customer taps I Accept for the original PDF'
      : 'Preview sent — customer taps I Accept on WhatsApp for the original PDF',
    { id: toastId }
  );
}

/** @deprecated use generateDocumentAcceptPdfPair — kept for accidental imports */
export async function generateOriginalOnly(
  kind: GeneratorDocumentEmailKind,
  bill: Bill
) {
  return generateGeneratorDocumentPdfBase64(kind, bill);
}
