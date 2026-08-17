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
const TOP_TECHNICIAN_LIMIT = 10;
const TECHNICIAN_BILLING_SCAN_LIMIT = 1000;
const REVENUE_SCAN_LIMIT = 2000;
const FUZZY_NAME_SCAN_LIMIT = 40;
const NAMED_CUSTOMER_VALUE_SCAN_LIMIT = 600;
const TECHNICIAN_TOP_JOB_SCAN = 25;
const TECHNICIAN_TOP_JOB_LIMIT = 10;
const TOP_CUSTOMER_FALLBACK_PAGE_SIZE = 1000;
const TOP_CUSTOMER_FALLBACK_MAX_PAGES = 50;
const IST_TZ = 'Asia/Kolkata';
const ONGOING_JOB_STATUSES = ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'];

const CUSTOMER_COLS =
  'id, customer_id, full_name, phone, alternate_phone, email, service_type, brand, model, last_service_date, customer_tier, status';

const JOB_COLS =
  'id, job_number, customer_id, status, service_type, service_sub_type, service_brand, payment_amount, actual_cost, payment_method, completed_at, end_time, scheduled_date, assigned_technician_id, completed_by';

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

/** Bounded Levenshtein distance; returns max + 1 once the budget is exceeded. */
function editDistance(a, b, max = 2) {
  const s = String(a || '');
  const t = String(b || '');
  if (Math.abs(s.length - t.length) > max) return max + 1;
  let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      const value = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      row[j] = value;
      if (value < best) best = value;
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[t.length];
}

/** How far a misspelling may sit from a real name before we stop trusting it. */
function fuzzyBudget(token) {
  if (token.length <= 5) return 1;
  if (token.length <= 9) return 2;
  return 3;
}

function nameMatchesToken(fullName, token) {
  const budget = fuzzyBudget(token);
  const words = String(fullName || '')
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
  for (const word of words) {
    // A typed prefix of a real name is a match ("shett" -> "shetty"), but a real
    // name much shorter than what was typed is a different person
    // ("Jyoti" is not "Jyotirling").
    if (word.includes(token)) return 0;
    if (token.includes(word) && word.length >= token.length - 2) return 0;
    const distance = editDistance(word, token, budget);
    if (distance <= budget) return distance;
  }
  return -1;
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
    // Sentence glue around a name ("customer having shety") must never be
    // searched itself: short words like "had" substring-match real surnames.
    'called', 'containing', 'contains', 'ending', 'ends', 'had', 'having', 'including', 'includes',
    'lowest', 'named', 'naming', 'similar', 'sounds', 'spelled', 'spelling', 'starting', 'starts',
    'whose', 'enroute', 'left', 'meant', 'progress', 'remaining', 'route',
    'collection', 'collections', 'earnings', 'gst', 'money', 'profit', 'revenue', 'tax',
    'alltime', 'billed', 'billing', 'biggest', 'client', 'entire', 'ever', 'highest', 'largest', 'lifetime',
    'paying', 'spend', 'spent', 'thing', 'top', 'value', 'technician', 'technicians', 'tech',
    'tehcncian', 'tehcnician',
    // Greetings and chit-chat must never become a customer search term.
    'bye', 'cool', 'everything', 'fine', 'good', 'great', 'greetings', 'hai', 'hello', 'hey',
    'hii', 'hiii', 'holdon', 'hola', 'namaste', 'nice', 'okay', 'okey', 'please', 'sorry',
    'sure', 'thank', 'thanks', 'thankyou', 'there', 'welcome', 'yeah', 'yes',
    // Ranking follow-ups ("who is second") point at the previous list, not a person.
    'best', 'compare', 'comparison', 'expect', 'estimate', 'first', 'forecast', 'growth',
    'least', 'less', 'other', 'project', 'projection', 'rank', 'ranking', 'second', 'smallest',
    'third', 'trend', 'versus', 'worst',
    // Pronouns point back at the previous answer, never at a person to search.
    'both', 'each', 'everyone', 'him', 'his', 'it', 'its', 'none', 'one', 'ones', 'people',
    'same', 'she', 'somebody', 'someone', 'such', 'they', 'those',
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

  // Partial phones and customer/job codes are the only free-text terms worth a
  // substring search. Searching the whole sentence makes "hi" match "Rohith".
  const lookupTerms = [];
  if (jobNumber) lookupTerms.push(jobNumber);
  if (!phone) {
    for (const run of text.match(/\d{4,}/g) || []) {
      if (!lookupTerms.includes(run)) lookupTerms.push(run);
    }
  }

  return {
    raw: text.slice(0, 1500),
    phone,
    jobNumber,
    nameTokens,
    nameHint: nameTokens[0] || null,
    lookupTerms: lookupTerms.slice(0, 3),
  };
}

/** True when there is nothing concrete to look up for this message. */
function hasSearchableTarget(hints, focusCustomerId) {
  return Boolean(
    focusCustomerId ||
      hints?.phone ||
      hints?.jobNumber ||
      (hints?.nameTokens || []).length ||
      (hints?.lookupTerms || []).length
  );
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

/** Inclusive day count between two YYYY-MM-DD keys. */
function dayCountBetween(startKey, endKey) {
  const start = Date.parse(`${startKey}T00:00:00Z`);
  const end = Date.parse(`${endKey}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 1;
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function monthBoundsKey(dateKey, monthOffset = 0) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + monthOffset, 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + monthOffset + 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/** Timestamp bounds for a resolved intent; null means unbounded ("all time"). */
function intentBounds(intent, todayKey) {
  if (intent?.allTime) return { fromTs: null, toTs: null };
  return istDayBounds(intent?.range?.start || todayKey, intent?.range?.end || todayKey);
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
  const mentionsCustomer =
    /\bcustomers?\b|\bclients?\b/.test(text) ||
    (/\bwho\b/.test(text) && /\bpaid\b|\bpaying\b|\bspent\b|\bspend\b/.test(text));
  const mentionsRanking = /\bmost\b|\btop\b|\bhighest\b|\bbiggest\b|\blargest\b|\bbest\b/.test(
    text
  );
  const mentionsValue =
    /\bpaid\b|\bpaying\b|\bspent\b|\bspend\b|\brevenue\b|\bsales\b|\bvalue\b|\bbill(?:ed|ing)?\b/.test(
      text
    );
  return mentionsCustomer && mentionsRanking && mentionsValue;
}

function detectTechnicianBillingRanking(message) {
  const text = String(message || '').toLowerCase();
  const mentionsTechnician =
    /\btechnicians?\b|\btechs?\b|\bstaff\b|\btehcnc?ians?\b/.test(text);
  const mentionsRanking = /\bmost\b|\btop\b|\bhighest\b|\bbiggest\b|\blargest\b|\bbest\b/.test(
    text
  );
  const mentionsBilling =
    /\bbill(?:ed|ing)?\b|\brevenue\b|\bearn(?:ed|ing|ings)?\b|\bsales\b|\bvalue\b/.test(text);
  return mentionsTechnician && mentionsRanking && mentionsBilling;
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
  if (
    has(
      /\bnew customers?\b|\brecent customers?\b|\bnew leads?\b|\bhow many customers?\b|\btotal customers?\b|\bcustomer count\b|\bnumber of customers?\b/
    )
  )
    scopes.add('customers');
  const wantsCustomerRanking = detectCustomerValueRanking(message);
  const wantsTechnicianRanking = detectTechnicianBillingRanking(message);
  if (
    !wantsCustomerRanking &&
    !wantsTechnicianRanking &&
    has(/\brevenue|\bcollect|\bearn|\bincome|\bturnover|\bsales\b/)
  )
    scopes.add('revenue');
  if (wantsCustomerRanking) scopes.add('customer_value_ranking');
  if (wantsTechnicianRanking) scopes.add('technician_billing_ranking');
  if (has(/\bsummary|\boverview|\bstatus report\b|\bdaily report\b|\bfull report\b/))
    scopes.add('summary');

  // The last status word wins so a correction ("completed today — I meant
  // ongoing") overrides the status it is correcting.
  const statusPatterns = [
    { statuses: ['FOLLOW_UP'], pattern: /\bfollow[\s-]?ups?\b/g },
    { statuses: ['COMPLETED'], pattern: /\bcompleted?\b|\bdone\b|\bfinished\b|\bclosed\b/g },
    { statuses: ['CANCELLED'], pattern: /\bcancell?ed\b/g },
    {
      statuses: ONGOING_JOB_STATUSES,
      pattern:
        /\bpending\b|\bopen\b|\bon[\s-]?going\b|\bincomplete\b|\bunassigned\b|\bactive\b|\bremaining\b|\bleft\b|\bin[\s-]?progress\b|\ben[\s-]?route\b|\bnot (?:yet )?(?:completed|done)\b|\byet to\b/g,
    },
  ];
  let statuses = null;
  let statusAt = -1;
  for (const { statuses: candidate, pattern } of isFollowUp ? [] : statusPatterns) {
    let match = pattern.exec(text);
    while (match) {
      if (match.index > statusAt) {
        statusAt = match.index;
        statuses = candidate;
      }
      match = pattern.exec(text);
    }
  }
  if (isFollowUp) statuses = ['FOLLOW_UP'];

  let start = todayKey;
  let end = todayKey;
  let label = 'today';
  let explicitDate = false;
  let allTime = false;

  if (
    has(
      /\ball[\s-]?time\b|\blife[\s-]?time\b|\bever\b|\boverall\b|\bin total\b|\bentire\b|\bso far\b|\bhistor(?:y|ical)\b|\bever since\b|\bfrom the start\b/
    )
  ) {
    start = null;
    end = null;
    label = 'all time';
    explicitDate = true;
    allTime = true;
  } else if (has(/\byesterday\b/)) {
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

  const yearMatch = String(message || '').match(/\b(20\d{2})\b(?!-)/);
  if (yearMatch && !has(/\b20\d{2}-\d{2}-\d{2}\b/)) {
    start = `${yearMatch[1]}-01-01`;
    end = `${yearMatch[1]}-12-31`;
    label = yearMatch[1];
    explicitDate = true;
    allTime = false;
  }

  const explicitDateKey = String(message || '').match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1] || null;
  if (explicitDateKey) {
    start = explicitDateKey;
    end = explicitDateKey;
    label = explicitDateKey;
    explicitDate = true;
    allTime = false;
  }

  // "Top billing customer" and "who paid us most" are different questions: one
  // counts everything invoiced, the other only money confirmed as paid.
  const rankingBasis =
    has(/\bbill(?:ed|ing)?\b|\brevenue\b|\bvalue\b|\bturnover\b/) && !has(/\bpaid\b|\bspent\b/)
      ? 'billed'
      : 'paid';

  // Trend and forecast facts cost extra queries and clutter a plain "how much
  // today", so only gather them when the question actually asks.
  const wantsComparison = has(
    /\bcompare|\bcomparison\b|\bversus\b|\bvs\.?\b|\bgrowth\b|\bgrew\b|\btrend|\bbetter\b|\bworse\b|\bup or down\b|\bthan (?:last|previous)\b|\bagainst (?:last|previous)\b/
  );
  const wantsProjection = has(
    /\bproject|\bforecast|\bestimate|\bexpect|\bon track\b|\brun[\s-]?rate\b|\bend (?:of|up)\b|\bwill (?:it|we|this)\b|\bcan be\b|\bcould be\b|\bmight be\b|\blikely\b|\bpace\b/
  );

  return {
    scopes,
    statuses,
    range: { start, end, label },
    explicitDate,
    allTime,
    rankingBasis,
    wantsComparison,
    wantsProjection,
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
    completedAt: row.completed_at || row.end_time || null,
    scheduledDate: row.scheduled_date || null,
    assignedTechnicianId: row.assigned_technician_id
      ? String(row.assigned_technician_id)
      : null,
    completedBy: row.completed_by ? String(row.completed_by) : null,
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

  const matchedBefore = out.length;
  const queries = [];
  if (hints.phone) queries.push(hints.phone);
  for (const token of hints.nameTokens || []) queries.push(token);
  if (!queries.length) {
    for (const term of hints.lookupTerms || []) queries.push(term);
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

  // Admins type names the way they hear them ("shety" for "Shetty"), so retry
  // spelled-out names approximately before reporting nothing found.
  if (out.length === matchedBefore) {
    for (const token of hints.nameTokens || []) {
      if (out.length >= CUSTOMER_LIMIT) break;
      const clean = token.toLowerCase().replace(/[^\p{L}]/gu, '');
      if (clean.length < 4) continue;
      const stem = escapeForLike(clean.slice(0, Math.max(3, Math.ceil(clean.length / 2))));
      const { data, error } = await db
        .from('customers')
        .select(CUSTOMER_COLS)
        .ilike('full_name', `%${stem}%`)
        .order('created_at', { ascending: false })
        .limit(FUZZY_NAME_SCAN_LIMIT);
      if (error) {
        console.warn('[ai-crm-lookup] fuzzy customer search failed', error.message);
        continue;
      }
      const scored = [];
      for (const row of data || []) {
        const slim = slimCustomer(row);
        if (!slim || seen.has(slim.id)) continue;
        const distance = nameMatchesToken(slim.name, clean);
        if (distance < 0) continue;
        scored.push({ slim, distance });
      }
      if (!scored.length) continue;
      scored.sort((a, b) => a.distance - b.distance);
      hints.fuzzyNameMatches = hints.fuzzyNameMatches || [];
      hints.fuzzyNameMatches.push({ typed: token, matched: scored[0].slim.name });
      for (const { slim } of scored) {
        if (seen.has(slim.id)) continue;
        seen.add(slim.id);
        out.push(slim);
        if (out.length >= CUSTOMER_LIMIT) break;
      }
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

async function loadTechnicianNames(db, ids, knownTechnicians = []) {
  const nameById = new Map(
    (knownTechnicians || [])
      .filter((tech) => tech?.technicianId)
      .map((tech) => [String(tech.technicianId), tech.name])
  );
  const missing = [
    ...new Set(
      (ids || [])
        .filter(Boolean)
        .map(String)
        .filter((id) => !nameById.has(id))
    ),
  ].slice(0, OVERVIEW_CUSTOMER_LIMIT);
  if (!missing.length) return Object.fromEntries(nameById);

  const { data, error } = await db.from('technicians').select('id,full_name').in('id', missing);
  if (error) {
    console.warn('[ai-crm-lookup] technician name hydrate failed', error.message);
    return Object.fromEntries(nameById);
  }
  for (const row of data || []) {
    nameById.set(String(row.id), String(row.full_name || 'Technician').trim());
  }
  return Object.fromEntries(nameById);
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

/** Orders customers by the total the question actually asked about. */
function compareCustomerValue(basis) {
  const primary = basis === 'billed' ? 'billedTotal' : 'confirmedPaidTotal';
  const secondary = basis === 'billed' ? 'confirmedPaidTotal' : 'billedTotal';
  return (a, b) =>
    b[primary] - a[primary] ||
    b[secondary] - a[secondary] ||
    String(a.name || '').localeCompare(String(b.name || ''));
}

function resolveCompletedJobValue(row) {
  const paymentAmount = Number(row?.payment_amount) || 0;
  const actualCost = Number(row?.actual_cost) || 0;
  return Math.max(0, paymentAmount > 0 ? paymentAmount : actualCost);
}

function normalizeTechnicianBillingRow(row) {
  if (!row?.technician_id) return null;
  return {
    technicianId: String(row.technician_id),
    employeeId: row.employee_id ? String(row.employee_id) : null,
    name: row.technician_name ? String(row.technician_name).trim() : 'Technician',
    billedTotal: Math.round(Number(row.billed_total) || 0),
    completedJobs: Math.max(0, Math.round(Number(row.completed_jobs) || 0)),
  };
}

async function loadTechnicianBillingRanking(db, intent, todayKey) {
  const bounds = intentBounds(intent, todayKey);

  const { data: rpcData, error: rpcError } = await db.rpc('ai_crm_top_technicians', {
    p_limit: TOP_TECHNICIAN_LIMIT,
    p_from: bounds.fromTs,
    p_to: bounds.toTs,
  });
  if (!rpcError && Array.isArray(rpcData)) {
    return {
      technicians: rpcData.map(normalizeTechnicianBillingRow).filter(Boolean),
      scannedJobs: null,
      truncated: false,
      source: 'database_aggregate',
    };
  }
  if (rpcError) {
    console.warn('[ai-crm-lookup] top technician RPC unavailable; using thin fallback');
  }

  const select =
    'id,assigned_technician_id,completed_by,payment_amount,actual_cost,completed_at,end_time';
  const withBounds = (query, column) => {
    if (!bounds.fromTs || !bounds.toTs) return query;
    return query.gte(column, bounds.fromTs).lt(column, bounds.toTs);
  };
  const queries = [
    withBounds(
      db.from('jobs').select(select).eq('status', 'COMPLETED'),
      'completed_at'
    ).limit(TECHNICIAN_BILLING_SCAN_LIMIT),
    withBounds(
      db.from('jobs').select(select).eq('status', 'COMPLETED').is('completed_at', null),
      'end_time'
    ).limit(TECHNICIAN_BILLING_SCAN_LIMIT),
  ];
  const results = await Promise.all(queries);
  const jobs = [];
  const seen = new Set();
  let truncated = false;
  for (const result of results) {
    if (result.error) {
      console.warn('[ai-crm-lookup] technician billing scan failed', result.error.message);
      continue;
    }
    if ((result.data || []).length >= TECHNICIAN_BILLING_SCAN_LIMIT) truncated = true;
    for (const row of result.data || []) {
      if (!row?.id || seen.has(row.id)) continue;
      seen.add(row.id);
      jobs.push(row);
    }
  }

  const grouped = new Map();
  for (const job of jobs) {
    // Match analytics attribution first; completed_by covers legacy unassigned rows.
    const technicianId = String(job.assigned_technician_id || job.completed_by || '').trim();
    if (!technicianId) continue;
    const current = grouped.get(technicianId) || {
      technicianId,
      name: 'Technician',
      billedTotal: 0,
      completedJobs: 0,
    };
    current.billedTotal += resolveCompletedJobValue(job);
    current.completedJobs += 1;
    grouped.set(technicianId, current);
  }

  const technicianIds = [...grouped.keys()];
  if (technicianIds.length) {
    const { data, error } = await db
      .from('technicians')
      .select('id,full_name,employee_id')
      .in('id', technicianIds);
    if (error) {
      console.warn('[ai-crm-lookup] technician names failed', error.message);
    } else {
      for (const row of data || []) {
        const current = grouped.get(String(row.id));
        if (!current) continue;
        current.name = String(row.full_name || 'Technician').trim();
        current.employeeId = row.employee_id ? String(row.employee_id) : null;
      }
    }
  }

  const technicians = [...grouped.values()]
    .map((row) => ({ ...row, billedTotal: Math.round(row.billedTotal) }))
    .sort(
      (a, b) =>
        b.billedTotal - a.billedTotal ||
        b.completedJobs - a.completedJobs ||
        a.name.localeCompare(b.name)
    )
    .slice(0, TOP_TECHNICIAN_LIMIT);

  return {
    technicians,
    scannedJobs: jobs.length,
    truncated,
    source: 'thin_fallback',
  };
}

async function loadTopCustomerValueRanking(db, intent, todayKey) {
  let fromTs = null;
  let toTs = null;
  if (intent.explicitDate && !intent.allTime) {
    const bounds = istDayBounds(intent.range.start || todayKey, intent.range.end || todayKey);
    fromTs = bounds.fromTs;
    toTs = bounds.toTs;
  }

  const { data: rpcData, error: rpcError } = await db.rpc('ai_crm_top_customers', {
    // Over-fetch so re-ordering by billed value still sees the real leaders.
    p_limit: TOP_CUSTOMER_LIMIT * 3,
    p_from: fromTs,
    p_to: toTs,
  });
  if (!rpcError && Array.isArray(rpcData)) {
    return {
      customers: rpcData
        .map(normalizeCustomerValueRow)
        .filter(Boolean)
        .sort(compareCustomerValue(intent.rankingBasis))
        .slice(0, TOP_CUSTOMER_LIMIT),
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

  const primary = intent.rankingBasis === 'billed' ? 'billedTotal' : 'confirmedPaidTotal';
  const secondary = intent.rankingBasis === 'billed' ? 'confirmedPaidTotal' : 'billedTotal';
  const ranked = [...grouped.values()]
    .sort(
      (a, b) =>
        b[primary] - a[primary] ||
        b[secondary] - a[secondary] ||
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

/** Technicians whose name matches a typed token, allowing for misspellings. */
async function findTechniciansByName(db, nameTokens) {
  const matches = [];
  for (const token of (nameTokens || []).slice(0, 2)) {
    const clean = token.toLowerCase().replace(/[^\p{L}]/gu, '');
    if (clean.length < 4) continue;
    const stem = escapeForLike(clean.slice(0, Math.max(3, Math.ceil(clean.length / 2))));
    const { data, error } = await db
      .from('technicians')
      .select('id,full_name,employee_id')
      .ilike('full_name', `%${stem}%`)
      .limit(FUZZY_NAME_SCAN_LIMIT);
    if (error) {
      console.warn('[ai-crm-lookup] technician name search failed', error.message);
      continue;
    }
    for (const row of data || []) {
      if (nameMatchesToken(row.full_name, clean) < 0) continue;
      if (matches.find((match) => match.id === String(row.id))) continue;
      matches.push({
        id: String(row.id),
        name: String(row.full_name || 'Technician').trim(),
        employeeId: row.employee_id ? String(row.employee_id) : null,
      });
    }
  }
  return matches.slice(0, 3);
}

/**
 * A technician's biggest completed jobs. Totals alone cannot answer "what is the
 * highest billing they did for one customer".
 */
async function loadTechnicianTopJobs(db, technicianIds, intent, todayKey) {
  const ids = (technicianIds || []).slice(0, 3);
  if (!ids.length) return [];
  const bounds = intentBounds(intent, todayKey);
  const build = (column) => {
    let query = db
      .from('jobs')
      .select(JOB_COLS)
      .eq('status', 'COMPLETED')
      .in('assigned_technician_id', ids)
      .order(column, { ascending: false, nullsFirst: false })
      .limit(TECHNICIAN_TOP_JOB_SCAN);
    if (bounds.fromTs && bounds.toTs) {
      query = query.gte('completed_at', bounds.fromTs).lt('completed_at', bounds.toTs);
    }
    return query;
  };

  const results = await Promise.all([build('payment_amount'), build('actual_cost')]);
  const byId = new Map();
  for (const result of results) {
    if (result.error) {
      console.warn('[ai-crm-lookup] technician top jobs failed', result.error.message);
      continue;
    }
    for (const row of result.data || []) {
      const slim = slimJob(row);
      if (slim && !byId.has(slim.id)) byId.set(slim.id, slim);
    }
  }
  return [...byId.values()]
    .sort((a, b) => resolveCompletedJobValue(b) - resolveCompletedJobValue(a))
    .slice(0, TECHNICIAN_TOP_JOB_LIMIT);
}

/**
 * Billing totals for a named shortlist ("which Shetty billed the most"), which a
 * global top-N ranking cannot answer because those customers may not be in it.
 */
async function loadCustomerValuesForShortlist(db, shortlist, intent, todayKey) {
  const customers = (shortlist || []).filter((customer) => customer?.id).slice(0, TOP_CUSTOMER_LIMIT);
  if (!customers.length) return { customers: [], source: 'named_shortlist', truncated: false };

  let query = db
    .from('jobs')
    .select('id,customer_id,payment_status,payment_amount,actual_cost')
    .eq('status', 'COMPLETED')
    .in(
      'customer_id',
      customers.map((customer) => customer.id)
    )
    .limit(NAMED_CUSTOMER_VALUE_SCAN_LIMIT);
  if (intent.explicitDate && !intent.allTime) {
    const bounds = istDayBounds(intent.range.start || todayKey, intent.range.end || todayKey);
    query = query.gte('completed_at', bounds.fromTs).lt('completed_at', bounds.toTs);
  }

  const { data, error } = await query;
  if (error) {
    console.warn('[ai-crm-lookup] named customer value scan failed', error.message);
    return { customers: [], source: 'unavailable', truncated: false };
  }

  const totals = new Map(
    customers.map((customer) => [
      customer.id,
      { confirmedPaidTotal: 0, billedTotal: 0, fullyPaidJobs: 0, completedJobs: 0 },
    ])
  );
  for (const row of data || []) {
    const current = totals.get(String(row.customer_id));
    if (!current) continue;
    const amount = resolveCompletedJobValue(row);
    current.billedTotal += amount;
    current.completedJobs += 1;
    if (row.payment_status === 'PAID') {
      current.confirmedPaidTotal += amount;
      current.fullyPaidJobs += 1;
    }
  }

  const ranked = customers
    .map((customer) => {
      const totalsForCustomer = totals.get(customer.id);
      return normalizeCustomerValueRow({
        customer_id: customer.id,
        customer_code: customer.customerCode,
        customer_name: customer.name,
        phone: customer.phone,
        confirmed_paid_total: totalsForCustomer.confirmedPaidTotal,
        billed_total: totalsForCustomer.billedTotal,
        fully_paid_jobs: totalsForCustomer.fullyPaidJobs,
        completed_jobs: totalsForCustomer.completedJobs,
      });
    })
    .filter(Boolean)
    .sort(compareCustomerValue(intent.rankingBasis));

  return {
    customers: ranked,
    source: 'named_shortlist',
    truncated: (data || []).length >= NAMED_CUSTOMER_VALUE_SCAN_LIMIT,
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
    technicians: [],
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
  const wantsTechnicianBillingRanking = scopes.has('technician_billing_ranking');

  if (wantsCustomerValueRanking) {
    // "Which Shetty billed most" must rank the matched names, not the global top
    // ten, which may not contain any of them.
    const ranking = intent.shortlistCustomers?.length
      ? await loadCustomerValuesForShortlist(db, intent.shortlistCustomers, intent, todayKey)
      : await loadTopCustomerValueRanking(db, intent, todayKey);
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
    out.stats.customerValueRankingBasis = `ordered by ${
      intent.rankingBasis === 'billed' ? 'billedTotal' : 'confirmedPaidTotal'
    }; confirmedPaidTotal counts completed jobs whose payment_status is PAID; billedTotal counts completed-job value and may include unpaid or partially paid work`;
    out.stats.customerValueRankingPeriod =
      intent.explicitDate && !intent.allTime ? range.label : 'lifetime';
    if (intent.shortlistCustomers?.length) {
      out.stats.customerValueRankingScope = `only customers matching the requested name (${intent.shortlistCustomers.length} matched)`;
    }
    out.stats.customerValueRankingSource = ranking.source;
    out.truncated.customerValueRanking = ranking.truncated;
  }

  if (wantsTechnicianBillingRanking && intent.technicianMatches?.length) {
    const topJobs = await loadTechnicianTopJobs(
      db,
      intent.technicianMatches.map((technician) => technician.id),
      intent,
      todayKey
    );
    out.jobs.push(...topJobs);
    const best = topJobs[0];
    out.stats.technicianTopJobs = {
      technicians: intent.technicianMatches.map((technician) => technician.name),
      period: intent.allTime ? 'all time' : range.label,
      largestJob: best
        ? {
            jobNumber: best.jobNumber,
            customerId: best.customerId,
            billedInr: resolveCompletedJobValue({
              payment_amount: best.paymentAmount,
              actual_cost: best.actualCost,
            }),
          }
        : null,
    };
  }

  if (wantsTechnicianBillingRanking) {
    const ranking = await loadTechnicianBillingRanking(db, intent, todayKey);
    out.technicians.push(...ranking.technicians);
    out.stats.technicianBillingRanking = ranking.technicians.map((technician, index) => ({
      rank: index + 1,
      ...technician,
    }));
    out.stats.technicianBillingPeriod = range.label || 'today';
    out.stats.technicianBillingCompletedJobsScanned = ranking.scannedJobs;
    out.stats.technicianBillingBasis =
      'billedTotal is completed-job billing (payment_amount when positive, otherwise actual_cost); attribution prefers assigned_technician_id to match Analytics, with completed_by as fallback in local scan mode';
    out.stats.technicianBillingRankingSource = ranking.source;
    out.truncated.technicianBillingRanking = ranking.truncated;
  }

  if (wantsJobs) {
    const completedOnly = Array.isArray(statuses) && statuses.length === 1 && statuses[0] === 'COMPLETED';
    const useCompletedAt = completedOnly || scopes.has('revenue');
    let q = db.from('jobs').select(JOB_COLS).limit(OVERVIEW_JOB_LIMIT);

    if (useCompletedAt) {
      const bounds = intentBounds(intent, todayKey);
      q = q.eq('status', 'COMPLETED');
      if (bounds.fromTs && bounds.toTs) {
        q = q.gte('completed_at', bounds.fromTs).lt('completed_at', bounds.toTs);
      }
      q = q.order('completed_at', { ascending: false });
    } else {
      if (statuses) q = q.in('status', statuses);
      const applyRange = intent.explicitDate || !statuses;
      if (applyRange) {
        if (range.start) q = q.gte('scheduled_date', range.start);
        if (range.end) q = q.lte('scheduled_date', range.end);
      }
      q = q.order('scheduled_date', { ascending: true });
    }

    // "How many jobs did Jyotirling do today" is about one technician, not the
    // whole day.
    if (intent.technicianMatches?.length) {
      const ids = intent.technicianMatches.map((technician) => technician.id);
      q = q.or(
        `assigned_technician_id.in.(${ids.join(',')}),completed_by.in.(${ids.join(',')})`
      );
      out.stats.jobsFilteredByTechnician = intent.technicianMatches.map(
        (technician) => technician.name
      );
    }

    const { data, error } = await q;
    if (error) console.warn('[ai-crm-lookup] overview jobs failed', error.message);
    const seenJobIds = new Set(out.jobs.map((job) => job.id));
    for (const row of data || []) {
      const slim = slimJob(row);
      if (!slim || seenJobIds.has(slim.id)) continue;
      seenJobIds.add(slim.id);
      out.jobs.push(slim);
    }

    // Work finished today was often scheduled earlier, so a technician's day is
    // incomplete without the jobs they closed in the period.
    if (intent.technicianMatches?.length && !useCompletedAt) {
      const ids = intent.technicianMatches.map((technician) => technician.id);
      const bounds = intentBounds(intent, todayKey);
      let closed = db
        .from('jobs')
        .select(JOB_COLS)
        .eq('status', 'COMPLETED')
        .or(`assigned_technician_id.in.(${ids.join(',')}),completed_by.in.(${ids.join(',')})`)
        .order('completed_at', { ascending: false })
        .limit(OVERVIEW_JOB_LIMIT);
      if (bounds.fromTs && bounds.toTs) {
        closed = closed.gte('completed_at', bounds.fromTs).lt('completed_at', bounds.toTs);
      }
      const closedResult = await closed;
      if (closedResult.error) {
        console.warn('[ai-crm-lookup] technician completed jobs failed', closedResult.error.message);
      }
      let completedByTechnician = 0;
      for (const row of closedResult.data || []) {
        completedByTechnician += 1;
        const slim = slimJob(row);
        if (!slim || seenJobIds.has(slim.id)) continue;
        seenJobIds.add(slim.id);
        out.jobs.push(slim);
      }
      out.stats.jobsCompletedByTechnicianInRange = completedByTechnician;
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
    // Outstanding money stays outstanding, so a plain "pending payments" question
    // must not hide amounts that happen to fall due next week.
    const openEndedPayments = wantsPayments && !intent.explicitDate;
    if (range.start && !wantsPayments) q = q.gte('reminder_at', range.start);
    if (range.end && !openEndedPayments) q = q.lte('reminder_at', range.end);

    const { data, error } = await q;
    if (error) console.warn('[ai-crm-lookup] overview reminders failed', error.message);

    let paymentTotal = 0;
    let paymentCount = 0;
    let dueNowCount = 0;
    let dueNowTotal = 0;
    for (const row of data || []) {
      const isPayment = String(row.title || '').trim() === PENDING_PAYMENT_TITLE;
      if (isPayment) {
        if (!wantsPayments) continue;
        const pay = slimPayment(row);
        if (!pay) continue;
        paymentCount += 1;
        paymentTotal += pay.amountPending || 0;
        if (!pay.dueAt || String(pay.dueAt).slice(0, 10) <= todayKey) {
          dueNowCount += 1;
          dueNowTotal += pay.amountPending || 0;
        }
        if (out.payments.length < PAYMENT_LIMIT) out.payments.push(pay);
      } else {
        if (openEndedPayments && String(row.reminder_at || '') > (range.end || todayKey)) continue;
        if (!wantsReminders) continue;
        const rem = slimReminder(row);
        if (rem && out.reminders.length < OVERVIEW_REMINDER_LIMIT) out.reminders.push(rem);
      }
    }
    if (wantsPayments) {
      out.stats.pendingPaymentsListed = paymentCount;
      out.stats.pendingPaymentsListedTotal = Math.round(paymentTotal);
      // Money owed is outstanding until it is collected; it is not "today's"
      // data even though it shows up in a question asked today.
      out.stats.pendingPaymentsScope = intent.explicitDate
        ? `due on or before ${range.end || todayKey}`
        : 'every outstanding payment reminder, whatever its due date';
      if (!intent.explicitDate) {
        out.stats.pendingPaymentsAlreadyDue = dueNowCount;
        out.stats.pendingPaymentsAlreadyDueTotal = Math.round(dueNowTotal);
      }
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
    out.stats.customersTotal = await countRows(
      db.from('customers').select('id', { count: 'exact', head: true })
    );
    out.stats.customersAddedInRange = await countRows(
      (() => {
        const bounds = intentBounds(intent, todayKey);
        let query = db.from('customers').select('id', { count: 'exact', head: true });
        if (bounds.fromTs && bounds.toTs) {
          query = query.gte('created_at', bounds.fromTs).lt('created_at', bounds.toTs);
        }
        return query;
      })()
    );
  }

  // Ranking-only questions are already answered by one grouped RPC. Avoid the
  // unrelated jobs/reminders/count queries used by the general ops dashboard.
  if (
    (wantsCustomerValueRanking || wantsTechnicianBillingRanking) &&
    [...scopes].every((scope) =>
      ['customer_value_ranking', 'technician_billing_ranking'].includes(scope)
    )
  ) {
    out.stats.today = todayKey;
    out.stats.rangeLabel = intent.explicitDate ? range.label : 'lifetime';
    return out;
  }

  // Exact counts (cheap head queries) so "how many" answers are accurate.
  const dayBounds = intentBounds(intent, todayKey);
  const withDayBounds = (query, column) => {
    if (!dayBounds.fromTs || !dayBounds.toTs) return query;
    return query.gte(column, dayBounds.fromTs).lt(column, dayBounds.toTs);
  };
  out.stats.today = todayKey;
  out.stats.rangeLabel = range.label;
  if (wantsJobs) {
    const wantsAllJobCounts = scopes.has('summary');
    const wantsCompletedCount =
      wantsAllJobCounts ||
      scopes.has('revenue') ||
      (Array.isArray(statuses) && statuses.length === 1 && statuses[0] === 'COMPLETED');
    const wantsOpenCount =
      wantsAllJobCounts ||
      (Array.isArray(statuses) && statuses.some((status) => ONGOING_JOB_STATUSES.includes(status)));
    const wantsFollowUpCount =
      wantsAllJobCounts ||
      (Array.isArray(statuses) && statuses.length === 1 && statuses[0] === 'FOLLOW_UP');
    const wantsScheduledCount =
      wantsAllJobCounts || (!wantsCompletedCount && !wantsOpenCount && !wantsFollowUpCount);

    if (wantsScheduledCount) {
      out.stats.jobsScheduledInRange = await countRows(
        (() => {
          let q = db.from('jobs').select('id', { count: 'exact', head: true });
          if (range.start) q = q.gte('scheduled_date', range.start);
          if (range.end) q = q.lte('scheduled_date', range.end);
          return q;
        })()
      );
    }
    if (wantsCompletedCount) {
      out.stats.jobsCompletedInRange = await countRows(
        withDayBounds(
          db.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'COMPLETED'),
          'completed_at'
        )
      );
    }
    if (wantsOpenCount) {
      out.stats.openJobsTotal = await countRows(
        db.from('jobs').select('id', { count: 'exact', head: true }).in('status', ONGOING_JOB_STATUSES)
      );
    }
    if (wantsFollowUpCount) {
      out.stats.followUpJobsTotal = await countRows(
        db.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'FOLLOW_UP')
      );
    }
  }

  if (scopes.has('revenue') || scopes.has('summary')) {
    const sumCompletedValue = async (fromTs, toTs) => {
      let query = db.from('jobs').select('payment_amount, actual_cost').eq('status', 'COMPLETED');
      if (fromTs && toTs) query = query.gte('completed_at', fromTs).lt('completed_at', toTs);
      const { data, error } = await query.limit(REVENUE_SCAN_LIMIT);
      if (error) {
        console.warn('[ai-crm-lookup] revenue failed', error.message);
        return null;
      }
      let sum = 0;
      for (const row of data || []) {
        const n = Number(row.payment_amount ?? row.actual_cost);
        if (Number.isFinite(n)) sum += n;
      }
      if ((data || []).length >= REVENUE_SCAN_LIMIT) out.truncated.revenue = true;
      return Math.round(sum);
    };

    const value = await sumCompletedValue(dayBounds.fromTs, dayBounds.toTs);
    if (value != null) out.stats.completedJobValueInRange = value;

    const wantsTrend = intent.wantsComparison || intent.wantsProjection;
    if (
      value != null &&
      wantsTrend &&
      scopes.has('revenue') &&
      !intent.allTime &&
      range.start &&
      range.end
    ) {
      const periodDays = dayCountBetween(range.start, range.end);
      const previousEnd = addDaysKey(range.start, -1);
      const previousStart = addDaysKey(previousEnd, -(periodDays - 1));
      if (intent.wantsComparison) {
        const previousBounds = istDayBounds(previousStart, previousEnd);
        const previousValue = await sumCompletedValue(previousBounds.fromTs, previousBounds.toTs);
        if (previousValue != null) {
          out.stats.completedJobValuePrevious = {
            label: `${previousStart} to ${previousEnd}`,
            value: previousValue,
            changePct:
              previousValue > 0
                ? Math.round(((value - previousValue) / previousValue) * 1000) / 10
                : null,
          };
        }
      }
      // Straight-line run rate, only while the period is still running.
      if (range.start <= todayKey && range.end > todayKey) {
        const elapsedDays = dayCountBetween(range.start, todayKey);
        if (elapsedDays > 0 && value > 0) {
          const perDay = value / elapsedDays;
          if (intent.wantsProjection) {
            out.stats.completedJobValueProjection = {
              elapsedDays,
              periodDays,
              perDay: Math.round(perDay),
              projectedPeriodTotal: Math.round(perDay * periodDays),
            };
          }
          // A part-month total only compares fairly with the same part of the
          // previous period.
          const priorPartialEnd = addDaysKey(previousStart, elapsedDays - 1);
          const priorPartialBounds = istDayBounds(previousStart, priorPartialEnd);
          const priorPartialValue = await sumCompletedValue(
            priorPartialBounds.fromTs,
            priorPartialBounds.toTs
          );
          if (priorPartialValue != null) {
            out.stats.completedJobValuePreviousToDate = {
              label: `${previousStart} to ${priorPartialEnd}`,
              value: priorPartialValue,
              changePct:
                priorPartialValue > 0
                  ? Math.round(((value - priorPartialValue) / priorPartialValue) * 1000) / 10
                  : null,
            };
          }
        }
      }
    }
  }

  return out;
}

/**
 * Build a bounded CRM context pack for one admin chat turn.
 */
function scopesForPlannerTools(tools) {
  // customer_search / job_search deliberately map to no scope: they are targeted
  // hint lookups, not "list every recent customer/job" sweeps.
  const map = {
    customer_directory: 'customers',
    jobs_overview: 'jobs',
    payments: 'payments',
    reminders: 'reminders',
    amc: 'amc',
    revenue: 'revenue',
    customer_value_ranking: 'customer_value_ranking',
    technician_billing_ranking: 'technician_billing_ranking',
  };
  return new Set((Array.isArray(tools) ? tools : []).map((tool) => map[tool]).filter(Boolean));
}

async function lookupCrmContext({ message, focusCustomerId, plannerTools } = {}) {
  const todayKey = istDateKey();
  const db = getServiceSupabase();
  if (!db) {
    return {
      customers: [],
      jobs: [],
      reminders: [],
      payments: [],
      documents: [],
      technicians: [],
      stats: { today: todayKey },
      hints: extractQueryHints(message),
      error: 'Database unavailable',
    };
  }

  const hints = extractQueryHints(message);
  const detected = detectOverviewIntent(message, todayKey);
  const plannedScopes = scopesForPlannerTools(plannerTools);
  if (Array.isArray(plannerTools) && plannerTools.length) {
    // The LLM may choose only allowlisted capabilities. Keywords still resolve
    // dates/statuses, but cannot silently broaden the selected data sections.
    detected.scopes = plannedScopes;
    detected.active = plannedScopes.size > 0;
  }
  // A request naming a person or job is about them, not a whole-day sweep.
  const hasSpecificTarget = hasSearchableTarget(hints, focusCustomerId);
  // Aggregates answer "how much / how many overall" and stay correct even when a
  // stray word ("revenue", "money") is mistaken for a name. Only the plain jobs
  // and customers lists are suppressed, because those would become a whole-day
  // sweep on top of a request about one person.
  const wantsAggregate = [...detected.scopes].some((scope) =>
    ['revenue', 'payments', 'reminders', 'amc', 'summary', 'customer_value_ranking', 'technician_billing_ranking'].includes(
      scope
    )
  );
  // A named technician is a filter on the day's work, not a customer lookup, so
  // resolve it before deciding whether the operational query may run at all.
  const technicianMatches =
    detected.active &&
    (detected.scopes.has('jobs') || detected.scopes.has('technician_billing_ranking')) &&
    (hints.nameTokens || []).length
      ? await findTechniciansByName(db, hints.nameTokens)
      : [];
  const intent = {
    ...detected,
    technicianMatches,
    active: detected.active && (!hasSpecificTarget || wantsAggregate || technicianMatches.length > 0),
  };

  // Greetings and chit-chat name no record and ask for no list, so skip the DB
  // entirely instead of showing unrelated rows.
  if (!intent.active && !hasSpecificTarget) {
    return {
      customers: [],
      jobs: [],
      reminders: [],
      payments: [],
      documents: [],
      technicians: [],
      stats: { today: todayKey, weekday: istWeekdayName(todayKey) },
      truncated: {},
      intent: { scopes: [], statuses: null, range: detected.range },
      hints,
      noLookup: true,
    };
  }

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

  let stats = { today: todayKey, weekday: istWeekdayName(todayKey) };
  let truncated = {};
  let technicians = [];

  if (intent.active) {
    if (customers.length && (hints.nameTokens || []).length) {
      intent.shortlistCustomers = customers;
    }
    const overview = await loadOverview(db, intent, todayKey);
    stats = { ...stats, ...overview.stats };
    truncated = overview.truncated || {};
    technicians = overview.technicians || [];

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

  const visibleJobs = jobs.slice(0, jobCap);
  // Without a technician name on each job, "which job did this technician do?"
  // cannot be answered from the facts.
  const technicianNameById = await loadTechnicianNames(
    db,
    visibleJobs.map((job) => job.assignedTechnicianId || job.completedBy),
    technicians
  );

  return {
    customers: customers.slice(0, customerCap),
    jobs: visibleJobs,
    technicianNameById,
    reminders: reminders.slice(0, reminderCap),
    payments: payments.slice(0, PAYMENT_LIMIT * 2),
    documents: documents.slice(0, DOCUMENT_LIMIT * 2),
    technicians: technicians.slice(0, TOP_TECHNICIAN_LIMIT),
    stats,
    truncated,
    intent: {
      scopes: [...intent.scopes],
      statuses: intent.statuses,
      range: intent.range,
      explicitDate: intent.explicitDate,
    },
    hints,
  };
}

function formatContextForPrompt(pack) {
  const lines = [];
  const stats = pack.stats || {};
  const nameById = new Map((pack.customers || []).map((c) => [c.id, c.name]));
  const technicianNameById = pack.technicianNameById || {};

  const today = stats.today || istDateKey();
  lines.push(
    `Today (IST) is ${today}${stats.weekday ? ` (${stats.weekday})` : ''}. Tomorrow is ${addDaysKey(
      today,
      1
    )}; yesterday was ${addDaysKey(today, -1)}. Use these for relative dates, including misspellings.`
  );
  if (pack.noLookup) {
    lines.push(
      'No CRM lookup was performed because the message did not name a customer, job or list to fetch. Reply conversationally and invite a specific request. Do not claim records are missing.'
    );
    return lines.join('\n');
  }
  if (pack.intent?.scopes?.length) {
    const showStatuses = pack.intent.statuses && pack.intent.scopes.includes('jobs');
    const paymentsOnly =
      pack.intent.scopes.length === 1 && pack.intent.scopes[0] === 'payments' && !pack.intent.explicitDate;
    const periodLabel =
      pack.intent.scopes.includes('customer_value_ranking') && stats.customerValueRankingPeriod
        ? stats.customerValueRankingPeriod
        : pack.intent.scopes.includes('technician_billing_ranking') &&
            stats.technicianBillingPeriod
          ? stats.technicianBillingPeriod
          : paymentsOnly
            ? 'outstanding right now (not limited to today)'
            : pack.intent.range?.label || 'today';
    lines.push(
      `Interpreted request: ${pack.intent.scopes.join(', ')}; period = ${periodLabel}${
        showStatuses ? `; job status filter = ${pack.intent.statuses.join('/')}` : ''
      }.`
    );
  }
  if (stats.technicianTopJobs) {
    const detail = stats.technicianTopJobs;
    lines.push(
      `Technician job detail (${detail.technicians.join(', ')}; ${detail.period}): the job rows below are their biggest completed jobs, highest billed first.`
    );
    if (detail.largestJob) {
      lines.push(
        `- Largest single completed job (authoritative for "highest billing for one customer/job"): job ${detail.largestJob.jobNumber || '—'}; customer=${nameById.get(detail.largestJob.customerId) || detail.largestJob.customerId || '—'}; billedINR=${detail.largestJob.billedInr}`
      );
    }
  }
  for (const match of pack.hints?.fuzzyNameMatches || []) {
    lines.push(
      `Spelling note: no customer name contains "${match.typed}"; the closest real names were matched instead (for example ${match.matched}). Say you searched the closest spelling.`
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
  if (stats.jobsFilteredByTechnician?.length)
    statLines.push(
      `the job list below is filtered to technician(s) ${stats.jobsFilteredByTechnician.join(', ')}; counts labelled "in period" cover all technicians`
    );
  if (stats.jobsCompletedByTechnicianInRange != null)
    statLines.push(
      `jobs completed in period by ${(stats.jobsFilteredByTechnician || []).join(', ') || 'the named technician'} = ${stats.jobsCompletedByTechnicianInRange}`
    );
  if (stats.customersTotal != null)
    statLines.push(`customers in the CRM (all time) = ${stats.customersTotal}`);
  if (stats.customersAddedInRange != null)
    statLines.push(`customers added in period = ${stats.customersAddedInRange}`);
  if (stats.completedJobValueInRange != null)
    statLines.push(
      `billed value of jobs completed in period (INR, may include not-yet-collected amounts) = ${stats.completedJobValueInRange}`
    );
  if (stats.completedJobValuePrevious)
    statLines.push(
      `same-length previous period (${stats.completedJobValuePrevious.label}) billed INR ${stats.completedJobValuePrevious.value}${
        stats.completedJobValuePrevious.changePct != null
          ? `, change ${stats.completedJobValuePrevious.changePct > 0 ? '+' : ''}${stats.completedJobValuePrevious.changePct}%`
          : ''
      }`
    );
  if (stats.completedJobValuePreviousToDate)
    statLines.push(
      `same elapsed window of the previous period (${stats.completedJobValuePreviousToDate.label}) billed INR ${stats.completedJobValuePreviousToDate.value}${
        stats.completedJobValuePreviousToDate.changePct != null
          ? `, change ${stats.completedJobValuePreviousToDate.changePct > 0 ? '+' : ''}${stats.completedJobValuePreviousToDate.changePct}%`
          : ''
      } — this is the fair like-for-like comparison while the period is still running`
    );
  if (stats.completedJobValueProjection)
    statLines.push(
      `straight-line projection for the full period = INR ${stats.completedJobValueProjection.projectedPeriodTotal} (${stats.completedJobValueProjection.elapsedDays} of ${stats.completedJobValueProjection.periodDays} days elapsed, INR ${stats.completedJobValueProjection.perDay} per day so far) — state it as an estimate at the current run rate`
    );
  if (stats.pendingPaymentsListed != null)
    statLines.push(
      `pending payment reminders scanned = ${stats.pendingPaymentsListed}, total INR = ${stats.pendingPaymentsListedTotal      }${
        stats.pendingPaymentsScope ? ` (covers ${stats.pendingPaymentsScope})` : ''
      }${
        stats.pendingPaymentsAlreadyDue != null
          ? `, of which ${stats.pendingPaymentsAlreadyDue} are already due today or earlier totalling INR ${stats.pendingPaymentsAlreadyDueTotal}`
          : ''
      }`
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
    if (stats.customerValueRankingScope) {
      lines.push(`- Scope: ${stats.customerValueRankingScope}`);
    }
    for (const row of stats.customerValueRanking) {
      lines.push(
        `- rank=${row.rank}; customerId=${row.customerId}; code=${row.customerCode || '—'}; name=${row.name}; phone=${row.phone || '—'}; confirmedFullyPaidINR=${row.confirmedPaidTotal}; completedJobBilledINR=${row.billedTotal}; fullyPaidJobs=${row.fullyPaidJobs}; completedJobs=${row.completedJobs}`
      );
    }
    if (pack.truncated?.customerValueRanking) {
      lines.push('- Warning: fallback scan hit its safety cap; ranking may be incomplete.');
    }
  }

  if (Array.isArray(stats.technicianBillingRanking)) {
    lines.push(
      `Technician billing ranking (${stats.technicianBillingPeriod || 'today'}; authoritative order):`
    );
    lines.push(`- Basis: ${stats.technicianBillingBasis}`);
    if (!stats.technicianBillingRanking.length) {
      lines.push('- No completed jobs attributable to a technician were found in this period.');
    }
    for (const row of stats.technicianBillingRanking) {
      lines.push(
        `- rank=${row.rank}; technicianId=${row.technicianId}; employeeId=${row.employeeId || '—'}; name=${row.name}; completedJobBilledINR=${row.billedTotal}; completedJobs=${row.completedJobs}`
      );
    }
    if (pack.truncated?.technicianBillingRanking) {
      lines.push('- Warning: technician billing scan hit its safety cap; ranking may be incomplete.');
    }
  }

  const scopes = new Set(pack.intent?.scopes || []);
  const isTargetedLookup = scopes.size === 0;
  const showCustomers =
    isTargetedLookup || scopes.has('customers') || scopes.has('customer_value_ranking');
  const showJobs =
    isTargetedLookup || scopes.has('jobs') || scopes.has('summary') || scopes.has('revenue');

  if (showCustomers && !pack.customers.length) {
    lines.push('Customers: (none matched)');
  } else if (showCustomers) {
    lines.push('Customers:');
    for (const c of pack.customers) {
      lines.push(
        `- id=${c.id}; code=${c.customerCode || '—'}; name=${c.name}; phone=${c.phone || '—'}; lastService=${c.lastServiceDate || '—'}; type=${c.serviceType || '—'}${c.confirmedPaidTotal != null ? `; confirmedFullyPaidINR=${c.confirmedPaidTotal}; completedJobBilledINR=${c.billedTotal}; fullyPaidJobs=${c.fullyPaidJobs}; completedJobs=${c.completedJobs}` : ''}`
      );
    }
  }

  if (showJobs && !pack.jobs.length) {
    lines.push('Jobs: (none matched)');
  } else if (showJobs) {
    lines.push('Jobs:');
    for (const j of pack.jobs) {
      lines.push(
        `- id=${j.id}; number=${j.jobNumber || '—'}; customer=${nameById.get(j.customerId) || '—'} (${j.customerId || '—'}); technician=${
          technicianNameById[String(j.assignedTechnicianId || j.completedBy || '')] || '—'
        }; status=${j.status || '—'}; scheduled=${j.scheduledDate || '—'}; completed=${j.completedAt || '—'}; subtype=${j.serviceSubType || '—'}; payment=${j.paymentAmount ?? '—'}`
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
        `- kind=${d.kind}; id=${d.id}; customer=${nameById.get(d.customerId) || 'unknown'}; customerId=${d.customerId || '—'}; label=${d.label}${
          d.endDate ? `; ends=${d.endDate}` : ''
        }`
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
  TOP_TECHNICIAN_LIMIT,
  ONGOING_JOB_STATUSES,
  extractQueryHints,
  hasSearchableTarget,
  scopesForPlannerTools,
  detectOverviewIntent,
  detectCustomerValueRanking,
  detectTechnicianBillingRanking,
  nameMatchesToken,
  resolveCompletedJobValue,
  istDateKey,
  addDaysKey,
  lookupCrmContext,
  formatContextForPrompt,
  slimCustomer,
  slimJob,
};
