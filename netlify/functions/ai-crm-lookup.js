/**
 * Bounded, allowlisted CRM lookups for the admin AI chat.
 * Service-role only. Thin columns. No PDF/media bytes. No arbitrary SQL.
 */

const { getServiceSupabase } = require('./whatsapp-helper');

const CUSTOMER_LIMIT = 12;
const JOB_LIMIT = 10;
const REMINDER_LIMIT = 12;
const PAYMENT_LIMIT = 10;
const DOCUMENT_LIMIT = 8;
const PENDING_PAYMENT_TITLE = 'Pending payment';

const CUSTOMER_COLS =
  'id, customer_id, full_name, phone, alternate_phone, email, service_type, brand, model, last_service_date, customer_tier, status';

const JOB_COLS =
  'id, job_number, customer_id, status, service_type, service_sub_type, service_brand, payment_amount, actual_cost, payment_method, completed_at, scheduled_date';

const REMINDER_COLS =
  'id, entity_type, entity_id, title, notes, reminder_at, completed_at, created_at';

const AMC_COLS = 'id, customer_id, start_date, end_date, years, status, service_period_months';
const TAX_COLS = 'id, invoice_number, invoice_date, customer_id, customer_name, total_amount';
const AUTH_COLS = 'id, doc_type, customer_id, verify_code, created_at';

function escapeForLike(raw) {
  return String(raw || '')
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/,/g, ' ');
}

function normalizePhoneDigits(raw) {
  return String(raw || '').replace(/\D/g, '');
}

function extractQueryHints(message) {
  const text = String(message || '').trim();
  const phoneMatch = text.match(/(?:\+?91[\s-]*)?([6-9]\d{9})\b/);
  const phone = phoneMatch?.[1] || null;

  const jobMatch = text.match(/\b(?:job\s*#?\s*)?([A-Z]{1,4}\d{2,}[A-Z0-9-]*)\b/i);
  const jobNumber = jobMatch?.[1] && /[0-9]/.test(jobMatch[1]) ? jobMatch[1] : null;

  // Strip common action words so name search works better.
  const nameHint = text
    .replace(/\b(create|new|job|follow[- ]?up|reminder|schedule|search|find|show|open|for|the|a|an|please|want|need|to)\b/gi, ' ')
    .replace(/(?:\+?91[\s-]*)?[6-9]\d{9}\b/g, ' ')
    .replace(/\b[A-Z]{1,4}\d{2,}[A-Z0-9-]*\b/gi, ' ')
    .replace(/[^\p{L}\p{N}\s.'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

  return {
    raw: text.slice(0, 1500),
    phone,
    jobNumber,
    nameHint: nameHint.length >= 2 ? nameHint : null,
  };
}

function slimCustomer(row) {
  if (!row?.id) return null;
  return {
    id: String(row.id),
    customerCode: row.customer_id ? String(row.customer_id) : null,
    name: row.full_name ? String(row.full_name).trim() : 'Customer',
    phone: row.phone ? String(row.phone) : null,
    alternatePhone: row.alternate_phone ? String(row.alternate_phone) : null,
    email: row.email ? String(row.email) : null,
    serviceType: row.service_type || null,
    brand: row.brand || null,
    model: row.model || null,
    lastServiceDate: row.last_service_date || null,
    tier: row.customer_tier || null,
    status: row.status || null,
  };
}

function slimJob(row) {
  if (!row?.id) return null;
  return {
    id: String(row.id),
    jobNumber: row.job_number ? String(row.job_number) : null,
    customerId: row.customer_id ? String(row.customer_id) : null,
    status: row.status || null,
    serviceType: row.service_type || null,
    serviceSubType: row.service_sub_type || null,
    paymentAmount:
      typeof row.payment_amount === 'number'
        ? row.payment_amount
        : Number(row.payment_amount) || null,
    actualCost:
      typeof row.actual_cost === 'number' ? row.actual_cost : Number(row.actual_cost) || null,
    paymentMethod: row.payment_method || null,
    completedAt: row.completed_at || null,
    scheduledDate: row.scheduled_date || null,
  };
}

function parsePendingAmount(notes) {
  const raw = String(notes || '').trim();
  if (!raw) return 0;
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      const n = Number(parsed.amount_pending);
      return Number.isFinite(n) ? n : 0;
    } catch {
      /* fallthrough */
    }
  }
  const n = Number(raw.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function slimReminder(row) {
  if (!row?.id) return null;
  return {
    id: String(row.id),
    entityType: row.entity_type || null,
    entityId: row.entity_id ? String(row.entity_id) : null,
    title: row.title ? String(row.title).slice(0, 120) : 'Reminder',
    reminderAt: row.reminder_at || null,
    completedAt: row.completed_at || null,
    notePreview: row.notes ? String(row.notes).slice(0, 120) : null,
  };
}

function slimPayment(row) {
  if (!row?.id) return null;
  const amount = parsePendingAmount(row.notes);
  let jobNumber = null;
  let jobId = null;
  try {
    if (String(row.notes || '').startsWith('{')) {
      const parsed = JSON.parse(row.notes);
      jobNumber = parsed.job_number ? String(parsed.job_number) : null;
      jobId = parsed.job_id ? String(parsed.job_id) : null;
    }
  } catch {
    /* ignore */
  }
  return {
    reminderId: String(row.id),
    customerId: row.entity_id ? String(row.entity_id) : null,
    amountPending: amount,
    dueAt: row.reminder_at || null,
    jobNumber,
    jobId,
  };
}

async function searchCustomers(db, hints, focusCustomerId) {
  const out = [];
  const seen = new Set();

  if (focusCustomerId) {
    const { data } = await db
      .from('customers')
      .select(CUSTOMER_COLS)
      .eq('id', focusCustomerId)
      .maybeSingle();
    const slim = slimCustomer(data);
    if (slim) {
      seen.add(slim.id);
      out.push(slim);
    }
  }

  const queries = [];
  if (hints.phone) queries.push(hints.phone);
  if (hints.nameHint) queries.push(hints.nameHint);
  if (!queries.length && hints.raw) queries.push(hints.raw.slice(0, 60));

  for (const q of queries) {
    if (out.length >= CUSTOMER_LIMIT) break;
    const escaped = escapeForLike(q);
    const orParts = [
      `customer_id.ilike.%${escaped}%`,
      `full_name.ilike.%${escaped}%`,
      `phone.ilike.%${escaped}%`,
      `alternate_phone.ilike.%${escaped}%`,
      `email.ilike.%${escaped}%`,
    ];
    const digits = normalizePhoneDigits(q);
    if (digits.length >= 10) {
      orParts.push(`phone.ilike.%${digits.slice(-10)}%`, `alternate_phone.ilike.%${digits.slice(-10)}%`);
    }
    const { data, error } = await db
      .from('customers')
      .select(CUSTOMER_COLS)
      .or(orParts.join(','))
      .order('created_at', { ascending: false })
      .limit(CUSTOMER_LIMIT);
    if (error) {
      console.warn('[ai-crm-lookup] customer search failed', error.message);
      continue;
    }
    for (const row of data || []) {
      const slim = slimCustomer(row);
      if (!slim || seen.has(slim.id)) continue;
      seen.add(slim.id);
      out.push(slim);
      if (out.length >= CUSTOMER_LIMIT) break;
    }
  }

  return out;
}

async function searchJobs(db, hints, customerIds) {
  const out = [];
  const seen = new Set();

  if (hints.jobNumber && hints.jobNumber.length >= 2) {
    const escaped = escapeForLike(hints.jobNumber);
    const { data, error } = await db
      .from('jobs')
      .select(JOB_COLS)
      .ilike('job_number', `%${escaped}%`)
      .order('created_at', { ascending: false })
      .limit(JOB_LIMIT);
    if (error) console.warn('[ai-crm-lookup] job number search failed', error.message);
    for (const row of data || []) {
      const slim = slimJob(row);
      if (!slim || seen.has(slim.id)) continue;
      seen.add(slim.id);
      out.push(slim);
    }
  }

  const ids = (customerIds || []).slice(0, 8);
  if (ids.length) {
    const { data, error } = await db
      .from('jobs')
      .select(JOB_COLS)
      .in('customer_id', ids)
      .order('created_at', { ascending: false })
      .limit(JOB_LIMIT);
    if (error) console.warn('[ai-crm-lookup] jobs-by-customer failed', error.message);
    for (const row of data || []) {
      const slim = slimJob(row);
      if (!slim || seen.has(slim.id)) continue;
      seen.add(slim.id);
      out.push(slim);
      if (out.length >= JOB_LIMIT) break;
    }
  }

  return out.slice(0, JOB_LIMIT);
}

async function loadRemindersAndPayments(db, customerIds) {
  const ids = (customerIds || []).slice(0, 12);
  if (!ids.length) return { reminders: [], payments: [] };

  const { data, error } = await db
    .from('reminders')
    .select(REMINDER_COLS)
    .eq('entity_type', 'customer')
    .in('entity_id', ids)
    .is('completed_at', null)
    .order('reminder_at', { ascending: true })
    .limit(REMINDER_LIMIT + PAYMENT_LIMIT);

  if (error) {
    console.warn('[ai-crm-lookup] reminders failed', error.message);
    return { reminders: [], payments: [] };
  }

  const reminders = [];
  const payments = [];
  for (const row of data || []) {
    if (String(row.title || '').trim() === PENDING_PAYMENT_TITLE) {
      const pay = slimPayment(row);
      if (pay && payments.length < PAYMENT_LIMIT) payments.push(pay);
    } else {
      const rem = slimReminder(row);
      if (rem && reminders.length < REMINDER_LIMIT) reminders.push(rem);
    }
  }
  return { reminders, payments };
}

async function loadDocuments(db, customerIds) {
  const ids = (customerIds || []).slice(0, 6);
  if (!ids.length) return [];

  const docs = [];

  try {
    const { data: amcs } = await db
      .from('amc_contracts')
      .select(AMC_COLS)
      .in('customer_id', ids)
      .order('created_at', { ascending: false })
      .limit(DOCUMENT_LIMIT);

    for (const row of amcs || []) {
      docs.push({
        kind: 'amc',
        id: String(row.id),
        customerId: String(row.customer_id),
        label: `AMC ${row.status || ''}`.trim(),
        startDate: row.start_date || null,
        endDate: row.end_date || null,
        status: row.status || null,
      });
    }
  } catch (err) {
    console.warn('[ai-crm-lookup] amc lookup skipped', err?.message || err);
  }

  try {
    const { data: invoices } = await db
      .from('tax_invoices')
      .select(TAX_COLS)
      .in('customer_id', ids)
      .order('invoice_date', { ascending: false })
      .limit(DOCUMENT_LIMIT);

    for (const row of invoices || []) {
      docs.push({
        kind: 'tax_invoice',
        id: String(row.id),
        customerId: row.customer_id ? String(row.customer_id) : null,
        label: row.invoice_number ? `Invoice ${row.invoice_number}` : 'Tax invoice',
        invoiceDate: row.invoice_date || null,
        grandTotal:
          typeof row.total_amount === 'number' ? row.total_amount : Number(row.total_amount) || null,
        status: null,
      });
    }
  } catch (err) {
    console.warn('[ai-crm-lookup] tax invoice lookup skipped', err?.message || err);
  }

  try {
    const { data: authenticity } = await db
      .from('document_pdf_authenticity')
      .select(AUTH_COLS)
      .in('customer_id', ids)
      .order('created_at', { ascending: false })
      .limit(DOCUMENT_LIMIT);

    for (const row of authenticity || []) {
      docs.push({
        kind: 'pdf_authenticity',
        id: String(row.id),
        customerId: row.customer_id ? String(row.customer_id) : null,
        label: `${row.doc_type || 'document'} · code ${row.verify_code || '—'}`,
        documentType: row.doc_type || null,
        verifyCode: row.verify_code || null,
        createdAt: row.created_at || null,
      });
    }
  } catch (err) {
    console.warn('[ai-crm-lookup] authenticity lookup skipped', err?.message || err);
  }

  return docs.slice(0, DOCUMENT_LIMIT * 2);
}

/**
 * Build a bounded CRM context pack for one admin chat turn.
 */
async function lookupCrmContext({ message, focusCustomerId } = {}) {
  const db = getServiceSupabase();
  if (!db) {
    return {
      customers: [],
      jobs: [],
      reminders: [],
      payments: [],
      documents: [],
      hints: extractQueryHints(message),
      error: 'Database unavailable',
    };
  }

  const hints = extractQueryHints(message);
  const customers = await searchCustomers(db, hints, focusCustomerId);
  const customerIds = customers.map((c) => c.id);
  const jobs = await searchJobs(db, hints, customerIds);

  // If job search found customers we didn't already have, pull them in (thin).
  const missingCustomerIds = [
    ...new Set(
      jobs
        .map((j) => j.customerId)
        .filter((id) => id && !customerIds.includes(id))
    ),
  ].slice(0, 6);
  if (missingCustomerIds.length) {
    const { data } = await db.from('customers').select(CUSTOMER_COLS).in('id', missingCustomerIds);
    for (const row of data || []) {
      const slim = slimCustomer(row);
      if (slim && !customers.find((c) => c.id === slim.id)) customers.push(slim);
    }
  }

  const allCustomerIds = customers.map((c) => c.id);
  const { reminders, payments } = await loadRemindersAndPayments(db, allCustomerIds);
  const documents = await loadDocuments(db, allCustomerIds);

  return {
    customers: customers.slice(0, CUSTOMER_LIMIT),
    jobs: jobs.slice(0, JOB_LIMIT),
    reminders: reminders.slice(0, REMINDER_LIMIT),
    payments: payments.slice(0, PAYMENT_LIMIT),
    documents: documents.slice(0, DOCUMENT_LIMIT * 2),
    hints,
  };
}

function formatContextForPrompt(pack) {
  const lines = [];
  lines.push('CRM lookup results (bounded; treat as facts only):');

  if (!pack.customers.length) {
    lines.push('Customers: (none matched)');
  } else {
    lines.push('Customers:');
    for (const c of pack.customers) {
      lines.push(
        `- id=${c.id}; code=${c.customerCode || '—'}; name=${c.name}; phone=${c.phone || '—'}; lastService=${c.lastServiceDate || '—'}; type=${c.serviceType || '—'}`
      );
    }
  }

  if (!pack.jobs.length) {
    lines.push('Jobs: (none matched)');
  } else {
    lines.push('Jobs:');
    for (const j of pack.jobs) {
      lines.push(
        `- id=${j.id}; number=${j.jobNumber || '—'}; customerId=${j.customerId || '—'}; status=${j.status || '—'}; subtype=${j.serviceSubType || '—'}; payment=${j.paymentAmount ?? '—'}`
      );
    }
  }

  if (pack.reminders.length) {
    lines.push('Reminders:');
    for (const r of pack.reminders) {
      lines.push(
        `- id=${r.id}; customerId=${r.entityId || '—'}; title=${r.title}; at=${r.reminderAt || '—'}`
      );
    }
  }

  if (pack.payments.length) {
    lines.push('Pending payments:');
    for (const p of pack.payments) {
      lines.push(
        `- reminderId=${p.reminderId}; customerId=${p.customerId || '—'}; amount=${p.amountPending}; due=${p.dueAt || '—'}; job=${p.jobNumber || '—'}`
      );
    }
  }

  if (pack.documents.length) {
    lines.push('Documents (metadata only):');
    for (const d of pack.documents) {
      lines.push(
        `- kind=${d.kind}; id=${d.id}; customerId=${d.customerId || '—'}; label=${d.label}`
      );
    }
  }

  return lines.join('\n');
}

module.exports = {
  CUSTOMER_LIMIT,
  JOB_LIMIT,
  extractQueryHints,
  lookupCrmContext,
  formatContextForPrompt,
  slimCustomer,
  slimJob,
};
