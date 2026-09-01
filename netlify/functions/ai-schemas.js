/**
 * Lightweight request/response validation for the AI inbox assistant.
 * Kept dependency-free so Netlify functions do not need an extra Zod install.
 */

const ALLOWED_OPERATIONS = Object.freeze([
  'suggest_reply',
  'suggest_quotation',
  'build_quotation',
]);
const MAX_PHONE_LEN = 20;
const MAX_INSTRUCTION_CHARS = 4_000;
const MAX_SUGGEST_REPLY_INSTRUCTION_CHARS = 800;
const MAX_REPLY_CHARS = 1200;
const MAX_QUOTE_ITEMS = 12;
const MAX_ITEM_DESC = 200;
const MAX_NOTES = 8;
const MAX_NOTE_CHARS = 240;
const MAX_WARNINGS = 8;
const MAX_TERMS = 16;
const MAX_TERM_CHARS = 320;
const MAX_UNIT_PRICE = 10_000_000;

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

  const customerId = asTrimmedString(body?.customerId, 64) || null;
  if (operation === 'build_quotation') {
    const instruction = asTrimmedString(body?.instruction, MAX_INSTRUCTION_CHARS);
    if (instruction.length < 8) {
      return { ok: false, error: 'Describe the quotation in at least 8 characters' };
    }
    if (!customerId) {
      return { ok: false, error: 'Customer required' };
    }
    return {
      ok: true,
      value: {
        operation,
        phoneDigits: null,
        customerId,
        instruction,
        // Prices are only used when the admin explicitly states them in the brief.
        allowPrices: body?.allowPrices === true,
        saveQuotationDraft: false,
      },
    };
  }

  const phoneDigits = normalizePhoneDigits(body?.phoneE164 || body?.phone || body?.to);
  if (!phoneDigits) {
    return { ok: false, error: 'Valid phone required' };
  }

  const saveQuotationDraft = body?.saveQuotationDraft === true;
  const instruction =
    operation === 'suggest_reply'
      ? asTrimmedString(body?.instruction, MAX_SUGGEST_REPLY_INSTRUCTION_CHARS) || null
      : null;

  return {
    ok: true,
    value: {
      operation,
      phoneDigits,
      customerId,
      instruction,
      saveQuotationDraft: operation === 'suggest_quotation' ? saveQuotationDraft : false,
    },
  };
}

function clampConfidence(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function normalizeQuotationItems(rawItems, opts = {}) {
  if (!Array.isArray(rawItems)) return [];
  const items = [];
  for (const row of rawItems.slice(0, MAX_QUOTE_ITEMS)) {
    const description = asTrimmedString(row?.description || row?.name, MAX_ITEM_DESC);
    if (!description) continue;
    const quantityRaw = Number(row?.quantity);
    const quantity =
      Number.isFinite(quantityRaw) && quantityRaw > 0 ? Math.min(99, Math.round(quantityRaw * 100) / 100) : 1;

    // Prices stay zero unless the admin opted in to pricing from their own brief.
    let unitPrice = 0;
    if (opts.allowPrices === true) {
      const priceRaw = Number(row?.unitPrice ?? row?.price ?? row?.rate);
      if (Number.isFinite(priceRaw) && priceRaw > 0) {
        unitPrice = Math.min(MAX_UNIT_PRICE, Math.round(priceRaw * 100) / 100);
      }
    }

    items.push({
      description,
      quantity,
      unitPrice,
      taxRate: 0,
      taxAmount: 0,
      total: Math.round(unitPrice * quantity * 100) / 100,
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

function normalizeTerms(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((term) => asTrimmedString(term?.text || term, MAX_TERM_CHARS))
    .filter(Boolean)
    .slice(0, MAX_TERMS);
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
    const items = normalizeQuotationItems(q.items, { allowPrices: opts.allowPrices === true });
    quotation = {
      items,
      notes: normalizeNotes(q.notes),
      warnings: normalizeWarnings(q.warnings || warnings),
      customerName: asTrimmedString(q.customerName, 120) || null,
      notesHeading: asTrimmedString(q.notesHeading, 80) || 'Additional Info',
      terms: normalizeTerms(q.terms || q.termsAndConditions),
      validityNote: asTrimmedString(q.validityNote, 400),
      validityDays: Math.max(1, Math.min(180, Math.round(Number(q.validityDays) || 30))),
      gstOption:
        q.gstOption === 'normal' || q.gstOption === 'exclude' || q.gstOption === 'include'
          ? q.gstOption
          : 'include',
      showBankDetails: q.showBankDetails === true,
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
  normalizeTerms,
  assertNoMutationTools,
  normalizePhoneDigits,
};
