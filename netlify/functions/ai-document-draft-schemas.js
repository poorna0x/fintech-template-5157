const DOCUMENT_KINDS = Object.freeze([
  'bill',
  'quotation',
  'tax_invoice',
  'amc',
  'warranty',
  'letterhead',
]);

const COMMON_FIELDS = [
  'items',
  'notes',
  'addressChoice',
  'editableCustomer',
  'documentBrand',
];

const ALLOWED_FIELDS = Object.freeze({
  bill: new Set([
    ...COMMON_FIELDS,
    'billNumber',
    'billDate',
    'billMode',
    'notesHeading',
    'validityNote',
    'showValidityNote',
    'termItems',
    'serviceCharge',
    'extraChargeKind',
    'paymentStatus',
    'amountReceived',
    'paymentDueDate',
    'hideGstInHeader',
  ]),
  quotation: new Set([
    ...COMMON_FIELDS,
    'quotationNumber',
    'quotationDate',
    'validUntilDate',
    'isValidUntilManuallySet',
    'serviceCharge',
    'notesHeading',
    'validityNote',
    'showValidityNote',
    'termItems',
    'gstOption',
    'addGSTNoteToNotes',
    'showBankDetails',
    'sealVariant',
    'placeOfSupply',
    'placeOfSupplyCode',
  ]),
  tax_invoice: new Set([
    ...COMMON_FIELDS,
    'billNumber',
    'billDate',
    'signatureDate',
    'notesHeading',
    'validityNote',
    'showValidityNote',
    'termItems',
    'serviceCharge',
    'placeOfSupply',
    'placeOfSupplyCode',
    'reverseCharge',
    'eWayBillNo',
    'transportMode',
    'vehicleNo',
    'roundOff',
    'customerGstRequired',
    'invoiceType',
    'showBankDetails',
    'showComputerGeneratedText',
    'showFooterText',
    'showDigitallySignedText',
    'sealVariant',
    'useDSC',
    'dscAuthorizedSignatory',
    'dscNameDesignation',
    'dscCompanyName',
    'dscBoxWidth',
    'dscBoxHeight',
    'poNumber',
    'showPONumber',
    'poNumberRequired',
    'paymentDueDate',
    'paymentStatus',
    'amountReceived',
    'deliveryAddress',
    'showDeliveryAddress',
  ]),
  amc: new Set([
    ...COMMON_FIELDS,
    'billNumber',
    'billDate',
    'notes',
    'validity',
    'customFromDate',
    'customToDate',
    'roModel',
    'includesPreSedimentFiltration',
    'showComputerGeneratedText',
    'sealVariant',
    'servicePeriodKind',
    'servicePeriodCustomMonths',
    'terms',
    'amcCost',
    'serviceCharge',
    'paymentStatus',
    'amountReceived',
    'paymentDueDate',
    'agreementIntro',
    'description',
  ]),
  warranty: new Set([
    ...COMMON_FIELDS,
    'startDate',
    'defaultValue',
    'defaultUnit',
    'customNotes',
  ]),
  letterhead: new Set([
    'documentNumber',
    'documentType',
    'brand',
    'title',
    'titleAlignment',
    'titleSize',
    'titleCase',
    'layoutMode',
    'date',
    'subject',
    'referenceNumber',
    'cc',
    'showRecipientBlock',
    'recipientLabel',
    'showDocumentMeta',
    'showBrandTag',
    'customerName',
    'customerCompany',
    'siteLocation',
    'customerPhone',
    'customerEmail',
    'blocks',
    'leftSignatory',
    'rightSignatory',
    'useBrandSealAsStamp',
    'brandSealVariant',
    'hideLeftSignatory',
    'hideRightSignatory',
    'notes',
    'terms',
    'hideBrandFooter',
    'showPageBorder',
  ]),
});

const MAX_HISTORY_TURNS = 10;
const MAX_OPERATION_COUNT = 18;
const MAX_DRAFT_JSON_CHARS = 80_000;
const MAX_VALUE_JSON_CHARS = 32_000;

function cleanString(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function sanitizeJsonValue(value, depth = 0) {
  if (depth > 5 || value == null) return value == null ? null : undefined;
  if (typeof value === 'string') return value.slice(0, 4_000);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (Array.isArray(value)) {
    return value
      .slice(0, 40)
      .map((item) => sanitizeJsonValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value).slice(0, 80)) {
      if (/^(?:__proto__|prototype|constructor)$/i.test(key)) continue;
      const safe = sanitizeJsonValue(child, depth + 1);
      if (safe !== undefined) out[key.slice(0, 80)] = safe;
    }
    return out;
  }
  return undefined;
}

function sanitizeDraft(kind, rawDraft) {
  const allowed = ALLOWED_FIELDS[kind];
  if (!allowed || !rawDraft || typeof rawDraft !== 'object' || Array.isArray(rawDraft)) {
    return {};
  }
  const out = {};
  for (const field of allowed) {
    if (!Object.prototype.hasOwnProperty.call(rawDraft, field)) continue;
    const value =
      kind === 'letterhead' && field === 'blocks'
        ? normalizeLetterheadBlocks(rawDraft[field], rawDraft[field])
        : kind === 'letterhead' && (field === 'leftSignatory' || field === 'rightSignatory')
          ? normalizeLetterheadSignatory(rawDraft[field], rawDraft[field])
          : sanitizeJsonValue(rawDraft[field]);
    if (value !== undefined) out[field] = value;
  }
  const json = JSON.stringify(out);
  if (json.length > MAX_DRAFT_JSON_CHARS) {
    throw new Error('Document draft is too large for AI editing');
  }
  return out;
}

function sanitizeHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) return [];
  return rawHistory
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => {
      if (!turn || typeof turn !== 'object') return null;
      const role = turn.role === 'assistant' ? 'assistant' : 'user';
      const text = cleanString(turn.text, 1_200);
      return text ? { role, text } : null;
    })
    .filter(Boolean);
}

function normalizeItems(kind, value) {
  if (!Array.isArray(value)) return null;
  return value
    .slice(0, 40)
    .map((raw, index) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      const row = sanitizeJsonValue(raw);
      if (kind === 'warranty') {
        return {
          ...row,
          key: cleanString(row.key || `ai-warranty-${Date.now()}-${index}`, 100),
          category: cleanString(row.category || 'OTHER', 40),
          label: cleanString(row.label || `Warranty item ${index + 1}`, 160),
          durValue: Math.max(0, Math.min(3650, Math.round(Number(row.durValue) || 0))),
          durUnit: row.durUnit === 'days' ? 'days' : 'months',
          include: row.include !== false,
          covered: row.covered !== false,
          inventory_id: row.inventory_id ? cleanString(row.inventory_id, 100) : null,
          job_part_id: row.job_part_id ? cleanString(row.job_part_id, 100) : null,
        };
      }
      const quantity = Math.max(0.01, Math.min(10_000, Number(row.quantity) || 1));
      const unitPrice = Math.max(0, Math.min(100_000_000, Number(row.unitPrice) || 0));
      return {
        ...row,
        id: cleanString(row.id || `ai-item-${Date.now()}-${index}`, 100),
        description: cleanString(row.description || `Item ${index + 1}`, 240),
        quantity,
        unitPrice,
        total: Math.round(quantity * unitPrice * 100) / 100,
        taxRate: Math.max(0, Math.min(100, Number(row.taxRate) || 0)),
        taxAmount: Math.max(0, Number(row.taxAmount) || 0),
      };
    })
    .filter(Boolean);
}

function stubLetterheadImageSrc(src, id) {
  const value = String(src || '').trim();
  if (!value) return '';
  if (value.startsWith('data:') || value.length > 240) return `[kept-image:${id}]`;
  return value.slice(0, 240);
}

function normalizeLetterheadSignatory(value, currentValue) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    name: cleanString(value.name, 160),
    designation: cleanString(value.designation, 160),
    company: cleanString(value.company, 160),
    ...(currentValue?.imageUrl
      ? { imageUrl: stubLetterheadImageSrc(currentValue.imageUrl, 'signatory') }
      : {}),
  };
}

function normalizeLetterheadBlocks(value, currentValue) {
  if (!Array.isArray(value)) return null;
  const currentBlocks = Array.isArray(currentValue) ? currentValue : [];
  const currentById = new Map(
    currentBlocks
      .filter((block) => block && typeof block === 'object' && block.id)
      .map((block) => [String(block.id), block])
  );
  return value
    .slice(0, 80)
    .map((raw, index) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      const id = cleanString(raw.id || `ai-letterhead-${Date.now()}-${index}`, 100);
      const existing = currentById.get(id);
      if (raw.kind === 'text') {
        return {
          id,
          kind: 'text',
          html: String(raw.html || '').slice(0, 24_000),
        };
      }
      if (raw.kind === 'table') {
        const columns = (Array.isArray(raw.columns) ? raw.columns : [])
          .slice(0, 12)
          .map((item) => cleanString(item, 160));
        if (!columns.length) columns.push('Column 1');
        return {
          id,
          kind: 'table',
          title: cleanString(raw.title, 200),
          columns,
          rows: (Array.isArray(raw.rows) ? raw.rows : []).slice(0, 120).map((row) =>
            (Array.isArray(row) ? row : [])
              .slice(0, columns.length)
              .map((cell) => String(cell || '').slice(0, 500))
          ),
        };
      }
      if (raw.kind === 'image') {
        // AI may resize, align, wrap, caption, move or remove an existing image,
        // but it may never invent a URL or replace uploaded media.
        if (!existing || existing.kind !== 'image' || !existing.src) return null;
        return {
          id,
          kind: 'image',
          src: stubLetterheadImageSrc(existing.src, id),
          caption: cleanString(raw.caption, 300),
          widthPercent: Math.min(100, Math.max(10, Number(raw.widthPercent) || 80)),
          align: raw.align === 'left' || raw.align === 'right' ? raw.align : 'center',
          wrapText: raw.wrapText === true,
        };
      }
      if (raw.kind === 'pagebreak') return { id, kind: 'pagebreak' };
      return null;
    })
    .filter(Boolean);
}

function normalizeFieldValue(kind, field, value, currentValue) {
  if (field === 'items') return normalizeItems(kind, value);
  if (kind === 'letterhead' && field === 'blocks') {
    return normalizeLetterheadBlocks(value, currentValue);
  }
  if (kind === 'letterhead' && field === 'documentType') {
    return ['service_report', 'amc_report', 'custom_document', 'letterhead'].includes(value)
      ? value
      : null;
  }
  if (kind === 'letterhead' && field === 'brand') {
    return value === 'hydrogenro' || value === 'elevenro' ? value : null;
  }
  if (kind === 'letterhead' && field === 'brandSealVariant') {
    return value === 'sign' || value === 'stamp' ? value : null;
  }
  if (kind === 'letterhead' && field === 'titleAlignment') {
    return ['left', 'center', 'right'].includes(value) ? value : null;
  }
  if (kind === 'letterhead' && field === 'titleSize') {
    return ['small', 'medium', 'large', 'xlarge'].includes(value) ? value : null;
  }
  if (kind === 'letterhead' && field === 'layoutMode') {
    return value === 'certificate' || value === 'letter' ? value : null;
  }
  if (kind === 'letterhead' && field === 'titleCase') {
    return value === 'normal' || value === 'uppercase' ? value : null;
  }
  if (
    kind === 'letterhead' &&
    (field === 'leftSignatory' || field === 'rightSignatory')
  ) {
    return normalizeLetterheadSignatory(value, currentValue);
  }
  if (field === 'termItems') {
    if (!Array.isArray(value)) return null;
    return value
      .slice(0, 40)
      .map((raw, index) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        const row = sanitizeJsonValue(raw);
        return {
          ...row,
          id: cleanString(row.id || `ai-term-${Date.now()}-${index}`, 100),
          text: cleanString(row.text, 500),
          enabled: row.enabled !== false,
          group: cleanString(row.group || 'custom', 40),
        };
      })
      .filter((row) => row?.text);
  }
  if (Array.isArray(currentValue)) return Array.isArray(value) ? sanitizeJsonValue(value) : null;
  if (currentValue && typeof currentValue === 'object') {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? sanitizeJsonValue(value)
      : null;
  }
  if (typeof currentValue === 'number') {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  if (typeof currentValue === 'boolean') return typeof value === 'boolean' ? value : null;
  if (typeof currentValue === 'string') {
    return typeof value === 'string' ? cleanString(value, 4_000) : null;
  }
  return sanitizeJsonValue(value);
}

function parseDocumentDraftRequest(body) {
  const src = body && typeof body === 'object' ? body : {};
  const kind = cleanString(src.kind, 30);
  if (!DOCUMENT_KINDS.includes(kind)) return { ok: false, error: 'Unsupported document type' };
  const message = cleanString(src.message, 4_000);
  if (message.length < 2) return { ok: false, error: 'Describe the document change' };
  try {
    return {
      ok: true,
      value: {
        kind,
        message,
        currentDraft: sanitizeDraft(kind, src.currentDraft),
        history: sanitizeHistory(src.history),
      },
    };
  } catch (error) {
    return { ok: false, error: error.message || 'Invalid document draft' };
  }
}

function normalizeDocumentDraftOutput(kind, raw, currentDraft) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const allowed = ALLOWED_FIELDS[kind];
  const patch = {};
  const changes = [];
  const warnings = Array.isArray(src.warnings)
    ? src.warnings.map((value) => cleanString(value, 240)).filter(Boolean).slice(0, 8)
    : [];
  const operations = Array.isArray(src.operations)
    ? src.operations.slice(0, MAX_OPERATION_COUNT)
    : [];

  for (const operation of operations) {
    if (!operation || typeof operation !== 'object') continue;
    const field = cleanString(operation.field, 80);
    if (!allowed?.has(field)) continue;
    if (!Object.prototype.hasOwnProperty.call(currentDraft, field)) continue;
    const valueJson = String(operation.valueJson ?? '');
    if (!valueJson || valueJson.length > MAX_VALUE_JSON_CHARS) continue;
    try {
      const parsed = JSON.parse(valueJson);
      const safe = normalizeFieldValue(kind, field, parsed, currentDraft[field]);
      if (safe == null) continue;
      patch[field] = safe;
      changes.push({
        field,
        explanation: cleanString(operation.explanation || `Update ${field}`, 240),
      });
    } catch {
      warnings.push(`Skipped invalid change for ${field}.`);
    }
  }

  const answer =
    cleanString(src.answer, 1_200) ||
    (changes.length ? 'I prepared document changes for your review.' : 'I need more detail.');

  return {
    answer,
    patch,
    changes,
    warnings: [...new Set(warnings)].slice(0, 8),
    confidence: Math.max(0, Math.min(1, Number(src.confidence) || 0.5)),
    requiresHuman: true,
  };
}

module.exports = {
  DOCUMENT_KINDS,
  ALLOWED_FIELDS,
  parseDocumentDraftRequest,
  normalizeDocumentDraftOutput,
  sanitizeDraft,
  sanitizeHistory,
};
