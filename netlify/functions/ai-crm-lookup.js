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

const OVERVIEW_CUSTOMER_LIMIT = 20;
const OVERVIEW_JOB_LIMIT = 20;
const OVERVIEW_REMINDER_LIMIT = 15;
const OVERVIEW_PAYMENT_SCAN = 60;
const AMC_EXPIRY_LOOKAHEAD_DAYS = 45;
const TOP_CUSTOMER_LIMIT = 10;
const TOP_CUSTOMER_FALLBACK_PAGE_SIZE = 1000;
const TOP_CUSTOMER_FALLBACK_MAX_PAGES = 50;
const IST_TZ = 'Asia/Kolkata';
const ONGOING_JOB_STATUSES = ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'];

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

/** Words that never identify a customer, so they must not become search terms. */
const NAME_STOP_WORDS = new Set(
  [
    'about', 'add', 'afternoon', 'again', 'against', 'all', 'also', 'amc', 'amount', 'and', 'any',
    'anyone', 'are', 'assign', 'assigned', 'balance', 'bill', 'booked', 'booking', 'called', 'can',
    'cancel', 'cancelled', 'candy', 'cash', 'change', 'charge', 'check', 'closed', 'collect',
    'collected', 'coming', 'company', 'complaint', 'complaints', 'complete', 'completed',
    'confirm', 'contact', 'cost', 'count', 'create', 'customer', 'customers', 'date', 'day',
    'days', 'description', 'detail', 'details', 'did', 'does', 'done', 'due', 'dues', 'earn',
    'evening', 'expire', 'expired', 'expiring', 'expiry', 'filter', 'filters', 'find', 'finished',
    'follow', 'followup', 'followups', 'for', 'from', 'get', 'give', 'has', 'have', 'his', 'her',
    'how', 'income', 'info', 'information', 'install', 'installation', 'invoice', 'issue',
    'issues', 'job', 'jobs', 'last', 'leak', 'leakage', 'lead', 'leads', 'list', 'machine',
    'make', 'many', 'me', 'month', 'more', 'morning', 'much', 'my', 'name', 'need', 'needs',
    'new', 'next', 'night', 'not', 'note', 'notes', 'now', 'number', 'off', 'ongoing', 'open',
    'order', 'our', 'outstanding', 'overdue', 'paid', 'past', 'pay', 'payment', 'payments',
    'pending', 'phone', 'please', 'post', 'pre', 'price', 'purifier', 'quotation', 'raise',
    'received', 'record', 'records', 'renew', 'renewal', 'repair', 'report', 'reminder',
    'reminders', 'rupees', 'sales', 'schedule', 'scheduled', 'search', 'service', 'services',
    'set', 'show', 'slot', 'softener', 'status', 'summary', 'system', 'task', 'tasks', 'that',
    'the', 'their', 'them', 'these', 'this', 'time', 'today', 'tomorrow', 'total', 'turnover',
    'unpaid', 'update', 'upcoming', 'us', 'visit', 'visits', 'want', 'was', 'water', 'week', 'were',
    'what', 'when', 'which', 'who', 'will', 'with', 'work', 'year', 'yesterday', 'you', 'your',
    'alltime', 'billed', 'biggest', 'client', 'entire', 'ever', 'highest', 'largest', 'lifetime',
    'paying', 'spend', 'spent', 'thing', 'top', 'value',
  ].map((w) => w.toLowerCase())
);

/** Words that usually sit right before a customer name. */
const NAME_LEAD_WORDS = new Set([
  'find',
  'for',
  'customer',
  'search',
  'open',
  'called',
  'named',
  'of',
  'to',
  'with',
  'mr',
  'mrs',
  'ms',
]);

function looksLikeTomorrowTypo(word) {
  return /^tom+o?r+o?w$/.test(word) || /^tomm?row$/.test(word);
}

/**
 * Pull likely customer-name words out of a free-form sentence.
 * Returns single tokens (not the whole phrase) so "Find poorna and add a job…"
 * still searches for "poorna".
 */
function extractNameTokens(text) {
  const cleaned = String(text || '')
    .replace(/(?:\+?91[\s-]*)?[6-9]\d{9}\b/g, ' ')
    .replace(/\b[A-Z]{1,4}\d{2,}[A-Z0-9-]*\b/gi, ' ')
    .replace(/[^\p{L}\p{N}\s.'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return [];

  const words = cleaned.split(' ');
  const candidates = [];
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i].replace(/^[.'-]+|[.'-]+$/g, '');
    if (word.length < 3 || word.length > 40) continue;
    const lower = word.toLowerCase();
    if (NAME_STOP_WORDS.has(lower) || looksLikeTomorrowTypo(lower)) continue;
    if (!/\p{L}/u.test(word) || /\d/.test(word)) continue;
    const prev = (words[i - 1] || '').toLowerCase().replace(/[^\p{L}]/gu, '');
    candidates.push({ word, priority: NAME_LEAD_WORDS.has(prev) ? 0 : 1 });
  }

  candidates.sort((a, b) => a.priority - b.priority);
  const seen = new Set();
  const tokens = [];
  for (const c of candidates) {
    const key = c.word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tokens.push(c.word);
    if (tokens.length >= 3) break;
  }
  return tokens;
}

function extractQueryHints(message) {
  const text = String(message || '').trim();
  const phoneMatch = text.match(/(?:\+?91[\s-]*)?([6-9]\d{9})\b/);
  const phone = phoneMatch?.[1] || null;

  const jobMatch = text.match(/\b(?:job\s*#?\s*)?([A-Z]{1,4}\d{2,}[A-Z0-9-]*)\b/i);
  const jobNumber = jobMatch?.[1] && /[0-9]/.test(jobMatch[1]) ? jobMatch[1] : null;

  const nameTokens = extractNameTokens(text);

  return {
    raw: text.slice(0, 1500),
    phone,
    jobNumber,
    nameTokens,
    nameHint: nameTokens[0] || null,
  };
}

function istDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function istWeekdayName(dateKey) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
  }).format(new Date(`${dateKey}T00:00:00Z`));
}

function addDaysKey(dateKey, days) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthBoundsKey(dateKey, monthOffset = 0) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + monthOffset, 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + monthOffset + 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/** IST day bounds as timestamptz strings for completed_at style columns. */
function istDayBounds(startKey, endKey) {
  return {
    fromTs: `${startKey}T00:00:00+05:30`,
    toTs: `${addDaysKey(endKey, 1)}T00:00:00+05:30`,
  };
}

function detectCustomerValueRanking(message) {
  const text = String(message || '').toLowerCase();
  const mentionsCustomer = /\bcustomers?\b|\bclient\b|\bwho\b|\bwhich\b/.test(text);
  const mentionsRanking = /\bmost\b|\btop\b|\bhighest\b|\bbiggest\b|\blargest\b|\bbest\b/.test(
    text
  );
  const mentionsValue =
    /\bpaid\b|\bpaying\b|\bspent\b|\bspend\b|\brevenue\b|\bsales\b|\bvalue\b|\bbilled\b/.test(
      text
    );
  return mentionsCustomer && mentionsRanking && mentionsValue;
}

/**
 * Detect an operational ("show me the CRM") intent: what to list and for when.
 * Purely keyword-based; never turns into free-form SQL.
 */
function detectOverviewIntent(message, todayKey = istDateKey()) {
  const text = String(message || '').toLowerCase();
  const has = (re) => re.test(text);

  const isFollowUp = has(/\bfollow[\s-]?ups?\b/);

  const scopes = new Set();
  if (
    isFollowUp ||
    has(/\bjobs?\b|\bservices?\b|\bvisits?\b|\bschedule[ds]?\b|\bcomplaints?\b|\bcalls?\b/)
  )
    scopes.add('jobs');
  if (isFollowUp || has(/\breminder|\bdue\b|\btask/)) scopes.add('reminders');
  if (has(/\bpayment|\bpending amount|\boutstanding|\bbalance|\bcollect|\bunpaid|\bdues?\b/))
    scopes.add('payments');
  if (has(/\bamc\b|\bexpir|\brenew/)) scopes.add('amc');
  if (has(/\bnew customers?\b|\brecent customers?\b|\bnew leads?\b/)) scopes.add('customers');
  if (has(/\brevenue|\bcollect|\bearn|\bincome|\bturnover|\bsales\b/)) scopes.add('revenue');
  if (detectCustomerValueRanking(message)) scopes.add('customer_value_ranking');
  if (has(/\bsummary|\boverview|\bstatus\b|\bhow many|\bcount\b|\btotal\b|\btoday\b|\breport\b/))
    scopes.add('summary');

  let statuses = null;
  if (isFollowUp) statuses = ['FOLLOW_UP'];
  else if (has(/\bcompleted?\b|\bdone\b|\bfinished\b|\bclosed\b/)) statuses = ['COMPLETED'];
  else if (has(/\bcancell?ed\b/)) statuses = ['CANCELLED'];
  else if (has(/\bpending\b|\bopen\b|\bongoing\b|\bincomplete\b|\bunassigned\b|\bactive\b/))
    statuses = ONGOING_JOB_STATUSES;

  let start = todayKey;
  let end = todayKey;
  let label = 'today';
  let explicitDate = false;

  if (has(/\byesterday\b/)) {
    start = addDaysKey(todayKey, -1);
    end = start;
    label = 'yesterday';
    explicitDate = true;
  } else if (has(/\btom+o?r+o?w\b|\btomm?row\b/)) {
    start = addDaysKey(todayKey, 1);
    end = start;
    label = 'tomorrow';
    explicitDate = true;
  } else if (has(/\blast month\b|\bprevious month\b/)) {
    const b = monthBoundsKey(todayKey, -1);
    start = b.start;
    end = b.end;
    label = 'last month';
    explicitDate = true;
  } else if (has(/\bthis month\b|\bmonth\b/)) {
    const b = monthBoundsKey(todayKey, 0);
    start = b.start;
    end = b.end;
    label = 'this month';
    explicitDate = true;
  } else if (has(/\blast week\b|\bpast week\b|\blast 7 days\b|\bpast 7 days\b/)) {
    start = addDaysKey(todayKey, -6);
    end = todayKey;
    label = 'last 7 days';
    explicitDate = true;
  } else if (has(/\bthis week\b|\bnext week\b|\bcoming week\b|\bnext 7 days\b|\bweek\b/)) {
    start = todayKey;
    end = addDaysKey(todayKey, 6);
    label = 'next 7 days';
    explicitDate = true;
  } else if (has(/\boverdue\b|\bpast due\b|\bmissed\b/)) {
    start = null;
    end = addDaysKey(todayKey, -1);
    label = 'overdue (before today)';
    explicitDate = true;
  } else if (has(/\btoday\b|\bnow\b/)) {
    explicitDate = true;
  }

  const explicitDateKey = String(message || '').match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1] || null;
  if (explicitDateKey) {
    start = explicitDateKey;
    end = explicitDateKey;
    label = explicitDateKey;
    explicitDate = true;
  }

  return {
    scopes,
    statuses,
    range: { start, end, label },
    explicitDate,
    active: scopes.size > 0,
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

async function searchCustomers(db, hints, focusCustomerId, opts = {}) {
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
  for (const token of hints.nameTokens || []) queries.push(token);
  if (!queries.length && hints.raw && opts.allowRawFallback !== false) {
    queries.push(hints.raw.slice(0, 60));
  }

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

async function countRows(builder) {
  const { count, error } = await builder;
  if (error) {
    console.warn('[ai-crm-lookup] count failed', error.message);
    return null;
  }
  return typeof count === 'number' ? count : null;
}

async function loadCustomersByIds(db, ids) {
  const list = [...new Set((ids || []).filter(Boolean))].slice(0, OVERVIEW_CUSTOMER_LIMIT);
  if (!list.length) return [];
  const { data, error } = await db.from('customers').select(CUSTOMER_COLS).in('id', list);
  if (error) {
    console.warn('[ai-crm-lookup] customer hydrate failed', error.message);
    return [];
  }
  return (data || []).map(slimCustomer).filter(Boolean);
}

function normalizeCustomerValueRow(row) {
  if (!row?.customer_id) return null;
  return {
    id: String(row.customer_id),
    customerCode: row.customer_code ? String(row.customer_code) : null,
    name: row.customer_name ? String(row.customer_name).trim() : 'Customer',
    phone: row.phone ? String(row.phone) : null,
    alternatePhone: null,
    email: null,
    serviceType: null,
    brand: null,
    model: null,
    lastServiceDate: null,
    tier: null,
    status: null,
    confirmedPaidTotal: Math.round(Number(row.confirmed_paid_total) || 0),
    billedTotal: Math.round(Number(row.billed_total) || 0),
    fullyPaidJobs: Math.max(0, Math.round(Number(row.fully_paid_jobs) || 0)),
    completedJobs: Math.max(0, Math.round(Number(row.completed_jobs) || 0)),
  };
}

function resolveCompletedJobValue(row) {
  const paymentAmount = Number(row?.payment_amount) || 0;
  const actualCost = Number(row?.actual_cost) || 0;
  return Math.max(0, paymentAmount > 0 ? paymentAmount : actualCost);
}

async function loadTopCustomerValueRanking(db, intent, todayKey) {
  let fromTs = null;
  let toTs = null;
  if (intent.explicitDate) {
    const bounds = istDayBounds(intent.range.start || todayKey, intent.range.end || todayKey);
    fromTs = bounds.fromTs;
    toTs = bounds.toTs;
  }

  const { data: rpcData, error: rpcError } = await db.rpc('ai_crm_top_customers', {
    p_limit: TOP_CUSTOMER_LIMIT,
    p_from: fromTs,
    p_to: toTs,
  });
  if (!rpcError && Array.isArray(rpcData)) {
    return {
      customers: rpcData.map(normalizeCustomerValueRow).filter(Boolean),
      source: 'database_aggregate',
      truncated: false,
    };
  }

  // Local/WIP fallback until the optimized RPC is installed. It reads only five
  // thin columns in bounded pages and aggregates in memory; no customer history,
  // notes, requirements, photos or documents leave Supabase.
  if (rpcError) {
    console.warn('[ai-crm-lookup] top customer RPC unavailable; using thin fallback');
  }
  const grouped = new Map();
  let exhausted = false;
  for (let page = 0; page < TOP_CUSTOMER_FALLBACK_MAX_PAGES; page += 1) {
    const from = page * TOP_CUSTOMER_FALLBACK_PAGE_SIZE;
    let query = db
      .from('jobs')
      .select('id,customer_id,payment_status,payment_amount,actual_cost')
      .eq('status', 'COMPLETED')
      .not('customer_id', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + TOP_CUSTOMER_FALLBACK_PAGE_SIZE - 1);
    if (fromTs) query = query.gte('completed_at', fromTs);
    if (toTs) query = query.lt('completed_at', toTs);
    const { data, error } = await query;
    if (error) {
      console.warn('[ai-crm-lookup] top customer fallback failed', error.message);
      return { customers: [], source: 'unavailable', truncated: false };
    }
    for (const row of data || []) {
      if (!row.customer_id) continue;
      const amount = resolveCompletedJobValue(row);
      const current = grouped.get(row.customer_id) || {
        customerId: String(row.customer_id),
        confirmedPaidTotal: 0,
        billedTotal: 0,
        fullyPaidJobs: 0,
        completedJobs: 0,
      };
      current.billedTotal += amount;
      current.completedJobs += 1;
      if (row.payment_status === 'PAID') {
        current.confirmedPaidTotal += amount;
        current.fullyPaidJobs += 1;
      }
      grouped.set(row.customer_id, current);
    }
    if ((data || []).length < TOP_CUSTOMER_FALLBACK_PAGE_SIZE) {
      exhausted = true;
      break;
    }
  }

  const ranked = [...grouped.values()]
    .sort(
      (a, b) =>
        b.confirmedPaidTotal - a.confirmedPaidTotal ||
        b.billedTotal - a.billedTotal ||
        a.customerId.localeCompare(b.customerId)
    )
    .slice(0, TOP_CUSTOMER_LIMIT);
  const customerIds = ranked.map((row) => row.customerId);
  const { data: customerRows, error: customerError } = customerIds.length
    ? await db
        .from('customers')
        .select('id,customer_id,full_name,phone')
        .in('id', customerIds)
    : { data: [], error: null };
  if (customerError) {
    console.warn('[ai-crm-lookup] top customer hydrate failed', customerError.message);
  }
  const customerById = new Map((customerRows || []).map((row) => [String(row.id), row]));
  return {
    customers: ranked.map((row) => {
      const customer = customerById.get(row.customerId) || {};
      return normalizeCustomerValueRow({
        customer_id: row.customerId,
        customer_code: customer.customer_id,
        customer_name: customer.full_name,
        phone: customer.phone,
        confirmed_paid_total: row.confirmedPaidTotal,
        billed_total: row.billedTotal,
        fully_paid_jobs: row.fullyPaidJobs,
        completed_jobs: row.completedJobs,
      });
    }),
    source: 'thin_fallback',
    truncated: !exhausted,
  };
}

/**
 * Operational lists + exact counts for "what's happening" questions.
 * Every query is allowlisted, thin-column and row-capped.
 */
async function loadOverview(db, intent, todayKey) {
  const out = {
    jobs: [],
    reminders: [],
    payments: [],
    documents: [],
    customers: [],
    stats: {},
    truncated: {},
  };
  const { scopes, statuses, range } = intent;
  const wantsJobs = scopes.has('jobs') || scopes.has('summary') || scopes.has('revenue');
  const wantsReminders = scopes.has('reminders') || scopes.has('summary');
  const wantsPayments = scopes.has('payments') || scopes.has('summary');
  const wantsAmc = scopes.has('amc');
  const wantsCustomers = scopes.has('customers');
  const wantsCustomerValueRanking = scopes.has('customer_value_ranking');

  if (wantsCustomerValueRanking) {
    const ranking = await loadTopCustomerValueRanking(db, intent, todayKey);
    out.customers.push(...ranking.customers);
    out.stats.customerValueRanking = ranking.customers.map((customer, index) => ({
      rank: index + 1,
      customerId: customer.id,
      customerCode: customer.customerCode,
      name: customer.name,
      phone: customer.phone,
      confirmedPaidTotal: customer.confirmedPaidTotal,
      billedTotal: customer.billedTotal,
      fullyPaidJobs: customer.fullyPaidJobs,
      completedJobs: customer.completedJobs,
    }));
    out.stats.customerValueRankingBasis =
      'confirmedPaidTotal counts completed jobs whose payment_status is PAID; billedTotal counts completed-job value and may include unpaid or partially paid work';
    out.stats.customerValueRankingPeriod = intent.explicitDate ? range.label : 'lifetime';
    out.stats.customerValueRankingSource = ranking.source;
    out.truncated.customerValueRanking = ranking.truncated;
  }

  if (wantsJobs) {
    const completedOnly = Array.isArray(statuses) && statuses.length === 1 && statuses[0] === 'COMPLETED';
    const useCompletedAt = completedOnly || scopes.has('revenue');
    let q = db.from('jobs').select(JOB_COLS).limit(OVERVIEW_JOB_LIMIT);

    if (useCompletedAt) {
      const bounds = istDayBounds(range.start || todayKey, range.end || todayKey);
      q = q
        .eq('status', 'COMPLETED')
        .gte('completed_at', bounds.fromTs)
        .lt('completed_at', bounds.toTs)
        .order('completed_at', { ascending: false });
    } else {
      if (statuses) q = q.in('status', statuses);
      const applyRange = intent.explicitDate || !statuses;
      if (applyRange) {
        if (range.start) q = q.gte('scheduled_date', range.start);
        if (range.end) q = q.lte('scheduled_date', range.end);
      }
      q = q.order('scheduled_date', { ascending: true });
    }

    const { data, error } = await q;
    if (error) console.warn('[ai-crm-lookup] overview jobs failed', error.message);
    for (const row of data || []) {
      const slim = slimJob(row);
      if (slim) out.jobs.push(slim);
    }
    out.truncated.jobs = out.jobs.length >= OVERVIEW_JOB_LIMIT;
  }

  if (wantsReminders || wantsPayments) {
    let q = db
      .from('reminders')
      .select(REMINDER_COLS)
      .is('completed_at', null)
      .order('reminder_at', { ascending: true })
      .limit(OVERVIEW_PAYMENT_SCAN);
    if (range.start && !wantsPayments) q = q.gte('reminder_at', range.start);
    if (range.end) q = q.lte('reminder_at', range.end);

    const { data, error } = await q;
    if (error) console.warn('[ai-crm-lookup] overview reminders failed', error.message);

    let paymentTotal = 0;
    let paymentCount = 0;
    for (const row of data || []) {
      const isPayment = String(row.title || '').trim() === PENDING_PAYMENT_TITLE;
      if (isPayment) {
        if (!wantsPayments) continue;
        const pay = slimPayment(row);
        if (!pay) continue;
        paymentCount += 1;
        paymentTotal += pay.amountPending || 0;
        if (out.payments.length < PAYMENT_LIMIT) out.payments.push(pay);
      } else {
        if (!wantsReminders) continue;
        const rem = slimReminder(row);
        if (rem && out.reminders.length < OVERVIEW_REMINDER_LIMIT) out.reminders.push(rem);
      }
    }
    if (wantsPayments) {
      out.stats.pendingPaymentsListed = paymentCount;
      out.stats.pendingPaymentsListedTotal = Math.round(paymentTotal);
      out.truncated.payments = paymentCount > out.payments.length;
    }
    if (wantsReminders) {
      out.truncated.reminders = out.reminders.length >= OVERVIEW_REMINDER_LIMIT;
    }
  }

  if (wantsAmc) {
    const from = range.start || todayKey;
    const to = intent.explicitDate
      ? range.end || addDaysKey(todayKey, AMC_EXPIRY_LOOKAHEAD_DAYS)
      : addDaysKey(todayKey, AMC_EXPIRY_LOOKAHEAD_DAYS);
    const { data, error } = await db
      .from('amc_contracts')
      .select(AMC_COLS)
      .gte('end_date', from)
      .lte('end_date', to)
      .order('end_date', { ascending: true })
      .limit(DOCUMENT_LIMIT);
    if (error) console.warn('[ai-crm-lookup] amc expiry failed', error.message);
    out.stats.amcExpiryWindow = `${from} to ${to}`;
    for (const row of data || []) {
      out.documents.push({
        kind: 'amc',
        id: String(row.id),
        customerId: row.customer_id ? String(row.customer_id) : null,
        label: `AMC ends ${row.end_date || '—'}`,
        startDate: row.start_date || null,
        endDate: row.end_date || null,
        status: row.status || null,
      });
    }
  }

  if (wantsCustomers) {
    const { data, error } = await db
      .from('customers')
      .select(CUSTOMER_COLS)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) console.warn('[ai-crm-lookup] recent customers failed', error.message);
    for (const row of data || []) {
      const slim = slimCustomer(row);
      if (slim) out.customers.push(slim);
    }
  }

  // Ranking-only questions are already answered by one grouped RPC. Avoid the
  // unrelated jobs/reminders/count queries used by the general ops dashboard.
  if (wantsCustomerValueRanking && scopes.size === 1) {
    out.stats.today = todayKey;
    out.stats.rangeLabel = intent.explicitDate ? range.label : 'lifetime';
    return out;
  }

  // Exact counts (cheap head queries) so "how many" answers are accurate.
  const dayBounds = istDayBounds(range.start || todayKey, range.end || todayKey);
  out.stats.today = todayKey;
  out.stats.rangeLabel = range.label;
  out.stats.jobsScheduledInRange = await countRows(
    (() => {
      let q = db.from('jobs').select('id', { count: 'exact', head: true });
      if (range.start) q = q.gte('scheduled_date', range.start);
      if (range.end) q = q.lte('scheduled_date', range.end);
      return q;
    })()
  );
  out.stats.jobsCompletedInRange = await countRows(
    db
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'COMPLETED')
      .gte('completed_at', dayBounds.fromTs)
      .lt('completed_at', dayBounds.toTs)
  );
  out.stats.openJobsTotal = await countRows(
    db.from('jobs').select('id', { count: 'exact', head: true }).in('status', ONGOING_JOB_STATUSES)
  );
  out.stats.followUpJobsTotal = await countRows(
    db.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'FOLLOW_UP')
  );

  if (scopes.has('revenue') || wantsJobs) {
    const { data, error } = await db
      .from('jobs')
      .select('payment_amount, actual_cost')
      .eq('status', 'COMPLETED')
      .gte('completed_at', dayBounds.fromTs)
      .lt('completed_at', dayBounds.toTs)
      .limit(500);
    if (error) console.warn('[ai-crm-lookup] revenue failed', error.message);
    let sum = 0;
    for (const row of data || []) {
      const n = Number(row.payment_amount ?? row.actual_cost);
      if (Number.isFinite(n)) sum += n;
    }
    out.stats.completedJobValueInRange = Math.round(sum);
  }

  return out;
}

/**
 * Build a bounded CRM context pack for one admin chat turn.
 */
async function lookupCrmContext({ message, focusCustomerId } = {}) {
  const todayKey = istDateKey();
  const db = getServiceSupabase();
  if (!db) {
    return {
      customers: [],
      jobs: [],
      reminders: [],
      payments: [],
      documents: [],
      stats: { today: todayKey },
      hints: extractQueryHints(message),
      error: 'Database unavailable',
    };
  }

  const hints = extractQueryHints(message);
  const detected = detectOverviewIntent(message, todayKey);
  // A request naming a person or job is about them, not a whole-day sweep.
  const hasSpecificTarget = Boolean(
    hints.phone || hints.jobNumber || (hints.nameTokens || []).length || focusCustomerId
  );
  const isCustomerValueRanking = detected.scopes.has('customer_value_ranking');
  const intent = {
    ...detected,
    active: detected.active && (!hasSpecificTarget || isCustomerValueRanking),
  };
  const customers = await searchCustomers(db, hints, focusCustomerId, {
    allowRawFallback: !intent.active,
  });
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

  let stats = { today: todayKey, weekday: istWeekdayName(todayKey) };
  let truncated = {};

  if (intent.active) {
    const overview = await loadOverview(db, intent, todayKey);
    stats = { ...stats, ...overview.stats };
    truncated = overview.truncated || {};

    const jobIds = new Set(jobs.map((j) => j.id));
    for (const job of overview.jobs) {
      if (jobIds.has(job.id)) continue;
      jobIds.add(job.id);
      jobs.push(job);
    }

    const reminderIds = new Set(reminders.map((r) => r.id));
    for (const rem of overview.reminders) {
      if (reminderIds.has(rem.id)) continue;
      reminderIds.add(rem.id);
      reminders.push(rem);
    }

    const paymentIds = new Set(payments.map((p) => p.reminderId));
    for (const pay of overview.payments) {
      if (paymentIds.has(pay.reminderId)) continue;
      paymentIds.add(pay.reminderId);
      payments.push(pay);
    }

    for (const doc of overview.documents) {
      if (!documents.find((d) => d.kind === doc.kind && d.id === doc.id)) documents.push(doc);
    }

    const knownCustomerIds = new Set(customers.map((c) => c.id));
    const relatedIds = [
      ...overview.customers.map((c) => c.id),
      ...jobs.map((j) => j.customerId),
      ...reminders.filter((r) => r.entityType === 'customer').map((r) => r.entityId),
      ...payments.map((p) => p.customerId),
      ...overview.documents.map((d) => d.customerId),
    ].filter((id) => id && !knownCustomerIds.has(id));

    for (const c of overview.customers) {
      if (!knownCustomerIds.has(c.id)) {
        knownCustomerIds.add(c.id);
        customers.push(c);
      }
    }
    const hydrated = await loadCustomersByIds(db, relatedIds);
    for (const c of hydrated) {
      if (knownCustomerIds.has(c.id)) continue;
      knownCustomerIds.add(c.id);
      customers.push(c);
    }
  }

  const customerCap = intent.active ? OVERVIEW_CUSTOMER_LIMIT : CUSTOMER_LIMIT;
  const jobCap = intent.active ? OVERVIEW_JOB_LIMIT + JOB_LIMIT : JOB_LIMIT;
  const reminderCap = intent.active ? OVERVIEW_REMINDER_LIMIT + REMINDER_LIMIT : REMINDER_LIMIT;

  return {
    customers: customers.slice(0, customerCap),
    jobs: jobs.slice(0, jobCap),
    reminders: reminders.slice(0, reminderCap),
    payments: payments.slice(0, PAYMENT_LIMIT * 2),
    documents: documents.slice(0, DOCUMENT_LIMIT * 2),
    stats,
    truncated,
    intent: {
      scopes: [...intent.scopes],
      statuses: intent.statuses,
      range: intent.range,
    },
    hints,
  };
}

function formatContextForPrompt(pack) {
  const lines = [];
  const stats = pack.stats || {};
  const nameById = new Map((pack.customers || []).map((c) => [c.id, c.name]));

  const today = stats.today || istDateKey();
  lines.push(
    `Today (IST) is ${today}${stats.weekday ? ` (${stats.weekday})` : ''}. Tomorrow is ${addDaysKey(
      today,
      1
    )}; yesterday was ${addDaysKey(today, -1)}. Use these for relative dates, including misspellings.`
  );
  if (pack.intent?.scopes?.length) {
    const showStatuses = pack.intent.statuses && pack.intent.scopes.includes('jobs');
    const periodLabel =
      pack.intent.scopes.includes('customer_value_ranking') && stats.customerValueRankingPeriod
        ? stats.customerValueRankingPeriod
        : pack.intent.range?.label || 'today';
    lines.push(
      `Interpreted request: ${pack.intent.scopes.join(', ')}; period = ${periodLabel}${
        showStatuses ? `; job status filter = ${pack.intent.statuses.join('/')}` : ''
      }.`
    );
  }
  lines.push('CRM lookup results (bounded; treat as facts only):');

  const statLines = [];
  if (stats.jobsScheduledInRange != null)
    statLines.push(`jobs scheduled in period = ${stats.jobsScheduledInRange}`);
  if (stats.jobsCompletedInRange != null)
    statLines.push(`jobs completed in period = ${stats.jobsCompletedInRange}`);
  if (stats.openJobsTotal != null)
    statLines.push(`open jobs right now (PENDING/ASSIGNED/EN_ROUTE/IN_PROGRESS) = ${stats.openJobsTotal}`);
  if (stats.followUpJobsTotal != null)
    statLines.push(`jobs in FOLLOW_UP = ${stats.followUpJobsTotal}`);
  if (stats.completedJobValueInRange != null)
    statLines.push(
      `billed value of jobs completed in period (INR, may include not-yet-collected amounts) = ${stats.completedJobValueInRange}`
    );
  if (stats.pendingPaymentsListed != null)
    statLines.push(
      `pending payment reminders scanned = ${stats.pendingPaymentsListed}, total INR = ${stats.pendingPaymentsListedTotal}`
    );
  if (stats.amcExpiryWindow) statLines.push(`AMC contracts listed expire between ${stats.amcExpiryWindow}`);
  if (statLines.length) {
    lines.push('Exact counts (authoritative, use these for "how many"):');
    for (const s of statLines) lines.push(`- ${s}`);
  }

  if (Array.isArray(stats.customerValueRanking) && stats.customerValueRanking.length) {
    lines.push(
      `Customer value ranking (${stats.customerValueRankingPeriod || 'lifetime'}; authoritative order):`
    );
    lines.push(`- Basis: ${stats.customerValueRankingBasis}`);
    for (const row of stats.customerValueRanking) {
      lines.push(
        `- rank=${row.rank}; customerId=${row.customerId}; code=${row.customerCode || '—'}; name=${row.name}; phone=${row.phone || '—'}; confirmedFullyPaidINR=${row.confirmedPaidTotal}; completedJobBilledINR=${row.billedTotal}; fullyPaidJobs=${row.fullyPaidJobs}; completedJobs=${row.completedJobs}`
      );
    }
    if (pack.truncated?.customerValueRanking) {
      lines.push('- Warning: fallback scan hit its safety cap; ranking may be incomplete.');
    }
  }

  if (!pack.customers.length) {
    lines.push('Customers: (none matched)');
  } else {
    lines.push('Customers:');
    for (const c of pack.customers) {
      lines.push(
        `- id=${c.id}; code=${c.customerCode || '—'}; name=${c.name}; phone=${c.phone || '—'}; lastService=${c.lastServiceDate || '—'}; type=${c.serviceType || '—'}${c.confirmedPaidTotal != null ? `; confirmedFullyPaidINR=${c.confirmedPaidTotal}; completedJobBilledINR=${c.billedTotal}; fullyPaidJobs=${c.fullyPaidJobs}; completedJobs=${c.completedJobs}` : ''}`
      );
    }
  }

  if (!pack.jobs.length) {
    lines.push('Jobs: (none matched)');
  } else {
    lines.push('Jobs:');
    for (const j of pack.jobs) {
      lines.push(
        `- id=${j.id}; number=${j.jobNumber || '—'}; customer=${nameById.get(j.customerId) || '—'} (${j.customerId || '—'}); status=${j.status || '—'}; scheduled=${j.scheduledDate || '—'}; completed=${j.completedAt || '—'}; subtype=${j.serviceSubType || '—'}; payment=${j.paymentAmount ?? '—'}`
      );
    }
    if (pack.truncated?.jobs) lines.push('  (job list truncated — use the exact counts above)');
  }

  if (pack.reminders.length) {
    lines.push('Reminders:');
    for (const r of pack.reminders) {
      lines.push(
        `- id=${r.id}; customer=${nameById.get(r.entityId) || '—'} (${r.entityId || '—'}); type=${r.entityType || '—'}; title=${r.title}; at=${r.reminderAt || '—'}`
      );
    }
  }

  if (pack.payments.length) {
    lines.push('Pending payments:');
    for (const p of pack.payments) {
      lines.push(
        `- reminderId=${p.reminderId}; customer=${nameById.get(p.customerId) || '—'} (${p.customerId || '—'}); amount=${p.amountPending}; due=${p.dueAt || '—'}; job=${p.jobNumber || '—'}`
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
  OVERVIEW_JOB_LIMIT,
  TOP_CUSTOMER_LIMIT,
  ONGOING_JOB_STATUSES,
  extractQueryHints,
  detectOverviewIntent,
  detectCustomerValueRanking,
  resolveCompletedJobValue,
  istDateKey,
  addDaysKey,
  lookupCrmContext,
  formatContextForPrompt,
  slimCustomer,
  slimJob,
};
