/**
 * Document PDF authenticity (non-AMC) — SHA-256 + verify code only (no PDF bytes in DB).
 * Fingerprint the exact Puppeteer bytes you send/download; regenerate later will not match.
 */
import { supabase } from '@/lib/supabaseClient';
import { sha256HexFromBase64, sha256HexFromFile } from '@/lib/amcPdfAuthenticity';

const VERIFY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

export type DocumentPdfDocType =
  | 'service_bill'
  | 'quotation'
  | 'invoice'
  | 'warranty'
  | 'amc'
  | 'salary_slip';

export const DOCUMENT_PDF_DOC_TYPE_LABELS: Record<DocumentPdfDocType, string> = {
  service_bill: 'Service bill',
  quotation: 'Quotation',
  invoice: 'Tax invoice',
  warranty: 'Warranty card',
  amc: 'AMC agreement',
  salary_slip: 'Salary slip',
};

export type DocumentPdfAuthenticityRow = {
  id: string;
  doc_type: DocumentPdfDocType;
  source_key: string;
  verify_code: string;
  sha256_hex: string;
  pdf_filename: string | null;
  pdf_byte_length: number | null;
  generated_on: string;
  document_ref: string | null;
  customer_id: string | null;
  created_at: string;
  updated_at: string;
};

export function generateDocumentPdfVerifyCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += VERIFY_CODE_ALPHABET[bytes[i]! % VERIFY_CODE_ALPHABET.length];
  }
  return out;
}

/** Public host for /authenticity based on which brand issued the PDF. */
export function pdfAuthenticityPublicHost(brand?: string | null): string {
  return String(brand || '').toLowerCase() === 'elevenro' ? 'elevenro.com' : 'hydrogenro.com';
}

/**
 * Footer line shown on customer PDFs (no CRM wording).
 * Example: Verify authenticity at elevenro.com/authenticity · Code AB12CD34
 */
export function formatDocumentPdfVerifyFooterLine(
  verifyCode: string,
  brand?: string | null
): string {
  const host = pdfAuthenticityPublicHost(brand);
  return `Verify authenticity at ${host}/authenticity · Code ${verifyCode}`;
}

export function todayYmdIst(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Store hash + verify code for a generated PDF. Soft-fail: never throws for DB errors.
 */
export async function recordDocumentPdfAuthenticity(params: {
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
  if (!sourceKey) {
    return { ok: false, error: 'Missing document source key for authenticity fingerprint' };
  }

  const verifyCode = params.verifyCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(verifyCode)) {
    return { ok: false, error: 'Invalid verify code' };
  }

  const customerId =
    params.customerId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      params.customerId.trim()
    )
      ? params.customerId.trim()
      : null;

  try {
    const sha256Hex = await sha256HexFromBase64(params.pdfBase64);
    const pdfByteLength = Math.ceil((params.pdfBase64.replace(/^data:[^;]+;base64,/, '').length * 3) / 4);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const row = {
      doc_type: params.docType,
      source_key: sourceKey.slice(0, 200),
      verify_code: verifyCode,
      sha256_hex: sha256Hex,
      pdf_filename: params.filename || null,
      pdf_byte_length: pdfByteLength,
      generated_on: params.generatedOnYmd || todayYmdIst(),
      document_ref: (params.documentRef?.trim() || sourceKey).slice(0, 200),
      customer_id: customerId,
      created_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('document_pdf_authenticity').insert(row);

    if (error) {
      console.warn('[documentPdfAuthenticity] insert failed:', error.message);
      return { ok: false, error: error.message };
    }

    return { ok: true, sha256Hex };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to fingerprint PDF';
    console.warn('[documentPdfAuthenticity]', message);
    return { ok: false, error: message };
  }
}

const SELECT_COLS =
  'id, doc_type, source_key, verify_code, sha256_hex, pdf_filename, pdf_byte_length, generated_on, document_ref, customer_id, created_at, updated_at';

export async function lookupDocumentPdfAuthenticityBySha256(
  sha256Hex: string
): Promise<{ data: DocumentPdfAuthenticityRow | null; error: string | null }> {
  const hex = sha256Hex.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hex)) {
    return { data: null, error: 'Invalid SHA-256 (expected 64 hex characters)' };
  }
  const { data, error } = await supabase
    .from('document_pdf_authenticity')
    .select(SELECT_COLS)
    .eq('sha256_hex', hex)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) return { data: null, error: error.message };
  return { data: (data?.[0] as DocumentPdfAuthenticityRow) || null, error: null };
}

export async function lookupDocumentPdfAuthenticityByVerifyCode(
  code: string
): Promise<{ data: DocumentPdfAuthenticityRow | null; error: string | null }> {
  const verifyCode = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (verifyCode.length !== 8) {
    return { data: null, error: 'Verify code must be 8 characters' };
  }
  const { data, error } = await supabase
    .from('document_pdf_authenticity')
    .select(SELECT_COLS)
    .eq('verify_code', verifyCode)
    .limit(1);
  if (error) return { data: null, error: error.message };
  return { data: (data?.[0] as DocumentPdfAuthenticityRow) || null, error: null };
}

export { sha256HexFromFile };
