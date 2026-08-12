/**
 * Server-side document PDF authenticity insert (service role).
 * Hash-only — same table as client recordDocumentPdfAuthenticity.
 */
const crypto = require('crypto');

const ALLOWED_DOC_TYPES = new Set([
  'service_bill',
  'quotation',
  'invoice',
  'warranty',
  'amc',
]);

function sha256HexFromBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function todayYmdIst() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function normalizeVerifyCode(code) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

function normalizeDocType(docType) {
  const t = String(docType || '')
    .trim()
    .toLowerCase();
  if (ALLOWED_DOC_TYPES.has(t)) return t;
  if (t === 'bill') return 'service_bill';
  if (t === 'amc_document') return 'amc';
  if (t === 'warranty_document') return 'warranty';
  return 'quotation';
}

function normalizeCustomerId(value) {
  const id = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : null;
}

function previewAuthenticitySourceKey(sourceKey) {
  const key = String(sourceKey || '').trim();
  if (!key) return '';
  return key.endsWith(':preview') ? key : `${key}:preview`;
}

/**
 * @returns {Promise<{ ok: true, sha256Hex: string } | { ok: false, error: string }>}
 */
async function recordDocumentPdfAuthenticityServer(db, params) {
  if (!db) return { ok: false, error: 'Service unavailable' };

  const sourceKey = String(params.sourceKey || '').trim().slice(0, 200);
  if (!sourceKey) return { ok: false, error: 'Missing source key' };

  const verifyCode = normalizeVerifyCode(params.verifyCode);
  if (!/^[A-Z0-9]{8}$/.test(verifyCode)) {
    return { ok: false, error: 'Invalid verify code' };
  }

  const buf = params.pdfBuffer;
  if (!buf || !Buffer.isBuffer(buf) || buf.length < 32) {
    return { ok: false, error: 'Invalid PDF bytes' };
  }

  const docType = normalizeDocType(params.docType);
  const sha256Hex = sha256HexFromBuffer(buf);
  const documentRef = String(params.documentRef || sourceKey).trim().slice(0, 200);

  const row = {
    doc_type: docType,
    source_key: sourceKey,
    verify_code: verifyCode,
    sha256_hex: sha256Hex,
    pdf_filename: params.filename || null,
    pdf_byte_length: buf.length,
    generated_on: params.generatedOnYmd || todayYmdIst(),
    document_ref: documentRef || null,
    customer_id: normalizeCustomerId(params.customerId),
    created_by: normalizeCustomerId(params.createdBy),
    updated_at: new Date().toISOString(),
  };

  const { error } = await db.from('document_pdf_authenticity').insert(row);
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, sha256Hex };
}

module.exports = {
  normalizeDocType,
  previewAuthenticitySourceKey,
  recordDocumentPdfAuthenticityServer,
  todayYmdIst,
};
