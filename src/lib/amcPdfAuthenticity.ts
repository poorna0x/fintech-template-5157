/**
 * AMC PDF authenticity — SHA-256 fingerprint stored at Save to DB.
 * Admin verifies via Settings (upload PDF or enter verify code).
 */
import { supabase } from '@/lib/supabaseClient';
import { billToAmcPdfData, generateAMCHTML, type AMCPDFOptions } from '@/lib/amc-pdf-generator';
import { generateDocumentPdfBase64 } from '@/lib/server-pdf-download';
import { formatDocumentPdfVerifyFooterLine } from '@/lib/documentPdfAuthenticity';
import type { Bill } from '@/types';

const VERIFY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

export type AmcPdfAuthenticityRow = {
  id: string;
  amc_contract_id: string;
  verify_code: string;
  sha256_hex: string;
  pdf_filename: string | null;
  pdf_byte_length: number | null;
  generated_on: string;
  agreement_number: string | null;
  customer_id: string | null;
  created_at: string;
  updated_at: string;
};

export function generateAmcPdfVerifyCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += VERIFY_CODE_ALPHABET[bytes[i]! % VERIFY_CODE_ALPHABET.length];
  }
  return out;
}

export async function sha256HexFromBytes(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const view =
    bytes instanceof Uint8Array
      ? bytes
      : new Uint8Array(bytes);
  // Copy into a clean ArrayBuffer for subtle.digest typing
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256HexFromBase64(pdfBase64: string): Promise<string> {
  const raw = pdfBase64.includes(',')
    ? pdfBase64.slice(pdfBase64.indexOf(',') + 1)
    : pdfBase64;
  const binary = atob(raw.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return sha256HexFromBytes(bytes);
}

export async function sha256HexFromFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return sha256HexFromBytes(buffer);
}

/** Footer line that blends with existing footer-text (no QR). */
export function formatAmcPdfVerifyFooterLine(
  verifyCode: string,
  brand?: string | null
): string {
  return formatDocumentPdfVerifyFooterLine(verifyCode, brand);
}

export function buildAmcPdfAuthenticityOptions(opts: {
  verifyCode: string;
  generatedOnYmd: string;
  showComputerGeneratedText?: boolean;
}): AMCPDFOptions {
  return {
    showComputerGeneratedText: opts.showComputerGeneratedText,
    authenticityVerifyCode: opts.verifyCode,
    authenticityGeneratedOnYmd: opts.generatedOnYmd,
  };
}

/**
 * Generate the same Puppeteer PDF used for download, hash it, upsert fingerprint.
 */
export async function recordAmcPdfAuthenticityAfterSave(params: {
  amcContractId: string;
  customerId: string;
  bill: Bill;
  generatedOnYmd: string;
  showComputerGeneratedText?: boolean;
  /** If omitted, a new code is generated. */
  verifyCode?: string;
}): Promise<
  | { verifyCode: string; sha256Hex: string; pdfByteLength: number; pdfBase64: string; filename: string }
  | { error: string }
> {
  const verifyCode = params.verifyCode || generateAmcPdfVerifyCode();
  const pdfOptions = buildAmcPdfAuthenticityOptions({
    verifyCode,
    generatedOnYmd: params.generatedOnYmd,
    showComputerGeneratedText: params.showComputerGeneratedText,
  });

  const data = billToAmcPdfData(params.bill);
  const html = generateAMCHTML(data, pdfOptions);
  const filename = `AMC_${String(params.bill.billNumber || 'agreement').replace(/\s+/g, '_')}.pdf`;

  let pdfBase64: string;
  try {
    const generated = await generateDocumentPdfBase64({ html, filename });
    pdfBase64 = generated.pdfBase64;
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? e.message
          : 'Could not generate PDF for authenticity fingerprint',
    };
  }

  const sha256Hex = await sha256HexFromBase64(pdfBase64);
  const pdfByteLength = Math.ceil((pdfBase64.length * 3) / 4);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const row = {
    amc_contract_id: params.amcContractId,
    verify_code: verifyCode,
    sha256_hex: sha256Hex,
    pdf_filename: filename,
    pdf_byte_length: pdfByteLength,
    pdf_base64: pdfBase64,
    generated_on: params.generatedOnYmd,
    agreement_number: String(params.bill.billNumber || '').trim() || null,
    customer_id: params.customerId,
    created_by: user?.id ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('amc_pdf_authenticity').upsert(row, {
    onConflict: 'amc_contract_id',
  });

  if (error) {
    return { error: error.message || 'Failed to store PDF authenticity fingerprint' };
  }

  return { verifyCode, sha256Hex, pdfByteLength, pdfBase64, filename };
}

export async function lookupAmcPdfAuthenticityBySha256(
  sha256Hex: string
): Promise<{ data: AmcPdfAuthenticityRow | null; error: string | null }> {
  const hex = sha256Hex.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hex)) {
    return { data: null, error: 'Invalid SHA-256 (expected 64 hex characters)' };
  }
  const { data, error } = await supabase
    .from('amc_pdf_authenticity')
    .select(
      'id, amc_contract_id, verify_code, sha256_hex, pdf_filename, pdf_byte_length, generated_on, agreement_number, customer_id, created_at, updated_at'
    )
    .eq('sha256_hex', hex)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) return { data: null, error: error.message };
  return { data: (data?.[0] as AmcPdfAuthenticityRow) || null, error: null };
}

export async function lookupAmcPdfAuthenticityByVerifyCode(
  code: string
): Promise<{ data: AmcPdfAuthenticityRow | null; error: string | null }> {
  const verifyCode = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (verifyCode.length !== 8) {
    return { data: null, error: 'Verify code must be 8 characters' };
  }
  const { data, error } = await supabase
    .from('amc_pdf_authenticity')
    .select(
      'id, amc_contract_id, verify_code, sha256_hex, pdf_filename, pdf_byte_length, generated_on, agreement_number, customer_id, created_at, updated_at'
    )
    .eq('verify_code', verifyCode)
    .limit(1);
  if (error) return { data: null, error: error.message };
  return { data: (data?.[0] as AmcPdfAuthenticityRow) || null, error: null };
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** Download the exact PDF bytes stored at Save to DB (matches SHA-256 verify). */
export async function downloadStoredAmcAuthenticityPdf(
  amcContractId: string
): Promise<{ sha256Hex: string; filename: string }> {
  const { data, error } = await supabase
    .from('amc_pdf_authenticity')
    .select('pdf_base64, pdf_filename, sha256_hex')
    .eq('amc_contract_id', amcContractId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.pdf_base64) {
    throw new Error(
      'No stored authenticated PDF for this AMC. Save to DB again to create a fingerprint.'
    );
  }

  const hex = await sha256HexFromBase64(data.pdf_base64);
  if (hex !== String(data.sha256_hex || '').toLowerCase()) {
    throw new Error('Stored PDF does not match its fingerprint — save again.');
  }

  const filename = data.pdf_filename || `AMC_authenticated.pdf`;
  const buffer = base64ToArrayBuffer(data.pdf_base64);
  const blob = new Blob([buffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { sha256Hex: hex, filename };
}

/** Trigger download from in-memory base64 (right after Save). */
export function downloadAmcPdfBase64Blob(pdfBase64: string, filename: string): void {
  const buffer = base64ToArrayBuffer(pdfBase64);
  const blob = new Blob([buffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'AMC_authenticated.pdf';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
