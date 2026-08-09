/**
 * Shared PDF authenticity verify helpers (AMC + document tables).
 */
import {
  lookupAmcPdfAuthenticityBySha256,
  lookupAmcPdfAuthenticityByVerifyCode,
  sha256HexFromFile,
  type AmcPdfAuthenticityRow,
} from '@/lib/amcPdfAuthenticity';
import {
  DOCUMENT_PDF_DOC_TYPE_LABELS,
  lookupDocumentPdfAuthenticityBySha256,
  lookupDocumentPdfAuthenticityByVerifyCode,
  type DocumentPdfAuthenticityRow,
  type DocumentPdfDocType,
} from '@/lib/documentPdfAuthenticity';
import { supabase } from '@/lib/supabaseClient';

export const PDF_AUTH_MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export type PdfAuthenticityHit =
  | { kind: 'amc'; row: AmcPdfAuthenticityRow; customerName?: string; typeLabel: string }
  | {
      kind: 'document';
      row: DocumentPdfAuthenticityRow;
      customerName?: string;
      typeLabel: string;
    };

export type PdfAuthenticityResolve =
  | { status: 'match' | 'code_found'; hit: PdfAuthenticityHit }
  | { status: 'unknown'; message: string; sha256Hex?: string }
  | { status: 'error'; message: string };

async function withCustomerName(customerId: string | null | undefined): Promise<string | undefined> {
  if (!customerId) return undefined;
  try {
    const { data } = await supabase
      .from('customers')
      .select('full_name')
      .eq('id', customerId)
      .maybeSingle();
    return data?.full_name || undefined;
  } catch {
    return undefined;
  }
}

function docTypeLabel(docType: DocumentPdfDocType | string): string {
  return DOCUMENT_PDF_DOC_TYPE_LABELS[docType as DocumentPdfDocType] || String(docType);
}

export function normalizeVerifyCodeInput(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Reject empty / huge / non-PDF (magic header when readable). */
export async function validatePdfFileForAuthenticity(
  file: File
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!file || file.size <= 0) {
    return { ok: false, message: 'File is empty.' };
  }
  if (file.size > PDF_AUTH_MAX_BYTES) {
    return {
      ok: false,
      message: `PDF is too large (max ${Math.round(PDF_AUTH_MAX_BYTES / (1024 * 1024))} MB).`,
    };
  }
  const nameOk = file.name.toLowerCase().endsWith('.pdf');
  const typeOk = !file.type || file.type === 'application/pdf' || file.type === 'application/x-pdf';
  if (!nameOk && !typeOk) {
    return { ok: false, message: 'Please upload a PDF file.' };
  }

  try {
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    const isPdf =
      head.length >= 4 &&
      head[0] === 0x25 &&
      head[1] === 0x50 &&
      head[2] === 0x44 &&
      head[3] === 0x46; // %PDF
    if (!isPdf) {
      return { ok: false, message: 'File does not look like a PDF (missing %PDF header).' };
    }
  } catch {
    return { ok: false, message: 'Could not read the file.' };
  }

  return { ok: true };
}

export async function resolvePdfAuthenticityBySha256(
  sha256Hex: string
): Promise<PdfAuthenticityResolve> {
  const hex = sha256Hex.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hex)) {
    return { status: 'error', message: 'Invalid SHA-256 (expected 64 hex characters).' };
  }

  const [amc, doc] = await Promise.all([
    lookupAmcPdfAuthenticityBySha256(hex),
    lookupDocumentPdfAuthenticityBySha256(hex),
  ]);

  if (amc.error) return { status: 'error', message: amc.error };
  if (doc.error) return { status: 'error', message: doc.error };

  if (amc.data) {
    return {
      status: 'match',
      hit: {
        kind: 'amc',
        row: amc.data,
        customerName: await withCustomerName(amc.data.customer_id),
        typeLabel: 'AMC agreement',
      },
    };
  }

  if (doc.data) {
    return {
      status: 'match',
      hit: {
        kind: 'document',
        row: doc.data,
        customerName: await withCustomerName(doc.data.customer_id),
        typeLabel: docTypeLabel(doc.data.doc_type),
      },
    };
  }

  return {
    status: 'unknown',
    sha256Hex: hex,
    message:
      'No fingerprint match. The file may have been edited, regenerated, or never issued from CRM.',
  };
}

export async function resolvePdfAuthenticityByVerifyCode(
  code: string
): Promise<PdfAuthenticityResolve> {
  const verifyCode = normalizeVerifyCodeInput(code);
  if (verifyCode.length !== 8) {
    return { status: 'error', message: 'Verify code must be 8 characters (letters/numbers).' };
  }

  const [amc, doc] = await Promise.all([
    lookupAmcPdfAuthenticityByVerifyCode(verifyCode),
    lookupDocumentPdfAuthenticityByVerifyCode(verifyCode),
  ]);

  // Both return the same validation error shape; prefer first real DB error
  if (amc.error && !amc.error.toLowerCase().includes('8 characters')) {
    return { status: 'error', message: amc.error };
  }
  if (doc.error && !doc.error.toLowerCase().includes('8 characters')) {
    return { status: 'error', message: doc.error };
  }

  if (amc.data) {
    return {
      status: 'code_found',
      hit: {
        kind: 'amc',
        row: amc.data,
        customerName: await withCustomerName(amc.data.customer_id),
        typeLabel: 'AMC agreement',
      },
    };
  }

  if (doc.data) {
    return {
      status: 'code_found',
      hit: {
        kind: 'document',
        row: doc.data,
        customerName: await withCustomerName(doc.data.customer_id),
        typeLabel: docTypeLabel(doc.data.doc_type),
      },
    };
  }

  return {
    status: 'unknown',
    message: 'No fingerprint found for this code.',
  };
}

export async function verifyPdfFileAuthenticity(file: File): Promise<
  PdfAuthenticityResolve & { sha256Hex?: string }
> {
  const valid = await validatePdfFileForAuthenticity(file);
  if (!valid.ok) return { status: 'error', message: valid.message };

  try {
    const sha256Hex = await sha256HexFromFile(file);
    const resolved = await resolvePdfAuthenticityBySha256(sha256Hex);
    return { ...resolved, sha256Hex };
  } catch (e) {
    return {
      status: 'error',
      message: e instanceof Error ? e.message : 'Failed to read PDF',
    };
  }
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
