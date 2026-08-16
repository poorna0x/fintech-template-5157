/**
 * Lightweight request/response validation for the AI inbox assistant.
 * Kept dependency-free so Netlify functions do not need an extra Zod install.
 */

const ALLOWED_OPERATIONS = Object.freeze(['suggest_reply', 'suggest_quotation']);
const MAX_PHONE_LEN = 20;
const MAX_REPLY_CHARS = 1200;
const MAX_QUOTE_ITEMS = 12;
const MAX_ITEM_DESC = 200;
const MAX_NOTES = 8;
const MAX_NOTE_CHARS = 240;
const MAX_WARNINGS = 8;

function asTrimmedString(value, maxLen) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  return text.slice(0, maxLen);
}

function normalizePhoneDigits(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > MAX_PHONE_LEN) return null;
  return digits;
}

function parseSuggestRequest(body) {
  const operation = asTrimmedString(body?.operation, 40) || 'suggest_reply';
  if (!ALLOWED_OPERATIONS.includes(operation)) {
    return { ok: false, error: 'Unsupported operation' };
  }

  const phoneDigits = normalizePhoneDigits(body?.phoneE164 || body?.phone || body?.to);
  if (!phoneDigits) {
    return { ok: false, error: 'Valid phone required' };
  }

  const customerId = asTrimmedString(body?.customerId, 64) || null;
  const saveQuotationDraft = body?.saveQuotationDraft === true;

  return {
    ok: true,
    value: {
      operation,
      phoneDigits,
      customerId,
      saveQuotationDraft: operation === 'suggest_quotation' ? saveQuotationDraft : false,
    },
  };
}

function clampConfidence(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function normalizeQuotationItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  const items = [];
  for (const row of rawItems.slice(0, MAX_QUOTE_ITEMS)) {
    const description = asTrimmedString(row?.description || row?.name, MAX_ITEM_DESC);
    if (!description) continue;
    const quantityRaw = Number(row?.quantity);
    const quantity =
      Number.isFinite(quantityRaw) && quantityRaw > 0 ? Math.min(99, Math.round(quantityRaw * 100) / 100) : 1;
    items.push({
      description,
      quantity,
      // Selling prices are never trusted from the model.
      unitPrice: 0,
      taxRate: 0,
      taxAmount: 0,
      total: 0,
    });
  }
  return items;
}

function normalizeWarnings(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((w) => asTrimmedString(w, MAX_NOTE_CHARS))
    .filter(Boolean)
    .slice(0, MAX_WARNINGS);
}

function normalizeNotes(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((n) => asTrimmedString(n, MAX_NOTE_CHARS))
    .filter(Boolean)
    .slice(0, MAX_NOTES);
}

/**
 * Normalize provider JSON into a safe suggestion payload.
 * Always forces quotation prices to zero.
 */
function normalizeSuggestionOutput(raw, opts = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const replyText = asTrimmedString(src.replyText || src.reply || src.text, MAX_REPLY_CHARS);
  const intent = asTrimmedString(src.intent || 'general_reply', 64) || 'general_reply';
  const confidence = clampConfidence(src.confidence);
  const requiresHuman = src.requiresHuman === true || confidence < 0.35;
  const warnings = normalizeWarnings(src.warnings || src.clarifications);

  let quotation = null;
  const wantQuote = opts.includeQuotation === true || src.quotation || src.quotationProposal;
  if (wantQuote) {
    const q = src.quotation || src.quotationProposal || {};
    const items = normalizeQuotationItems(q.items);
    quotation = {
      items,
      notes: normalizeNotes(q.notes),
      warnings: normalizeWarnings(q.warnings || warnings),
      customerName: asTrimmedString(q.customerName, 120) || null,
    };
  }

  if (!replyText && !(quotation && quotation.items.length)) {
    return { ok: false, error: 'Empty model output' };
  }

  return {
    ok: true,
    value: {
      replyText: replyText || '',
      intent,
      confidence,
      requiresHuman,
      warnings,
      quotation,
    },
  };
}

function assertNoMutationTools(toolNames) {
  const banned = [
    'delete',
    'remove',
    'update',
    'create_job',
    'send_whatsapp',
    'execute_sql',
    'run_rpc',
    'fetch_url',
  ];
  const list = Array.isArray(toolNames) ? toolNames : [];
  for (const name of list) {
    const n = String(name || '').toLowerCase();
    if (banned.some((b) => n.includes(b))) {
      throw new Error(`Disallowed tool: ${name}`);
    }
  }
  return true;
}

module.exports = {
  ALLOWED_OPERATIONS,
  MAX_REPLY_CHARS,
  parseSuggestRequest,
  normalizeSuggestionOutput,
  normalizeQuotationItems,
  assertNoMutationTools,
  normalizePhoneDigits,
};
