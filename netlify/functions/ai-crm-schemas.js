/**
 * Request/response validation for the admin CRM AI chat.
 * Dependency-free. Never trusts client provider/model/tools/SQL.
 */

const ALLOWED_ACTION_TYPES = Object.freeze([
  'open_customer',
  'create_customer',
  'create_customer_and_job',
  'edit_customer',
  'create_job',
  'schedule_follow_up',
  'create_reminder',
  'open_app',
  'open_document_draft',
  'open_job',
  'open_customer_composer',
  'send_payment_qr',
]);

const ALLOWED_APP_TARGETS = Object.freeze([
  'dashboard',
  'ongoing_jobs',
  'completed_jobs',
  'followup_jobs',
  'payments',
  'billing',
  'analytics',
  'inventory',
  'gst_invoices',
  'amc_contracts',
  'letterhead_documents',
  'settings',
  'dashboard_settings',
  'whatsapp_inbox',
  'whatsapp_settings',
  'calling',
  'reminders',
  'pending_payments',
  'recurring_service',
  'advanced_search',
  'warranty',
  'privacy_center',
  'pdf_authenticity',
  'ai_usage',
  'database_storage',
  'direct_sale',
  'lead_catalog',
  'job_reviews',
  'technicians',
  'technician_locations',
  'todo_tasks',
  'payment_qr',
  'quick_upi_qr',
  'product_qr',
  'data_export',
  'app_lock',
  'recent_accounts',
  'quick_customer',
  'amount_trackers',
  'sent_email_log',
  'measure_distance',
  'arrange_visit_order',
  'nearby_jobs',
  'technician_live_location',
  'message_technician',
]);

const ALLOWED_DOCUMENT_DRAFT_TYPES = Object.freeze([
  'quotation',
  'service_bill',
  'tax_invoice',
  'amc',
  'warranty',
]);

const ALLOWED_JOB_OPEN_MODES = Object.freeze([
  'details',
  'edit',
  'assign',
  'reassign',
  'complete',
  'follow_up',
]);

const ALLOWED_COMPOSER_CHANNELS = Object.freeze(['whatsapp', 'email']);
const ALLOWED_COMPOSER_TEMPLATES = Object.freeze([
  'general',
  'pending_payment',
  'service_reminder',
  'quotation',
  'invoice',
]);

const MAX_MESSAGE_CHARS = 1500;
const MAX_ANSWER_CHARS = 1800;
const MAX_WARNINGS = 8;
const MAX_ACTIONS = 4;
const MAX_FIELD_CHARS = 240;
const MAX_HISTORY_TURNS = 8;
const MAX_HISTORY_CHARS = 600;

function asTrimmedString(value, maxLen) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  return text.slice(0, maxLen);
}

function clampConfidence(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function parseCrmChatRequest(body) {
  const message = asTrimmedString(body?.message, MAX_MESSAGE_CHARS);
  if (message.length < 2) {
    return { ok: false, error: 'Message required' };
  }

  const focusCustomerId = asTrimmedString(body?.focusCustomerId, 64) || null;
  const conversationId = asTrimmedString(body?.conversationId, 80) || null;
  const history = [];
  for (const turn of Array.isArray(body?.history) ? body.history.slice(-MAX_HISTORY_TURNS) : []) {
    if (!turn || typeof turn !== 'object') continue;
    const role = turn.role === 'assistant' ? 'assistant' : turn.role === 'user' ? 'user' : null;
    const text = asTrimmedString(turn.text, MAX_HISTORY_CHARS);
    if (role && text) history.push({ role, text });
  }

  return {
    ok: true,
    value: {
      operation: 'crm_chat',
      message,
      focusCustomerId,
      conversationId,
      history,
    },
  };
}

function normalizeWarnings(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((w) => asTrimmedString(w, MAX_FIELD_CHARS))
    .filter(Boolean)
    .slice(0, MAX_WARNINGS);
}

const JOB_TIME_SLOTS = ['MORNING', 'AFTERNOON', 'EVENING', 'FLEXIBLE', 'CUSTOM'];

/**
 * Accept either a CRM slot name or a clock time ("10 am", "14:30") and return
 * the slot the job form understands plus an exact HH:MM when given.
 */
function normalizeTimeSlot(rawSlot, rawCustom) {
  const slot = asTrimmedString(rawSlot, 20).toUpperCase();
  const parseClock = (value) => {
    const text = asTrimmedString(value, 20).toLowerCase();
    const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    if (!Number.isFinite(hour) || hour > 23 || minute > 59) return null;
    const meridiem = match[3];
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  };

  const custom = parseClock(rawCustom) || (JOB_TIME_SLOTS.includes(slot) ? null : parseClock(slot));
  if (custom) return { slot: 'CUSTOM', custom };
  if (JOB_TIME_SLOTS.includes(slot)) return { slot, custom: null };
  return { slot: null, custom: null };
}

function normalizeCreateJobPayload(raw, knownCustomerIds) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const customerId = asTrimmedString(src.customerId, 64);
  if (!customerId || !knownCustomerIds.has(customerId)) return null;
  return { customerId, ...normalizeJobFields(src) };
}

function normalizeJobFields(src) {
  const time = normalizeTimeSlot(
    src.scheduledTimeSlot || src.scheduled_time_slot,
    src.scheduledTimeCustom || src.scheduled_time_custom
  );
  return {
    serviceType:
      src.serviceType === 'SOFTENER' || src.service_type === 'SOFTENER' ? 'SOFTENER' : 'RO',
    serviceSubType: asTrimmedString(src.serviceSubType || src.service_sub_type, 80) || 'Service',
    scheduledDate: asTrimmedString(src.scheduledDate || src.scheduled_date, 10) || null,
    scheduledTimeSlot: time.slot,
    scheduledTimeCustom: time.custom,
    description: asTrimmedString(src.description, 500),
    priority: asTrimmedString(src.priority, 12).toUpperCase() || 'MEDIUM',
    leadSource: asTrimmedString(src.leadSource || src.lead_source, 80),
    notes: asTrimmedString(src.notes, 500),
  };
}

function normalizePhone(raw) {
  const text = asTrimmedString(raw, 30);
  if (!text) return '';
  const digits = text.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits.slice(0, 15);
}

function normalizeCustomerFields(raw, { requireAny = true } = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const fields = {
    fullName: asTrimmedString(src.fullName || src.full_name || src.name, 120),
    phone: normalizePhone(src.phone),
    alternatePhone: normalizePhone(src.alternatePhone || src.alternate_phone),
    email: asTrimmedString(src.email, 160),
    address: asTrimmedString(src.address, 500),
    visibleAddress: asTrimmedString(
      src.visibleAddress || src.visible_address || src.locationLabel || src.location_label,
      240
    ),
    googleLocation: asTrimmedString(
      src.googleLocation || src.google_location || src.mapsLink || src.maps_link,
      500
    ),
    serviceType:
      src.serviceType === 'SOFTENER' || src.service_type === 'SOFTENER'
        ? 'SOFTENER'
        : src.serviceType === 'RO' || src.service_type === 'RO'
          ? 'RO'
          : '',
    brand: asTrimmedString(src.brand, 100),
    model: asTrimmedString(src.model, 100),
    notes: asTrimmedString(src.customerNotes || src.customer_notes || src.notes, 500),
  };
  if (requireAny && !fields.fullName && !fields.phone) return null;
  return fields;
}

function normalizeCreateCustomerPayload(raw, withJob = false) {
  const customer = normalizeCustomerFields(raw);
  if (!customer) return null;
  return withJob ? { ...customer, ...normalizeJobFields(raw) } : customer;
}

function normalizeEditCustomerPayload(raw, knownCustomerIds) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const customerId = asTrimmedString(src.customerId, 64);
  if (!customerId || !knownCustomerIds.has(customerId)) return null;
  const patch = normalizeCustomerFields(src.patch || src, { requireAny: false });
  const editable = Object.fromEntries(
    Object.entries(patch || {}).filter(([key, value]) => key !== 'serviceType' && value !== '')
  );
  if (!Object.keys(editable).length) return null;
  return { customerId, patch: editable };
}

function normalizeFollowUpPayload(raw, knownJobIds) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const jobId = asTrimmedString(src.jobId, 64);
  if (!jobId || !knownJobIds.has(jobId)) return null;
  return {
    jobId,
    followUpDate: asTrimmedString(src.followUpDate || src.follow_up_date, 10) || null,
    followUpTime: asTrimmedString(src.followUpTime || src.follow_up_time, 8) || null,
    followUpReason: asTrimmedString(src.followUpReason || src.reason, 200) || 'Not confirmed',
    addAmcReminder: src.addAmcReminder === true,
  };
}

function normalizeReminderPayload(raw, knownCustomerIds) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const customerId = asTrimmedString(src.customerId, 64) || null;
  if (customerId && !knownCustomerIds.has(customerId)) return null;
  const title = asTrimmedString(src.title, 160);
  if (!title) return null;
  return {
    customerId,
    title,
    notes: asTrimmedString(src.notes, 500),
    reminderAt: asTrimmedString(src.reminderAt || src.reminder_at, 10) || null,
  };
}

function normalizeOpenAppPayload(raw, knownCustomerIds) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const target = asTrimmedString(src.target, 80);
  if (!ALLOWED_APP_TARGETS.includes(target)) return null;
  const payload = { target };
  if (target === 'quick_upi_qr') {
    const customerId = asTrimmedString(src.customerId || src.customer_id, 64);
    if (customerId) {
      if (knownCustomerIds && !knownCustomerIds.has(customerId)) return null;
      payload.customerId = customerId;
    }
    const amount = Number(src.amount);
    if (Number.isFinite(amount) && amount > 0) {
      payload.amount = Number(amount.toFixed(2));
    }
    const phone = normalizePhone(src.phone || src.whatsapp || src.to);
    if (phone.length >= 10) payload.phone = phone;
  }
  return payload;
}

function normalizeSendPaymentQrPayload(raw, knownCustomerIds) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const phone = normalizePhone(src.phone || src.whatsapp || src.to);
  if (phone.length < 10) return null;
  const amount = Number(src.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const payload = {
    phone,
    amount: Number(amount.toFixed(2)),
  };
  const customerId = asTrimmedString(src.customerId || src.customer_id, 64);
  if (customerId) {
    if (knownCustomerIds && !knownCustomerIds.has(customerId)) return null;
    payload.customerId = customerId;
  }
  const customerName = asTrimmedString(src.customerName || src.customer_name || src.name, 120);
  if (customerName) payload.customerName = customerName;
  return payload;
}

function normalizeOpenDocumentDraftPayload(raw, knownCustomerIds) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const documentType = asTrimmedString(src.documentType || src.document_type, 40);
  const customerId = asTrimmedString(src.customerId || src.customer_id, 64);
  if (!ALLOWED_DOCUMENT_DRAFT_TYPES.includes(documentType)) return null;
  if (!customerId || !knownCustomerIds.has(customerId)) return null;
  return {
    documentType,
    customerId,
    instruction: asTrimmedString(src.instruction || src.prompt || src.request, 500),
  };
}

function normalizeOpenJobPayload(raw, knownJobIds) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const jobId = asTrimmedString(src.jobId || src.job_id, 64);
  const mode = asTrimmedString(src.mode, 30) || 'details';
  if (!jobId || !knownJobIds.has(jobId) || !ALLOWED_JOB_OPEN_MODES.includes(mode)) return null;
  return { jobId, mode };
}

function normalizeOpenCustomerComposerPayload(raw, knownCustomerIds) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const customerId = asTrimmedString(src.customerId || src.customer_id, 64);
  const channel = asTrimmedString(src.channel, 20);
  const template = asTrimmedString(src.template, 40) || 'general';
  if (!customerId || !knownCustomerIds.has(customerId)) return null;
  if (!ALLOWED_COMPOSER_CHANNELS.includes(channel)) return null;
  if (!ALLOWED_COMPOSER_TEMPLATES.includes(template)) return null;
  return { customerId, channel, template };
}

/**
 * Normalize model JSON into a safe CRM chat payload.
 * Mutations are never executed here — only proposed with requiresConfirm.
 */
function normalizeCrmChatOutput(raw, opts = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const answer = asTrimmedString(src.answer || src.replyText || src.text, MAX_ANSWER_CHARS);
  const confidence = clampConfidence(src.confidence);
  const requiresHuman = src.requiresHuman === true || confidence < 0.35;
  const warnings = normalizeWarnings(src.warnings);

  const knownCustomerIds = new Set(
    (opts.entities?.customers || []).map((c) => String(c.id)).filter(Boolean)
  );
  const knownJobIds = new Set(
    (opts.entities?.jobs || []).map((j) => String(j.id)).filter(Boolean)
  );

  const proposedActions = [];
  const rawActions = Array.isArray(src.proposedActions) ? src.proposedActions : [];
  for (const row of rawActions.slice(0, MAX_ACTIONS)) {
    if (!row || typeof row !== 'object') continue;
    const type = asTrimmedString(row.type, 40);
    if (!ALLOWED_ACTION_TYPES.includes(type)) continue;

    let payload = null;
    if (type === 'open_customer') {
      const customerId = asTrimmedString(row.payload?.customerId || row.customerId, 64);
      if (!customerId || !knownCustomerIds.has(customerId)) continue;
      payload = { customerId };
    } else if (type === 'create_customer') {
      payload = normalizeCreateCustomerPayload(row.payload || row);
    } else if (type === 'create_customer_and_job') {
      payload = normalizeCreateCustomerPayload(row.payload || row, true);
    } else if (type === 'edit_customer') {
      payload = normalizeEditCustomerPayload(row.payload || row, knownCustomerIds);
    } else if (type === 'create_job') {
      payload = normalizeCreateJobPayload(row.payload || row, knownCustomerIds);
    } else if (type === 'schedule_follow_up') {
      payload = normalizeFollowUpPayload(row.payload || row, knownJobIds);
    } else if (type === 'create_reminder') {
      payload = normalizeReminderPayload(row.payload || row, knownCustomerIds);
    } else if (type === 'open_app') {
      payload = normalizeOpenAppPayload(row.payload || row, knownCustomerIds);
    } else if (type === 'open_document_draft') {
      payload = normalizeOpenDocumentDraftPayload(row.payload || row, knownCustomerIds);
    } else if (type === 'open_job') {
      payload = normalizeOpenJobPayload(row.payload || row, knownJobIds);
    } else if (type === 'open_customer_composer') {
      payload = normalizeOpenCustomerComposerPayload(row.payload || row, knownCustomerIds);
    } else if (type === 'send_payment_qr') {
      payload = normalizeSendPaymentQrPayload(row.payload || row, knownCustomerIds);
    }
    if (!payload) continue;

    proposedActions.push({
      type,
      label: asTrimmedString(row.label, 120) || type.replace(/_/g, ' '),
      confidence: clampConfidence(row.confidence ?? confidence),
      requiresConfirm: true,
      payload,
    });
  }

  if (!answer && !proposedActions.length && !(opts.entities?.customers || []).length) {
    return { ok: false, error: 'Empty model output' };
  }

  return {
    ok: true,
    value: {
      answer:
        answer ||
        (proposedActions.length
          ? 'I prepared reviewed action drafts. Confirm in the CRM form to apply.'
          : 'No matching CRM records found for that query.'),
      confidence,
      requiresHuman,
      warnings,
      proposedActions,
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
  ALLOWED_ACTION_TYPES,
  ALLOWED_APP_TARGETS,
  ALLOWED_DOCUMENT_DRAFT_TYPES,
  ALLOWED_JOB_OPEN_MODES,
  ALLOWED_COMPOSER_CHANNELS,
  ALLOWED_COMPOSER_TEMPLATES,
  MAX_MESSAGE_CHARS,
  parseCrmChatRequest,
  normalizeCrmChatOutput,
  assertNoMutationTools,
};
