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
const EXPENSE_SCAN_LIMIT = 1000;
const FUZZY_NAME_SCAN_LIMIT = 40;
const NAMED_CUSTOMER_VALUE_SCAN_LIMIT = 600;
const TECHNICIAN_TOP_JOB_SCAN = 25;
const TECHNICIAN_TOP_JOB_LIMIT = 10;
const TOP_CUSTOMER_FALLBACK_PAGE_SIZE = 1000;
const TOP_CUSTOMER_FALLBACK_MAX_PAGES = 50;
const IST_TZ = 'Asia/Kolkata';
const ONGOING_JOB_STATUSES = ['PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS'];
const LIVE_OPS_JOB_LIMIT = 25;
const LIVE_OPS_LOCATION_STALE_MINUTES = 45;

function normalizeCrmQueryText(value) {
  const replacements = {
    // typos
    jbos: 'jobs', complted: 'completed', completd: 'completed', tody: 'today',
    pendng: 'pending', paymnts: 'payments', remidners: 'reminders', remidner: 'reminder',
    tehcnician: 'technician', tehcncian: 'technician', billng: 'billing', mnth: 'month',
    custmer: 'customer', detals: 'details', expiary: 'expiry', revneue: 'revenue',
    // Hindi/Hinglish → English CRM keywords
    aaj: 'today', kal: 'yesterday', abhi: 'now', abhi: 'now',
    kitne: 'how many', kitna: 'how much', kya: 'what', kab: 'when',
    kaam: 'jobs', kharcha: 'expenses', kamai: 'revenue', aaya: 'received',
    aaye: 'received', hua: 'happened', hue: 'done', ho: 'is', raha: 'going',
    paise: 'payments', paisa: 'payment', milenge: 'pending',
    pending: 'pending', kiska: 'whose', kaun: 'who', kaunsa: 'which',
    sabse: 'most', zyada: 'most', kam: 'less', mahine: 'month',
    mahina: 'month', hafte: 'week', din: 'day', saal: 'year',
    technician: 'technician', field: 'field', mein: 'in', hai: 'is',
    karta: 'does', karte: 'do', chala: 'drove', chale: 'drove',
    gaye: 'went', aaya: 'came', aa: 'come', nahi: 'not', nahin: 'not',
    paid: 'paid', unpaid: 'unpaid',
  };
  return String(value || '').replace(/\b[\p{L}]+\b/gu, (word) => {
    return replacements[word.toLowerCase()] || word;
  });
}

const CUSTOMER_COLS =
  'id, customer_id, full_name, phone, alternate_phone, email, service_type, brand, model, last_service_date, customer_tier, status';

const JOB_COLS =
  'id, job_number, customer_id, status, service_type, service_sub_type, service_brand, payment_amount, actual_cost, payment_method, completed_at, end_time, scheduled_date, assigned_technician_id, completed_by, follow_up_date, follow_up_time, follow_up_notes, follow_up_scheduled_at, requirements';

const REMINDER_COLS =
  'id, entity_type, entity_id, title, notes, reminder_at, completed_at, created_at';

const AMC_COLS = 'id, customer_id, start_date, end_date, years, status, service_period_months';
const TAX_COLS = 'id, invoice_number, invoice_date, customer_id, customer_name, total_amount';
const AUTH_COLS = 'id, doc_type, customer_id, verify_code, created_at';

const {
  computeTechWorkedHours,
  formatWorkedDuration,
  parseMs,
  jobCompletionMs,
} = require('./tech-worked-hours-helper');
const { sumStoredTravelKm, getTravelReturnKm, formatTravelKm } = require('./tech-travel-helper');

const FIELD_STATS_JOB_COLS =
  'id, assigned_technician_id, start_time, completed_at, end_time, requirements';
const FIELD_STATS_JOB_SCAN = 500;

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
    'about', 'add', 'afternoon', 'again', 'against', 'all', 'also', 'amc', 'among', 'amount', 'and', 'any',
    'april', 'august', 'between', 'december', 'february', 'january', 'july', 'june',
    'march', 'may', 'november', 'october', 'september',
    'anyone', 'are', 'assign', 'assigned', 'balance', 'bill', 'booked', 'booking', 'business', 'called', 'can',
    'cancel', 'cancelled', 'candy', 'cash', 'categories', 'category', 'change', 'charge', 'check', 'closed', 'collect',
    'collected', 'coming', 'company', 'complaint', 'complaints', 'complete', 'completed',
    'added', 'confirm', 'contact', 'cost', 'count', 'create', 'customer', 'customers', 'date', 'day',
    'days', 'description', 'detail', 'details', 'did', 'document', 'documents', 'does', 'done', 'due', 'dues', 'earn',
    'evening', 'expense', 'expenses', 'expire', 'expired', 'expiring', 'expiry', 'filter', 'filters', 'find', 'finished',
    'follow', 'followup', 'followups', 'for', 'from', 'get', 'give', 'has', 'have', 'his', 'her',
    'how', 'income', 'info', 'information', 'install', 'installation', 'invoice', 'issue',
    'issues', 'job', 'jobs', 'last', 'latest', 'leak', 'leakage', 'lead', 'leads', 'list', 'machine',
    'make', 'many', 'me', 'month', 'more', 'morning', 'much', 'my', 'name', 'need', 'needs',
    'new', 'next', 'night', 'not', 'note', 'notes', 'now', 'number', 'off', 'ongoing', 'open',
    'order', 'our', 'outstanding', 'overdue', 'paid', 'past', 'pay', 'payment', 'payments',
    'pending', 'phone', 'please', 'post', 'pre', 'price', 'purifier', 'quotation', 'raise',
    'received', 'record', 'records', 'renew', 'renewal', 'repair', 'report', 'reminder',
    'reminders', 'rupees', 'sales', 'schedule', 'scheduled', 'search', 'service', 'services',
    'set', 'show', 'slot', 'softener', 'status', 'summary', 'system', 'task', 'tasks', 'that',
    'tell', 'going', 'anything', 'problems', 'compared', 'link', 'book',
    'interesting', 'pull', 'stats', 'items', 'numbers', 'data', 'query', 'fetch', 'metrics', 'metric', 'item', 'rows', 'row', 'table',
    'km', 'kms', 'kilometer', 'kilometre', 'kilometers', 'kilometres', 'drove', 'drive', 'driving', 'travelled', 'traveled', 'travel', 'mileage', 'distance',
    'worked', 'shift', 'field', 'hours', 'hour', 'long',
    'the', 'their', 'them', 'these', 'this', 'time', 'today', 'tomorrow', 'total', 'turnover',
    'ticket', 'tickets', 'calls', 'call', 'outgoing', 'incoming', 'collections', 'collection',
    'unpaid', 'update', 'upcoming', 'us', 'visit', 'visited', 'visits', 'came', 'serviced', 'want', 'was', 'water', 'week', 'were',
    'what', 'when', 'which', 'who', 'will', 'with', 'work', 'year', 'yesterday', 'you', 'your',
    // Sentence glue around a name ("customer having shety") must never be
    // searched itself: short words like "had" substring-match real surnames.
    'called', 'containing', 'contains', 'ending', 'ends', 'had', 'having', 'including', 'includes',
    'happened', 'lowest', 'named', 'naming', 'similar', 'sounds', 'spelled', 'spelling', 'starting', 'starts',
    'whose', 'enroute', 'left', 'meant', 'progress', 'remaining', 'route',
    'collection', 'collections', 'earnings', 'gst', 'money', 'profit', 'revenue', 'tax',
    'alltime', 'billed', 'billing', 'biggest', 'client', 'entire', 'ever', 'highest', 'largest', 'lifetime',
    'most', 'paying', 'spend', 'spending', 'spent', 'thing', 'top', 'value', 'technician', 'technicians', 'tech',
    'tehcncian', 'tehcnician',
    // Greetings and chit-chat must never become a customer search term.
    'bye', 'cool', 'everything', 'fine', 'good', 'great', 'greetings', 'hai', 'hello', 'hey',
    'hii', 'hiii', 'holdon', 'hola', 'namaste', 'nice', 'okay', 'okey', 'please', 'sorry',
    'sure', 'thank', 'thanks', 'thankyou', 'there', 'welcome', 'yeah', 'yes',
    // Ranking follow-ups ("who is second") point at the previous list, not a person.
    'best', 'compare', 'comparison', 'expect', 'estimate', 'first', 'forecast', 'growth',
    'least', 'less', 'other', 'project', 'projection', 'rank', 'ranking', 'second', 'smallest',
    'ai', 'assistant', 'compression', 'glow', 'model', 'models', 'notification', 'notifications',
    'pdf', 'push', 'setting', 'settings', 'tracking', 'quick', 'qr', 'upi', 'generate',
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
  const cleaned = normalizeCrmQueryText(text)
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
  const text = normalizeCrmQueryText(message).trim();
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
    const searchText = text
      .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, ' ')
      .replace(/\b(?:19|20)\d{2}\b/g, ' ');
    for (const run of searchText.match(/\d{4,}/g) || []) {
      if (!lookupTerms.includes(run)) lookupTerms.push(run);
    }
  }

  const payAmount = extractQuickPaymentAmount(text);
  if (payAmount != null && isQuickPaymentQrPhrase(text)) {
    const drop = new Set([
      String(Math.round(payAmount)),
      payAmount.toFixed(2),
      String(payAmount).replace(/\.0+$/, ''),
    ]);
    for (let i = lookupTerms.length - 1; i >= 0; i -= 1) {
      if (drop.has(lookupTerms[i])) lookupTerms.splice(i, 1);
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

/** Parse INR amount from phrases like "2000rs", "₹2000", "of 2000". */
function extractQuickPaymentAmount(message) {
  const text = String(message || '');
  const patterns = [
    /(?:₹|inr|rs\.?)\s*(\d+(?:\.\d{1,2})?)/i,
    /\b(\d+(?:\.\d{1,2})?)\s*(?:rs\.?|inr|₹)\b/i,
    /\b(?:of|for)\s+(\d+(?:\.\d{1,2})?)\b/i,
    /\b(?:qr|payment)\s+(\d+(?:\.\d{1,2})?)\b/i,
    /\b(\d+(?:\.\d{1,2})?)\s+send\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const amount = Number(match[1]);
    if (Number.isFinite(amount) && amount > 0) return Number(amount.toFixed(2));
  }
  return null;
}

function isQuickPaymentQrPhrase(text) {
  const lower = String(text || '').toLowerCase();
  return (
    /\b(?:quick(?:\s+payment)?\s+qr|quick\s+upi|qr\s+payment|payment\s+qr|upi\s+qr)\b/i.test(
      lower
    ) ||
    /\b(?:payment|pay|upi)\s+link\b/i.test(lower) ||
    (/\bquick\b/.test(lower) && /\b(?:qr|upi|link)\b/.test(lower) && /\b(?:payment|pay)\b/.test(lower))
  );
}

/** Generate/download Quick payment QR — not Payment QR settings or pending-payment lookup. */
function isQuickPaymentQrRequest(message, hints) {
  const lower = String(message || '').toLowerCase();
  if (/\b(?:settings?|manage|configure|common payment)\b/i.test(lower)) return false;
  return isQuickPaymentQrPhrase(lower);
}

/** Open Quick payment QR screen vs generate one for a customer/amount. */
/** Admin asked to send (not just open) a payment QR — needs a destination phone or WhatsApp. */
function isQuickPaymentQrSendRequest(message, hints) {
  const lower = String(message || '').toLowerCase();
  if (!/\bsend\b/.test(lower)) return false;
  if (hints?.phone) return true;
  return /\b(?:to|on)\s+(?:whatsapp|wa)\b/.test(lower);
}

function isQuickPaymentQrGenerationRequest(message, hints) {
  if (!isQuickPaymentQrRequest(message, hints)) return false;
  const lower = String(message || '').toLowerCase();
  const amount = extractQuickPaymentAmount(message);
  const hasCustomer = (hints?.nameTokens || []).length > 0 || hints?.phone;
  const navigationOnly =
    /\b(?:open|go to|take me to|show me|navigate)\b/.test(lower) && !hasCustomer && !amount;
  return !navigationOnly;
}

/** @deprecated use isQuickPaymentQrGenerationRequest */
function isCustomerPaymentQrRequest(message, hints) {
  return isQuickPaymentQrGenerationRequest(message, hints);
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

/** True when the message names a specific customer/job — not vague aggregate wording. */
function hasConcreteCustomerLookupTarget(hints, message, focusCustomerId) {
  if (focusCustomerId || hints?.phone || hints?.jobNumber || (hints?.lookupTerms || []).length) {
    return true;
  }
  const text = String(message || '').trim();
  const lower = text.toLowerCase();
  const afterLead = lower.match(/\b(?:on|called|named|for)\s+([a-z]{3,})/i)?.[1];
  if (afterLead && !NAME_STOP_WORDS.has(afterLead)) return true;
  const afterFind = lower.match(/\b(?:find|search|lookup|look up)\s+(?:customer\s+)?([a-z]{3,})/i)?.[1];
  if (afterFind && !NAME_STOP_WORDS.has(afterFind)) return true;
  if (/\bcustomer\s+(?:C\d{3,}|[a-z]{3,})/i.test(lower)) {
    const customerTail = lower.match(/\bcustomer\s+([a-z0-9]{3,})/i)?.[1];
    if (customerTail && !NAME_STOP_WORDS.has(customerTail)) return true;
  }
  if (/\bC\d{3,}\b/i.test(text)) return true;
  const tokens = hints?.nameTokens || [];
  return tokens.length > 0;
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

function detectTechnicianExpenseRanking(message) {
  const text = String(message || '').toLowerCase();
  const mentionsTechnician = /\btechnicians?\b|\btechs?\b/.test(text);
  const mentionsExpense = /\bexpenses?\b|\bspend\b|\bspent\b|\bspending\b/.test(text);
  const mentionsRank =
    /\bmost\b|\btop\b|\bhighest\b|\bbiggest\b|\blargest\b|\bwho\b|\bwhich\b|\brank\b/.test(text);
  return mentionsTechnician && mentionsExpense && mentionsRank;
}

/** Travel km / worked-hours questions about technicians in the field. */
function detectTechnicianFieldStats(message) {
  const text = normalizeCrmQueryText(message).toLowerCase();
  const mentionsTravel =
    /\b(?:km|kms|kilomet(?:er|re)s?|drove|drive|driving|travel(?:led|ed)?|distance|mileage|chala|chale)\b/.test(
      text
    );
  const mentionsHours =
    /\b(?:hours? worked|worked hours|how long (?:did|has|have|was)|time (?:on|in) (?:the )?field|on field|who worked (?:the )?most hours?|how (?:long|many hours?) (?:did )?(?:technicians?|techs?|team|guys?) work|field team productivity|productivity (?:of|this|last|for) (?:the )?(?:team|technicians?|month|week|today))\b/.test(
      text
    ) ||
    (/\bhow many hours\b/.test(text) &&
      /\b(?:work|worked|technician|tech|field|today|yesterday|week|month)\b/.test(text));
  return mentionsTravel || mentionsHours;
}

/**
 * Detect an operational ("show me the CRM") intent: what to list and for when.
 * Purely keyword-based; never turns into free-form SQL.
 */
function detectOverviewIntent(message, todayKey = istDateKey()) {
  const text = normalizeCrmQueryText(message).toLowerCase();
  const has = (re) => re.test(text);

  const isFollowUp = has(/\bfollow[\s-]?ups?\b/);

  const scopes = new Set();
  if (
    isFollowUp ||
    has(/\bjobs?\b|\bservices?\b|\bvisits?\b|\bschedule[ds]?\b|\bcomplaints?\b|\bcalls?\b|\btickets?\b|\bservice calls?\b|\bwork orders?\b|\bkaam\b/)
  )
    scopes.add('jobs');
  if (isFollowUp || has(/\breminder|\bdue\b|\btask/)) scopes.add('reminders');
  if (has(/\bpayment|\bpending amount|\boutstanding|\bbalance|\bcollect|\bunpaid|\bnot (?:yet )?paid\b|\bwho (?:has not|hasn't) paid\b|\bhow much (?:is )?(?:due|owed|outstanding)\b|\bpaise\b|\bmilenge\b/) ||
    (has(/\bdues?\b/) && !has(/\breminder|\btask|\bschedule/)))
    scopes.add('payments');
  if (has(/\bamc\b|\bexpir|\brenew/)) scopes.add('amc');
  if (has(/\bexpenses?\b|\bspend\b|\bspent\b|\bspending\b|\bfuel costs?\b|\brent costs?\b|\boutgoing\b|\boverheads?\b|\bsalary\b|\bstaff costs?\b|\bhow much (?:did )?we pay(?: (?:staff|team|technicians?|employees?))?\b|\bkharcha\b/))
    scopes.add('expenses');
  if (
    has(
      /\bnew customers?\b|\brecent customers?\b|\bnew leads?\b|\bhow many customers?\b|\btotal customers?\b|\bcustomer count\b|\bnumber of customers?\b/
  ) || has(/\bcustomers?\s+(?:added|created|joined)\b/)
  )
    scopes.add('customers');
  const wantsCustomerRanking = detectCustomerValueRanking(message);
  const wantsTechnicianRanking = detectTechnicianBillingRanking(message);
  if (
    !wantsCustomerRanking &&
    !wantsTechnicianRanking &&
    has(/\brevenue|\bcollect|\bearn|\bincome|\bturnover|\bsales\b|\bbusiness\b|\bdid we make\b|\bhow much (?:money|cash) (?:came in|received|got)\b|\btotal invoiced\b|\bbilled so far\b|\binvoiced\b|\bmoney came in\b|\bcash (?:in|received)\b|\bkamai\b/)
  )
    scopes.add('revenue');
  if (wantsCustomerRanking) scopes.add('customer_value_ranking');
  if (wantsTechnicianRanking) scopes.add('technician_billing_ranking');
  if (detectTechnicianFieldStats(message)) scopes.add('technician_field_stats');
  if (has(/\bsummary|\boverview|\bstatus report\b|\bdaily report\b|\bfull report\b|\bmetrics?\b|\bstats\b|\bstatistics\b|\bdata\b/))
    scopes.add('summary');
  if (has(/\bhow many\b|\bcount\b|\bnumber of\b|\btotal\b/) && !scopes.size) scopes.add('jobs');
  if (
    has(
      /\bwhat(?:'s| is) (?:going on|happening)\b|\bright now\b|\bat the moment\b|\blive status\b|\bfield status\b|\boperations snapshot\b|\bfloor status\b|\banyone waiting\b|\bwho(?:'s| is) waiting\b|\bwaiting (?:for|jobs?|customers?)\b|\bwhere are (?:the )?technicians?\b|\btechnicians? (?:locations?|whereabouts)\b|\bunassigned jobs?\b|\bjobs? waiting\b|\bwhat are (?:the )?techs?\b|\bwhat are technicians\b/
    ) ||
    // Hindi live-ops phrases — check original message too (before normalization)
    has(/\bkya hua\b|\bkya ho raha\b|\bfield mein\b|\baaj field\b|\bkya chal raha\b/) ||
    /\bkya hua\b|\bkya ho raha\b|\bfield mein\b|\baaj field\b|\bkya chal raha\b/i.test(String(message || '').toLowerCase())
  )
    scopes.add('live_ops');

  // The last status word wins so a correction ("completed today — I meant
  // ongoing") overrides the status it is correcting.
  const statusPatterns = [
    { statuses: ['FOLLOW_UP'], pattern: /\bfollow[\s-]?ups?\b/g },
    { statuses: ['COMPLETED'], pattern: /\bcompleted?\b|\bdone\b|\bfinished\b|\bclosed\b/g },
    { statuses: ['CANCELLED'], pattern: /\bcancell?ed\b/g },
    { statuses: ['ASSIGNED'], pattern: /\bassigned\b/g },
    { statuses: ['EN_ROUTE'], pattern: /\ben[\s-]?route\b/g },
    { statuses: ['IN_PROGRESS'], pattern: /\bin[\s-]?progress\b/g },
    { statuses: ['PENDING'], pattern: /\bunassigned\b|\bpending\b/g },
    {
      statuses: ONGOING_JOB_STATUSES,
      pattern:
        /\bopen\b|\bon[\s-]?going\b|\bincomplete\b|\bactive\b|\bremaining\b|\bleft\b|\bnot (?:yet )?(?:completed|done)\b|\byet to\b/g,
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

  const dateCandidates = [];
  const addDateCandidate = (pattern, resolve) => {
    for (const match of text.matchAll(pattern)) dateCandidates.push({ index: match.index, resolve: () => resolve(match) });
  };
  addDateCandidate(
    /\ball[\s-]?time\b|\blife[\s-]?time\b|\bever\b|\boverall\b|\bin total\b|\bentire\b|\bso far\b|\bhistor(?:y|ical)\b|\bever since\b|\bfrom the start\b/g,
    () => ({ start: null, end: null, label: 'all time', allTime: true })
  );
  addDateCandidate(/\byesterday\b/g, () => {
    const day = addDaysKey(todayKey, -1);
    return { start: day, end: day, label: 'yesterday' };
  });
  addDateCandidate(/\btom+o?r+o?w\b|\btomm?row\b/g, () => {
    const day = addDaysKey(todayKey, 1);
    return { start: day, end: day, label: 'tomorrow' };
  });
  addDateCandidate(/\blast month\b|\bprevious month\b/g, () => ({
    ...monthBoundsKey(todayKey, -1),
    label: 'last month',
  }));
  addDateCandidate(/\bthis month\b|\bmonth to date\b|(?<!last )(?<!previous )\bmonth\b/g, () => ({
    ...monthBoundsKey(todayKey, 0),
    label: 'this month',
  }));
  addDateCandidate(/\blast week\b|\bpast week\b|\blast 7 days\b|\bpast 7 days\b/g, () => ({
    start: addDaysKey(todayKey, -6),
    end: todayKey,
    label: 'last 7 days',
  }));
  addDateCandidate(
    /\bthis week\b|\bnext week\b|\bcoming week\b|\bnext 7 days\b|(?<!last )(?<!past )\bweek\b/g,
    () => ({
    start: todayKey,
    end: addDaysKey(todayKey, 6),
    label: 'next 7 days',
    })
  );
  addDateCandidate(/\boverdue\b|\bpast due\b|\bmissed\b/g, () => ({
    start: null,
    end: addDaysKey(todayKey, -1),
    label: 'overdue (before today)',
  }));
  // Named month only: "in july", "during march", "in july this year", "last july"
  addDateCandidate(
    /\b(?:in|during|for|of|last\s+in)\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b|\blast\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/gi,
    (match) => {
      const monthNums = {
        jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
        may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9,
        sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
      };
      const raw = (match[1] || match[2] || '').toLowerCase();
      const monthNum = monthNums[raw];
      if (!monthNum) return null;
      // Determine year: "last july" = previous occurrence; "this year" explicit or implied current
      const mentionsLastYear = /\blast year\b/i.test(text);
      const mentionsThisYear = /\bthis year\b/i.test(text);
      const [todayYear, todayMonth] = todayKey.split('-').map(Number);
      let year = todayYear;
      if (mentionsLastYear) {
        year = todayYear - 1;
      } else if (!mentionsThisYear && monthNum > todayMonth) {
        // Named month hasn't arrived yet this year → assume last year
        year = todayYear - 1;
      }
      const mm = String(monthNum).padStart(2, '0');
      const daysInMonth = new Date(year, monthNum, 0).getDate();
      return {
        start: `${year}-${mm}-01`,
        end: `${year}-${mm}-${String(daysInMonth).padStart(2, '0')}`,
        label: `${raw} ${year}`,
      };
    }
  );
  addDateCandidate(/\btoday\b|\bnow\b/g, () => ({ start: todayKey, end: todayKey, label: 'today' }));
  dateCandidates.sort((a, b) => a.index - b.index);
  const relative = dateCandidates.at(-1)?.resolve();
  if (relative) {
    ({ start, end, label } = relative);
    explicitDate = true;
    allTime = Boolean(relative.allTime);
  }

  const rawMessage = normalizeCrmQueryText(message);
  const isoDates = [...rawMessage.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map((match) => match[1]);
  if (isoDates.length >= 2 && /\b(?:from|between)\b[\s\S]*\b(?:to|and)\b/i.test(rawMessage)) {
    [start, end] = isoDates;
    if (start > end) [start, end] = [end, start];
    label = `${start} to ${end}`;
    explicitDate = true;
    allTime = false;
  } else if (isoDates.length === 1) {
    [start] = isoDates;
    end = start;
    label = start;
    explicitDate = true;
    allTime = false;
  }

  const monthNumbers = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9,
    sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
    dec: 12, december: 12,
  };
  const namedDates = [...rawMessage.toLowerCase().matchAll(
    /\b([0-3]?\d)\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(20\d{2})\b/g
  )].map((match) => {
    const month = monthNumbers[match[2]];
    const day = Number(match[1]);
    if (!month || day < 1 || day > 31) return null;
    return `${match[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }).filter(Boolean);
  if (namedDates.length) {
    start = namedDates[0];
    end = namedDates[1] || start;
    if (start > end) [start, end] = [end, start];
    label = start === end ? start : `${start} to ${end}`;
    explicitDate = true;
    allTime = false;
  }

  const yearMatch = rawMessage.match(/\b(20\d{2})\b(?!-)/);
  if (yearMatch && !isoDates.length && !namedDates.length) {
    start = `${yearMatch[1]}-01-01`;
    end = `${yearMatch[1]}-12-31`;
    label = yearMatch[1];
    explicitDate = true;
    allTime = false;
  }

  // "Top billing customer" and "who paid us most" are different questions: one
  // counts everything invoiced, the other only money confirmed as paid.
  const rankingBasis =
    has(/\bbill(?:ed|ing)?\b|\brevenue\b|\bvalue\b|\bturnover\b/) && !has(/\bpaid\b|\bspent\b/)
      ? 'billed'
      : 'paid';
  const revenueBasis = has(
    /\bcollect(?:ed|ion|ions)?\b|\bcash received\b|\bmoney received\b|\bconfirmed paid\b|\bpaid jobs?\b/
  )
    ? 'confirmed_paid'
    : 'billed';

  // Trend and forecast facts cost extra queries and clutter a plain "how much
  // today", so only gather them when the question actually asks.
  const wantsComparison = has(
    /\bcompare|\bcomparison\b|\bversus\b|\bvs\.?\b|\bgrowth\b|\bgrew\b|\btrend|\bbetter\b|\bworse\b|\bup or down\b|\bthan (?:last|previous)\b|\bagainst (?:last|previous)\b/
  );
  const wantsProjection = has(
    /\bproject|\bforecast|\bestimate|\bexpect|\bon track\b|\brun[\s-]?rate\b|\bend (?:of|up)\b|\bwill (?:it|we|this)\b|\bcan be\b|\bcould be\b|\bmight be\b|\blikely\b|\bpace\b/
  );
  if (
    wantsComparison &&
    has(/\blast month\b/) &&
    (has(/\bthis month\b|\bmonth to date\b|\bdoing (?:better|worse)\b/) ||
      /^\s*how does that compare\b/.test(text))
  ) {
    const currentMonth = monthBoundsKey(todayKey, 0);
    start = currentMonth.start;
    end = currentMonth.end;
    label = 'this month';
    explicitDate = true;
    allTime = false;
  }

  return {
    scopes,
    statuses,
    range: { start, end, label },
    explicitDate,
    allTime,
    rankingBasis,
    revenueBasis,
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
    followUpDate: row.follow_up_date || null,
    followUpTime: row.follow_up_time || null,
    followUpNotes: row.follow_up_notes || null,
    followUpScheduledAt: row.follow_up_scheduled_at || null,
    autoMoveToOngoing: Array.isArray(row.requirements)
      ? row.requirements.some((r) => r && r.auto_move_to_ongoing_on_date === true)
      : false,
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
  // Customer codes look like job numbers to the generic identifier parser.
  // Search them before ordinary words such as "documents", otherwise that word
  // suppresses the exact C0006 lookup.
  for (const term of hints.lookupTerms || []) {
    if (/^C\d+$/i.test(term) && !queries.includes(term)) queries.push(term);
  }
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

async function buildTechnicianExpenseRanking(db, rows) {
  const byTech = new Map();
  for (const row of rows || []) {
    const techId = String(row.technician_id || '');
    if (!techId) continue;
    byTech.set(techId, (byTech.get(techId) || 0) + (Number(row.amount) || 0));
  }
  if (!byTech.size) return [];
  const ids = [...byTech.keys()];
  const nameById = new Map();
  const { data: techRows } = await db
    .from('technicians')
    .select('id,full_name')
    .in('id', ids.slice(0, 50));
  for (const row of techRows || []) {
    nameById.set(String(row.id), String(row.full_name || 'Technician').trim());
  }
  return [...byTech.entries()]
    .map(([technicianId, total]) => ({
      technicianId,
      name: nameById.get(technicianId) || 'Technician',
      total: Math.round(total),
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, TOP_TECHNICIAN_LIMIT)
    .map((row, index) => ({ rank: index + 1, ...row }));
}

function sumStoredDayTravelKm(jobs) {
  const sorted = (jobs || [])
    .filter((job) => parseMs(job.start_time))
    .sort((a, b) => parseMs(a.start_time) - parseMs(b.start_time));
  let total = sumStoredTravelKm(sorted);
  const last = sorted[sorted.length - 1];
  const ret = last ? getTravelReturnKm(last) : null;
  if (ret != null && ret > 0) total += ret;
  return total > 0 ? Math.round(total * 10) / 10 : null;
}

function groupJobsByIstDay(jobs) {
  const byDay = new Map();
  for (const job of jobs || []) {
    const start = parseMs(job.start_time);
    const complete = jobCompletionMs(job);
    const anchor = start ?? complete;
    if (!anchor) continue;
    const dayKey = istDateKey(new Date(anchor));
    if (!byDay.has(dayKey)) byDay.set(dayKey, []);
    byDay.get(dayKey).push(job);
  }
  return byDay;
}

function computeTechFieldStatsRow(jobs, nowMs, todayKey) {
  const byDay = groupJobsByIstDay(jobs);
  let totalDurationMs = 0;
  let totalKm = 0;
  let kmKnown = false;
  let live = false;
  let daysWorked = 0;

  for (const [dayKey, dayJobs] of byDay.entries()) {
    const isToday = dayKey === todayKey;
    const dayEndMs = isToday
      ? nowMs
      : Date.parse(`${dayKey}T23:59:59.999+05:30`);
    const summary = computeTechWorkedHours(dayJobs, isToday ? nowMs : dayEndMs);
    if (summary.durationMs != null && summary.durationMs > 0) {
      totalDurationMs += summary.durationMs;
      daysWorked += 1;
    }
    if (summary.live) live = true;
    const dayKm = sumStoredDayTravelKm(dayJobs);
    if (dayKm != null) {
      totalKm += dayKm;
      kmKnown = true;
    }
  }

  const jobsStarted = (jobs || []).filter((job) => parseMs(job.start_time)).length;
  const jobsCompleted = (jobs || []).filter((job) => jobCompletionMs(job)).length;
  return {
    durationMs: totalDurationMs > 0 ? totalDurationMs : null,
    durationLabel: totalDurationMs > 0 ? formatWorkedDuration(totalDurationMs) : null,
    travelKm: kmKnown ? Math.round(totalKm * 10) / 10 : null,
    travelLabel: kmKnown ? formatTravelKm(totalKm) : null,
    daysWorked,
    jobsStarted,
    jobsCompleted,
    live,
  };
}

async function loadTechnicianFieldStats(db, intent, todayKey) {
  const bounds = intentBounds(intent, todayKey);
  const filterIds = (intent.technicianMatches || []).map((row) => row.id);
  const buildStarted = () => {
    let query = db
      .from('jobs')
      .select(FIELD_STATS_JOB_COLS)
      .not('assigned_technician_id', 'is', null);
    if (bounds.fromTs && bounds.toTs) {
      query = query.gte('start_time', bounds.fromTs).lt('start_time', bounds.toTs);
    }
    if (filterIds.length) query = query.in('assigned_technician_id', filterIds);
    return query.limit(FIELD_STATS_JOB_SCAN);
  };
  const buildCompleted = () => {
    let query = db
      .from('jobs')
      .select(FIELD_STATS_JOB_COLS)
      .not('assigned_technician_id', 'is', null);
    if (bounds.fromTs && bounds.toTs) {
      query = query.or(
        `and(completed_at.gte.${bounds.fromTs},completed_at.lt.${bounds.toTs}),and(end_time.gte.${bounds.fromTs},end_time.lt.${bounds.toTs})`
      );
    }
    if (filterIds.length) query = query.in('assigned_technician_id', filterIds);
    return query.limit(FIELD_STATS_JOB_SCAN);
  };

  const [{ data: started, error: startErr }, { data: completed, error: doneErr }] =
    await Promise.all([buildStarted(), buildCompleted()]);
  if (startErr || doneErr) {
    console.warn(
      '[ai-crm-lookup] technician field stats jobs failed',
      startErr?.message || doneErr?.message
    );
    return { technicians: [], stats: {}, truncated: {} };
  }

  const byJobId = new Map();
  for (const row of [...(started || []), ...(completed || [])]) {
    if (row?.id) byJobId.set(row.id, row);
  }
  const byTech = new Map();
  for (const job of byJobId.values()) {
    const techId = String(job.assigned_technician_id || '');
    if (!techId) continue;
    if (!byTech.has(techId)) byTech.set(techId, []);
    byTech.get(techId).push(job);
  }

  const nowMs = Date.now();
  const nameById = new Map((intent.technicianMatches || []).map((row) => [row.id, row.name]));
  const missingIds = [...byTech.keys()].filter((id) => !nameById.has(id));
  if (missingIds.length) {
    const { data: techRows } = await db
      .from('technicians')
      .select('id,full_name,employee_id')
      .in('id', missingIds.slice(0, 20));
    for (const row of techRows || []) {
      nameById.set(String(row.id), String(row.full_name || 'Technician').trim());
    }
  }

  const rows = [];
  for (const [techId, jobs] of byTech.entries()) {
    const computed = computeTechFieldStatsRow(jobs, nowMs, todayKey);
    if (!computed.durationMs && computed.travelKm == null && computed.jobsStarted === 0) continue;
    rows.push({
      technicianId: techId,
      employeeId: null,
      name: nameById.get(techId) || 'Technician',
      ...computed,
    });
  }

  const preferKm = /\b(?:km|kms|kilomet|drove|drive|travel|mileage|distance)\b/i.test(
    String(intent.lookupMessage || '')
  );
  rows.sort((a, b) => {
    const primaryA = preferKm ? a.travelKm ?? -1 : a.durationMs ?? -1;
    const primaryB = preferKm ? b.travelKm ?? -1 : b.durationMs ?? -1;
    if (primaryB !== primaryA) return primaryB - primaryA;
    return String(a.name).localeCompare(String(b.name));
  });

  return {
    technicians: rows.slice(0, TOP_TECHNICIAN_LIMIT).map((row, index) => ({
      id: row.technicianId,
      name: row.name,
      employeeId: row.employeeId,
      rank: index + 1,
    })),
    stats: {
      technicianFieldStats: rows.slice(0, TOP_TECHNICIAN_LIMIT).map((row, index) => ({
        rank: index + 1,
        technicianId: row.technicianId,
        name: row.name,
        durationLabel: row.durationLabel,
        durationMs: row.durationMs,
        travelKm: row.travelKm,
        travelLabel: row.travelLabel,
        daysWorked: row.daysWorked,
        jobsStarted: row.jobsStarted,
        jobsCompleted: row.jobsCompleted,
        live: row.live,
      })),
      technicianFieldStatsPeriod: intent.allTime ? 'all time' : intent.range?.label || 'today',
      technicianFieldStatsFilteredBy: intent.technicianMatches?.length
        ? intent.technicianMatches.map((row) => row.name)
        : null,
    },
    truncated: {
      technicianFieldStats: byJobId.size >= FIELD_STATS_JOB_SCAN,
    },
  };
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

function locationAgeMinutes(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round(ms / 60000);
}

/** Right-now field snapshot: open jobs, waiting unassigned, technician GPS. */
async function loadLiveOperationsSnapshot(db, todayKey) {
  const out = {
    jobs: [],
    customers: [],
    technicians: [],
    stats: {},
    truncated: {},
  };
  const bounds = istDayBounds(todayKey, todayKey);

  const [ongoingRes, followUpCount, completedToday, activeTechRes, locRes] = await Promise.all([
    db
      .from('jobs')
      .select(JOB_COLS)
      .in('status', ONGOING_JOB_STATUSES)
      .order('scheduled_date', { ascending: true })
      .limit(LIVE_OPS_JOB_LIMIT + 1),
    countRows(
      db.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'FOLLOW_UP')
    ),
    countRows(
      db
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'COMPLETED')
        .gte('completed_at', bounds.fromTs)
        .lt('completed_at', bounds.toTs)
    ),
    db
      .from('technicians')
      .select('id,full_name,employee_id,account_status')
      .eq('account_status', 'ACTIVE')
      .limit(40),
    db
      .from('technician_live_locations')
      .select('technician_id,latitude,longitude,updated_at,fix_time,is_tracking')
      .limit(40),
  ]);

  if (ongoingRes.error) {
    console.warn('[ai-crm-lookup] live ops jobs failed', ongoingRes.error.message);
  }
  const ongoingRows = ongoingRes.data || [];
  out.truncated.liveOps = ongoingRows.length > LIVE_OPS_JOB_LIMIT;
  const jobs = ongoingRows.slice(0, LIVE_OPS_JOB_LIMIT).map(slimJob).filter(Boolean);
  out.jobs.push(...jobs);

  const customerIds = [...new Set(jobs.map((j) => j.customerId).filter(Boolean))];
  out.customers.push(...(await loadCustomersByIds(db, customerIds)));

  const nameByCustomerId = new Map(out.customers.map((c) => [c.id, c.name]));
  const techNameById = await loadTechnicianNames(
    db,
    [
      ...jobs.map((j) => j.assignedTechnicianId).filter(Boolean),
      ...(activeTechRes.data || []).map((t) => t.id),
      ...(locRes.data || []).map((l) => l.technician_id),
    ],
    []
  );

  const byStatus = {};
  for (const status of ONGOING_JOB_STATUSES) byStatus[status] = 0;
  let unassignedWaiting = 0;
  const busyTechIds = new Set();
  const techniciansOnField = [];

  for (const job of jobs) {
    const status = String(job.status || '').toUpperCase();
    if (byStatus[status] != null) byStatus[status] += 1;
    const techId = job.assignedTechnicianId ? String(job.assignedTechnicianId) : '';
    if (status === 'PENDING' && !techId) unassignedWaiting += 1;
    if (techId) busyTechIds.add(techId);
    techniciansOnField.push({
      technicianName: techId ? techNameById[techId] || 'Technician' : 'Unassigned',
      status,
      jobNumber: job.jobNumber || '—',
      customerName: nameByCustomerId.get(job.customerId) || '—',
      scheduledDate: job.scheduledDate || '—',
    });
  }

  const activeTechs = (activeTechRes.data || []).map((row) => ({
    technicianId: String(row.id),
    name: String(row.full_name || 'Technician').trim(),
    employeeId: row.employee_id ? String(row.employee_id) : null,
  }));
  out.technicians.push(
    ...activeTechs.map((tech) => ({
      technicianId: tech.technicianId,
      name: tech.name,
      employeeId: tech.employeeId,
      billedTotal: null,
      completedJobs: null,
    }))
  );

  const techniciansIdle = activeTechs
    .filter((tech) => !busyTechIds.has(tech.technicianId))
    .map((tech) => tech.name);

  const technicianLocations = (locRes.data || [])
    .map((row) => {
      const technicianId = String(row.technician_id || '');
      const updatedAt = row.fix_time || row.updated_at || null;
      const ageMinutes = locationAgeMinutes(updatedAt);
      const hasCoords =
        Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude));
      return {
        technicianName: techNameById[technicianId] || 'Technician',
        latitude: hasCoords ? Number(row.latitude) : null,
        longitude: hasCoords ? Number(row.longitude) : null,
        ageMinutes,
        stale:
          ageMinutes == null ||
          ageMinutes > LIVE_OPS_LOCATION_STALE_MINUTES ||
          row.is_tracking === false,
        isTracking: row.is_tracking !== false,
      };
    })
    .filter((row) => row.latitude != null && row.longitude != null);

  out.stats.liveOps = {
    snapshotLabel: 'right now',
    ongoingTotal: jobs.length,
    unassignedWaiting,
    followUpTotal: followUpCount ?? 0,
    completedToday: completedToday ?? 0,
    byStatus,
    techniciansOnField,
    techniciansIdle,
    technicianLocations,
    fieldIsClear: jobs.length === 0,
  };
  return out;
}

function formatJobStatusLabel(status) {
  const key = String(status || '').toUpperCase();
  const labels = {
    PENDING: 'Pending',
    ASSIGNED: 'Assigned',
    EN_ROUTE: 'En route',
    IN_PROGRESS: 'In progress',
  };
  return (
    labels[key] ||
    key
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/^\w/, (c) => c.toUpperCase())
  );
}

/** Structured multi-section text for live ops (not one paragraph). */
function formatLiveOpsAnswer(liveOps) {
  if (!liveOps) return 'No live operations data available.';

  const lines = [];
  lines.push('Field snapshot');
  lines.push('');

  if (liveOps.fieldIsClear) {
    lines.push('No open jobs right now.');
  } else {
    lines.push(`Open jobs · ${liveOps.ongoingTotal}`);
    const bs = liveOps.byStatus || {};
    const pendingUnassigned = liveOps.unassignedWaiting ?? 0;
    const pendingTotal = bs.PENDING ?? 0;
    if (pendingTotal > 0) {
      lines.push(`  Pending (unassigned) · ${pendingUnassigned}`);
      const pendingAssigned = pendingTotal - pendingUnassigned;
      if (pendingAssigned > 0) lines.push(`  Pending (assigned) · ${pendingAssigned}`);
    }
    if (bs.ASSIGNED) lines.push(`  Assigned · ${bs.ASSIGNED}`);
    if (bs.EN_ROUTE) lines.push(`  En route · ${bs.EN_ROUTE}`);
    if (bs.IN_PROGRESS) lines.push(`  In progress · ${bs.IN_PROGRESS}`);
  }

  lines.push(`Completed today · ${liveOps.completedToday ?? 0}`);
  lines.push(`Follow-ups open · ${liveOps.followUpTotal ?? 0}`);
  lines.push('');

  const waiting = (liveOps.techniciansOnField || []).filter(
    (r) => String(r.status).toUpperCase() === 'PENDING' && r.technicianName === 'Unassigned'
  );
  const onField = (liveOps.techniciansOnField || []).filter(
    (r) => !(String(r.status).toUpperCase() === 'PENDING' && r.technicianName === 'Unassigned')
  );

  if (onField.length) {
    lines.push('On the field');
    for (const row of onField) {
      lines.push(
        `  · ${row.technicianName} · ${formatJobStatusLabel(row.status)} · ${row.jobNumber} · ${row.customerName}`
      );
    }
    lines.push('');
  }

  if (liveOps.techniciansIdle?.length) {
    lines.push('Idle');
    for (const name of liveOps.techniciansIdle) {
      lines.push(`  · ${name}`);
    }
    lines.push('');
  }

  if (waiting.length) {
    lines.push('Waiting assignment');
    for (const row of waiting) {
      lines.push(`  · ${row.jobNumber} · ${row.customerName}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

/** Structured stats answer for read-only CRM tools (skip LLM when counts exist). */
function formatInr(amount) {
  return `INR ${Math.round(Number(amount) || 0).toLocaleString('en-IN')}`;
}

function formatStatsSection(title, rows) {
  const body = (rows || []).filter(Boolean);
  if (!body.length) return '';
  return [title, ...body.map((line) => (line.startsWith('  ') ? line : `  ${line}`))].join('\n');
}

function formatStatsAnswerForTools(pack, tools) {
  const selected = Array.isArray(tools) ? tools : [];
  const stats = pack?.stats || {};
  const period = stats.rangeLabel || stats.expenses?.period || stats.today || 'the requested period';
  const sections = [];

  if (selected.includes('jobs_overview')) {
    const rows = [];
    if (stats.jobsCompletedInRange != null) rows.push(`Completed · ${stats.jobsCompletedInRange}`);
    if (stats.jobsScheduledInRange != null) rows.push(`Scheduled · ${stats.jobsScheduledInRange}`);
    if (stats.openJobsTotal != null) {
      rows.push(`Open · ${stats.openJobsTotal}`);
      if (stats.openJobsStatuses?.length) rows.push(`Statuses · ${stats.openJobsStatuses.join(', ')}`);
    }
    if (stats.followUpJobsTotal != null) rows.push(`Follow-ups · ${stats.followUpJobsTotal}`);
    if (stats.jobsCompletedByTechnicianInRange != null) {
      rows.push(`Completed · ${stats.jobsCompletedByTechnicianInRange}`);
      if (stats.jobsFilteredByTechnician?.length) {
        rows.push(`Technician · ${stats.jobsFilteredByTechnician.join(', ')}`);
      }
    }
    const section = formatStatsSection(`Jobs · ${period}`, rows);
    if (section) sections.push(section);
  }

  if (selected.includes('payments') && stats.pendingPaymentsListed != null) {
    const rows = [`Count · ${stats.pendingPaymentsListed}`];
    if (stats.pendingPaymentsListedTotal != null) {
      rows.push(`Total due · ${formatInr(stats.pendingPaymentsListedTotal)}`);
    }
    if (stats.pendingPaymentsAlreadyDue != null) rows.push(`Overdue · ${stats.pendingPaymentsAlreadyDue}`);
    sections.push(formatStatsSection('Pending payments', rows));
  }

  if (selected.includes('reminders') && stats.remindersListed != null) {
    sections.push(
      formatStatsSection(`Reminders · ${stats.remindersScope || period}`, [
        `Count · ${stats.remindersListed}`,
      ])
    );
  }

  if (selected.includes('customer_directory')) {
    const rows = [];
    if (stats.customersTotal != null) rows.push(`Total · ${stats.customersTotal}`);
    if (stats.customersAddedInRange != null) rows.push(`Added in period · ${stats.customersAddedInRange}`);
    const section = formatStatsSection(`Customers · ${period}`, rows);
    if (section) sections.push(section);
  }

  if (selected.includes('revenue') && stats.completedJobValueInRange != null) {
    const rows = [`Amount · ${formatInr(stats.completedJobValueInRange)}`];
    const proj = stats.completedJobValueProjection;
    if (proj?.projectedPeriodTotal != null) {
      rows.push(`Projected month-end · ${formatInr(proj.projectedPeriodTotal)} (estimate)`);
      if (proj.elapsedDays && proj.periodDays) {
        rows.push(`Pace · ${proj.elapsedDays} of ${proj.periodDays} days`);
      }
    }
    const prev = stats.completedJobValuePrevious;
    if (prev?.value != null) {
      const change =
        prev.changePct != null ? ` (${prev.changePct > 0 ? '+' : ''}${prev.changePct}%)` : '';
      rows.push(`Previous period · ${formatInr(prev.value)}${change}`);
    }
    sections.push(formatStatsSection(`Revenue · ${period}`, rows));
  }

  if (selected.includes('expenses') && stats.expenses) {
    const exp = stats.expenses;
    const expPeriod = exp.period || period;
    const rows = [];
    if (stats.technicianExpenseRanking?.length) {
      for (const row of stats.technicianExpenseRanking.slice(0, 6)) {
        rows.push(`${row.rank}. ${row.name} · ${formatInr(row.total)}`);
      }
      if (exp.technician?.total != null) {
        rows.push(`Technician total · ${formatInr(exp.technician.total)}`);
      }
    } else {
      rows.push(`Total · ${formatInr(exp.combinedTotal ?? 0)}`);
      if (exp.business?.total != null) rows.push(`Business · ${formatInr(exp.business.total)}`);
      if (exp.technician?.total != null) rows.push(`Technician · ${formatInr(exp.technician.total)}`);
      if (exp.incomplete) rows.push('Note · one expense source could not be loaded');
      const topCats = [
        ...(exp.business?.byCategory || [])
          .slice(0, 3)
          .map((c) => `Business · ${c.category} · ${formatInr(c.amount)}`),
        ...(exp.technician?.byCategory || [])
          .slice(0, 3)
          .map((c) => `Technician · ${c.category} · ${formatInr(c.amount)}`),
      ];
      if (topCats.length) {
        rows.push('Top categories');
        for (const line of topCats) rows.push(`  · ${line}`);
      }
    }
    const title = stats.technicianExpenseRanking?.length
      ? `Technician expenses · ${expPeriod}`
      : `Expenses · ${expPeriod}`;
    const section = formatStatsSection(title, rows);
    if (section) sections.push(section);
  }

  if (selected.includes('amc') && stats.amcExpiryWindow) {
    const rows = [`Window · ${stats.amcExpiryWindow}`];
    if (pack.documents?.length) {
      rows.push('Contracts');
      for (const doc of pack.documents.slice(0, 6)) {
        rows.push(`  · ${doc.customerName || '—'} · ends ${doc.endDate || doc.expiryDate || '—'}`);
      }
    }
    sections.push(formatStatsSection('AMC', rows));
  }

  if (selected.includes('customer_value_ranking') && stats.customerValueRanking?.length) {
    const rows = stats.customerValueRanking.slice(0, 5).map(
      (row) =>
        `${row.rank}. ${row.name} · ${formatInr(row.confirmedPaidTotal ?? row.billedTotal ?? 0)}`
    );
    sections.push(
      formatStatsSection(`Top customers · ${stats.customerValueRankingPeriod || period}`, rows)
    );
  }

  if (selected.includes('technician_billing_ranking')) {
    const rows = stats.technicianBillingRanking?.length
      ? stats.technicianBillingRanking.slice(0, 5).map(
          (row) =>
            `${row.rank}. ${row.name} · ${formatInr(row.billedTotal || 0)} · ${row.completedJobs} jobs`
        )
      : ['No completed jobs for a technician in this period.'];
    sections.push(formatStatsSection(`Technician billing · ${stats.technicianBillingPeriod || period}`, rows));
  }

  if (selected.includes('technician_field_stats')) {
    const rows = [];
    if (stats.technicianFieldStatsFilteredBy?.length) {
      rows.push(`Technician · ${stats.technicianFieldStatsFilteredBy.join(', ')}`);
    }
    if (stats.technicianFieldStats?.length) {
      for (const row of stats.technicianFieldStats.slice(0, 6)) {
        const parts = [row.name];
        if (row.durationLabel) {
          parts.push(`${row.durationLabel} worked${row.live ? ' (live)' : ''}`);
        }
        if (row.travelLabel) parts.push(`${row.travelLabel} travel`);
        else if (row.travelKm == null && row.jobsStarted > 0) parts.push('km not stored yet');
        if (row.jobsCompleted > 0) parts.push(`${row.jobsCompleted} jobs done`);
        rows.push(`· ${parts.join(' · ')}`);
      }
    } else {
      rows.push('No field work in this period.');
    }
    sections.push(
      formatStatsSection(`Field stats · ${stats.technicianFieldStatsPeriod || period}`, rows)
    );
  }

  if (selected.includes('customer_search')) {
    if (pack.customers?.length) {
      const rows = pack.customers.slice(0, 6).map(
        (customer) =>
          `· ${customer.name || '—'} · ${customer.customerCode || '—'} · ${customer.phone || '—'}`
      );
      sections.push(formatStatsSection('Customers', rows));

      // When a specific customer is found, show their jobs including follow-up details
      if (pack.jobs?.length) {
        const jobRows = pack.jobs.slice(0, 8).map((job) => {
          let line = `· ${job.jobNumber || '—'} · ${String(job.status || '—').replace(/_/g, ' ')} · ${job.scheduledDate || '—'}`;
          if (job.followUpDate) {
            line += ` · Follow-up: ${job.followUpDate}`;
            if (job.followUpTime) line += ` ${job.followUpTime}`;
            if (job.followUpNotes) line += ` (${job.followUpNotes})`;
            line += job.autoMoveToOngoing ? ' · auto-move ON' : ' · auto-move OFF';
            if (job.followUpScheduledAt) {
              const d = new Date(job.followUpScheduledAt);
              if (!isNaN(d)) line += ` · scheduled ${d.toISOString().slice(0, 10)}`;
            }
          }
          return line;
        });
        sections.push(formatStatsSection('Jobs', jobRows));
      }
    } else if (!selected.includes('customer_value_ranking')) {
      sections.push('Customers\n  No matches found.');
    }
  }

  if (selected.includes('job_search') || (selected.includes('jobs_overview') && pack.jobs?.length)) {
    if (pack.jobs?.length) {
      const rows = pack.jobs.slice(0, 6).map((job) => {
        let line = `· ${job.jobNumber || '—'} · ${String(job.status || '—').replace(/_/g, ' ')} · ${job.scheduledDate || '—'}`;
        if (job.followUpDate) {
          line += ` · Follow-up: ${job.followUpDate}`;
          if (job.followUpTime) line += ` ${job.followUpTime}`;
          if (job.followUpNotes) line += ` (${job.followUpNotes})`;
          line += job.autoMoveToOngoing ? ' · auto-move ON' : ' · auto-move OFF';
        }
        return line;
      });
      sections.push(formatStatsSection('Jobs', rows));
    } else if (selected.includes('job_search')) {
      sections.push('Jobs\n  No matches found.');
    }
  }

  if (selected.includes('documents')) {
    const rows = [];
    if (stats.documentsListed != null) rows.push(`Count · ${stats.documentsListed}`);
    if (pack.documents?.length) {
      rows.push('Recent');
      for (const doc of pack.documents.slice(0, 6)) {
        rows.push(
          `  · ${doc.documentType || doc.kind || 'document'} · ${doc.customerName || '—'} · ${doc.reference || doc.jobNumber || '—'}`
        );
      }
    } else if (!rows.length) {
      rows.push('No documents found.');
    }
    if (rows.length) sections.push(formatStatsSection('Documents', rows));
  }

  // Nearby / location-based customer results
  if (selected.includes('location_search') && stats.nearbySearch) {
    const ns = stats.nearbySearch;
    if (ns.customers?.length) {
      const rows = ns.customers.map(
        (c) =>
          `· ${c.name || '—'} · ${c.customerCode || '—'} · ${c.phone || '—'}` +
          (c.distanceKm ? ` · ${c.distanceKm} km away` : '')
      );
      sections.push(
        formatStatsSection(
          `Customers nearby (within ${ns.radiusKm} km · ${ns.lat.toFixed(4)}, ${ns.lng.toFixed(4)})`,
          rows
        )
      );
    } else {
      sections.push(`Customers nearby\n  No customers found within ${ns.radiusKm || 5} km of that location.`);
    }
  }

  // SQL query results (set by ai-crm-chat.js after running the query)
  if (selected.includes('sql_query') && stats.sqlQueryResult != null) {
    const { rows, query, label, error } = stats.sqlQueryResult;
    if (error) {
      sections.push(`Analytics\n  Could not run query: ${error}`);
    } else if (rows?.length) {
      sections.push(formatSqlRows(rows, label || 'Analytics result'));
    } else {
      sections.push(`Analytics\n  No results for: ${label || query || 'query'}`);
    }
  }

  if (!sections.length) return null;
  return sections.join('\n\n').trim();
}

/** Slim live-ops payload for CRM AI chat UI cards. */
function publicLiveOpsSnapshot(liveOps, truncated) {
  if (!liveOps) return null;
  const waitingJobs = (liveOps.techniciansOnField || [])
    .filter(
      (r) => String(r.status).toUpperCase() === 'PENDING' && r.technicianName === 'Unassigned'
    )
    .map((r) => ({ jobNumber: r.jobNumber, customerName: r.customerName }));
  const onField = (liveOps.techniciansOnField || [])
    .filter(
      (r) => !(String(r.status).toUpperCase() === 'PENDING' && r.technicianName === 'Unassigned')
    )
    .map((r) => ({
      technicianName: r.technicianName,
      status: formatJobStatusLabel(r.status),
      jobNumber: r.jobNumber,
      customerName: r.customerName,
    }));
  const locs = liveOps.technicianLocations || [];
  const gpsStale = locs.length === 0 || locs.some((l) => l.stale);

  return {
    ongoingTotal: liveOps.ongoingTotal,
    unassignedWaiting: liveOps.unassignedWaiting,
    followUpTotal: liveOps.followUpTotal,
    completedToday: liveOps.completedToday,
    byStatus: {
      pending: liveOps.byStatus?.PENDING ?? 0,
      assigned: liveOps.byStatus?.ASSIGNED ?? 0,
      enRoute: liveOps.byStatus?.EN_ROUTE ?? 0,
      inProgress: liveOps.byStatus?.IN_PROGRESS ?? 0,
    },
    techniciansIdle: liveOps.techniciansIdle || [],
    onField,
    waitingJobs,
    gpsStale,
    gpsTracked: locs.length,
    fieldIsClear: liveOps.fieldIsClear,
    truncated: truncated?.liveOps === true,
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
  const wantsExpenses = scopes.has('expenses');
  const wantsDocuments = scopes.has('documents') && !intent.skipGlobalDocuments;
  const wantsTechnicianFieldStats = scopes.has('technician_field_stats');
  const wantsLiveOps = scopes.has('live_ops');
  const wantsLocationSearch = scopes.has('location_search');
  const wantsSqlQuery = scopes.has('sql_query');

  if (wantsTechnicianFieldStats) {
    const field = await loadTechnicianFieldStats(db, intent, todayKey);
    out.technicians.push(...field.technicians);
    out.stats = { ...out.stats, ...field.stats };
    out.truncated = { ...out.truncated, ...field.truncated };
  }

  if (wantsLiveOps) {
    const snap = await loadLiveOperationsSnapshot(db, todayKey);
    out.jobs.push(...snap.jobs);
    out.customers.push(...snap.customers);
    out.technicians.push(...snap.technicians);
    out.stats = { ...out.stats, ...snap.stats };
    out.truncated = { ...out.truncated, ...snap.truncated };
  }

  // Location-based customer search
  if (wantsLocationSearch) {
    const loc = extractLocationFromMessage(intent.lookupMessage || '');
    if (loc) {
      const nearby = await findNearbyCustomers(db, loc.lat, loc.lng, loc.radiusKm);
      for (const c of nearby) {
        if (!out.customers.find((x) => x.id === c.id)) out.customers.push(c);
      }
      // Always set nearbySearch so formatStatsAnswerForTools can render a result
      out.stats.nearbySearch = {
        lat: loc.lat,
        lng: loc.lng,
        radiusKm: loc.radiusKm,
        count: nearby.length,
        customers: nearby,
      };
    } else {
      // Message had location_search tool but no parseable coords — show empty state
      out.stats.nearbySearch = { lat: 0, lng: 0, radiusKm: 5, count: 0, customers: [] };
    }
  }

  // Universal read-only SQL query (fallback for unanswered analytics questions)
  if (wantsSqlQuery && out.stats.sqlQueryResult === undefined) {
    // SQL is generated by the AI model in ai-crm-chat.js before calling lookup;
    // here we just store the schema so the chat function can use it.
    out.stats.sqlQueryAvailable = true;
    out.stats.sqlSchema = AI_READONLY_SCHEMA;
  }

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
    if (range.start && (!wantsPayments || intent.explicitDate)) q = q.gte('reminder_at', range.start);
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
        ? range.start
          ? `due from ${range.start} through ${range.end || range.start}`
          : `due on or before ${range.end || todayKey}`
        : 'every outstanding payment reminder, whatever its due date';
      if (!intent.explicitDate) {
        out.stats.pendingPaymentsAlreadyDue = dueNowCount;
        out.stats.pendingPaymentsAlreadyDueTotal = Math.round(dueNowTotal);
      }
      out.truncated.payments = paymentCount > out.payments.length;
    }
    if (wantsReminders) {
      out.stats.remindersListed = out.reminders.length;
      out.stats.remindersScope = range.label;
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

  if (wantsDocuments) {
    let invoiceQuery = db
      .from('tax_invoices')
      .select(TAX_COLS)
      .order('invoice_date', { ascending: false })
      .limit(DOCUMENT_LIMIT);
    if (intent.explicitDate && range.start) invoiceQuery = invoiceQuery.gte('invoice_date', range.start);
    if (intent.explicitDate && range.end) invoiceQuery = invoiceQuery.lte('invoice_date', range.end);

    let authenticityQuery = db
      .from('document_pdf_authenticity')
      .select(AUTH_COLS)
      .order('created_at', { ascending: false })
      .limit(DOCUMENT_LIMIT);
    if (intent.explicitDate && range.start) {
      authenticityQuery = authenticityQuery.gte('created_at', `${range.start}T00:00:00`);
    }
    if (intent.explicitDate && range.end) {
      authenticityQuery = authenticityQuery.lt(
        'created_at',
        `${addDaysKey(range.end, 1)}T00:00:00`
      );
    }

    const [invoiceResult, authenticityResult] = await Promise.all([
      invoiceQuery,
      authenticityQuery,
    ]);
    if (invoiceResult.error) {
      console.warn('[ai-crm-lookup] global tax invoices failed', invoiceResult.error.message);
    }
    if (authenticityResult.error) {
      console.warn('[ai-crm-lookup] global authenticity failed', authenticityResult.error.message);
    }
    for (const row of invoiceResult.data || []) {
      out.documents.push({
        kind: 'tax_invoice',
        id: String(row.id),
        customerId: row.customer_id ? String(row.customer_id) : null,
        label: row.invoice_number ? `Invoice ${row.invoice_number}` : 'Tax invoice',
        invoiceDate: row.invoice_date || null,
        grandTotal: Number(row.total_amount) || null,
        status: null,
      });
    }
    for (const row of authenticityResult.data || []) {
      out.documents.push({
        kind: 'pdf_authenticity',
        id: String(row.id),
        customerId: row.customer_id ? String(row.customer_id) : null,
        label: `${row.doc_type || 'document'} · code ${row.verify_code || '—'}`,
        documentType: row.doc_type || null,
        verifyCode: row.verify_code || null,
        createdAt: row.created_at || null,
      });
    }
    out.stats.documentsListed = out.documents.length;
    out.stats.documentsScope = intent.explicitDate ? range.label : 'latest stored documents';
    out.stats.documentsCoverage =
      'stored tax invoices and generated-PDF authenticity records; quotations, bills, AMC and warranty appear when fingerprinted';
    out.truncated.documents =
      (invoiceResult.data || []).length >= DOCUMENT_LIMIT ||
      (authenticityResult.data || []).length >= DOCUMENT_LIMIT;
  }

  if (wantsExpenses) {
    const loadExpenseRows = async (table) => {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const cols =
          table === 'technician_expenses'
            ? 'id, amount, description, expense_date, category, technician_id'
            : 'id, amount, description, expense_date, category';
        let query = db
          .from(table)
          .select(cols)
          .order('expense_date', { ascending: false })
          .limit(EXPENSE_SCAN_LIMIT);
        if (range.start) query = query.gte('expense_date', range.start);
        if (range.end) query = query.lte('expense_date', range.end);
        const { data, error } = await query;
        if (!error) {
          if ((data || []).length >= EXPENSE_SCAN_LIMIT) out.truncated[table] = true;
          return data || [];
        }
        console.warn(`[ai-crm-lookup] ${table} attempt ${attempt} failed`, error.message);
      }
      return null;
    };
    const [businessRows, technicianRows] = await Promise.all([
      loadExpenseRows('business_expenses'),
      loadExpenseRows('technician_expenses'),
    ]);
    const summarize = (rows) => {
      const byCategory = new Map();
      let total = 0;
      for (const row of rows) {
        const amount = Number(row.amount) || 0;
        total += amount;
        const category = String(row.category || 'UNCATEGORIZED').trim() || 'UNCATEGORIZED';
        byCategory.set(category, (byCategory.get(category) || 0) + amount);
      }
      return {
        count: rows.length,
        total: Math.round(total),
        byCategory: [...byCategory.entries()]
          .map(([category, amount]) => ({ category, amount: Math.round(amount) }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 12),
        latest: rows.slice(0, 10).map((row) => ({
          date: row.expense_date,
          category: row.category || 'UNCATEGORIZED',
          description: String(row.description || '').slice(0, 120),
          amount: Math.round(Number(row.amount) || 0),
        })),
      };
    };
    const business = businessRows ? summarize(businessRows) : null;
    const technician = technicianRows ? summarize(technicianRows) : null;
    out.stats.expenses = {
      period: range.label,
      business,
      technician,
      combinedTotal:
        business && technician ? business.total + technician.total : business?.total ?? technician?.total ?? 0,
      incomplete: !business || !technician,
    };
    const lookupMessage = intent.lookupMessage || '';
    if (technicianRows && detectTechnicianExpenseRanking(lookupMessage)) {
      out.stats.technicianExpenseRanking = await buildTechnicianExpenseRanking(db, technicianRows);
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
        (() => {
          let q = db
            .from('jobs')
            .select('id', { count: 'exact', head: true })
            .in('status', Array.isArray(statuses) ? statuses : ONGOING_JOB_STATUSES);
          if (intent.explicitDate && range.start) q = q.gte('scheduled_date', range.start);
          if (intent.explicitDate && range.end) q = q.lte('scheduled_date', range.end);
          return q;
        })()
      );
      out.stats.openJobsStatuses = Array.isArray(statuses) ? statuses : ONGOING_JOB_STATUSES;
    }
    if (wantsFollowUpCount) {
      out.stats.followUpJobsTotal = await countRows(
        (() => {
          let q = db
            .from('jobs')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'FOLLOW_UP');
          if (intent.explicitDate && range.start) q = q.gte('scheduled_date', range.start);
          if (intent.explicitDate && range.end) q = q.lte('scheduled_date', range.end);
          return q;
        })()
      );
    }
  }

  if (scopes.has('revenue') || scopes.has('summary')) {
    const sumCompletedValue = async (fromTs, toTs) => {
      let query = db
        .from('jobs')
        .select('payment_amount, actual_cost, payment_status')
        .eq('status', 'COMPLETED');
      if (fromTs && toTs) query = query.gte('completed_at', fromTs).lt('completed_at', toTs);
      const { data, error } = await query.limit(REVENUE_SCAN_LIMIT);
      if (error) {
        console.warn('[ai-crm-lookup] revenue failed', error.message);
        return null;
      }
      let sum = 0;
      for (const row of data || []) {
        if (intent.revenueBasis === 'confirmed_paid' && row.payment_status !== 'PAID') continue;
        const n = Number(row.payment_amount ?? row.actual_cost);
        if (Number.isFinite(n)) sum += n;
      }
      if ((data || []).length >= REVENUE_SCAN_LIMIT) out.truncated.revenue = true;
      return Math.round(sum);
    };

    const value = await sumCompletedValue(dayBounds.fromTs, dayBounds.toTs);
    if (value != null) out.stats.completedJobValueInRange = value;
    out.stats.completedJobValueBasis =
      intent.revenueBasis === 'confirmed_paid'
        ? 'completed jobs currently marked PAID, grouped by completion date; not a cash-transaction ledger'
        : 'billed value of completed jobs, including unpaid or partially paid jobs';

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
    expenses: 'expenses',
    customer_value_ranking: 'customer_value_ranking',
    technician_billing_ranking: 'technician_billing_ranking',
    technician_field_stats: 'technician_field_stats',
    documents: 'documents',
    live_ops: 'live_ops',
    location_search: 'location_search',
    sql_query: 'sql_query',
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
  const wantsAggregate = [...plannedScopes].some((scope) =>
    ['revenue', 'expenses', 'payments', 'reminders', 'amc', 'summary', 'customer_value_ranking', 'technician_billing_ranking', 'technician_field_stats', 'live_ops', 'location_search', 'sql_query'].includes(
      scope
    )
  );
  // A named technician is a filter on the day's work, not a customer lookup, so
  // resolve it before deciding whether the operational query may run at all.
  const technicianMatches =
    detected.active &&
    (detected.scopes.has('jobs') ||
      detected.scopes.has('technician_billing_ranking') ||
      detected.scopes.has('technician_field_stats')) &&
    (hints.nameTokens || []).length
      ? await findTechniciansByName(db, hints.nameTokens)
      : [];
  const intent = {
    ...detected,
    lookupMessage: message,
    technicianMatches,
    active:
      wantsAggregate ||   // location_search, sql_query, live_ops, etc. always active
      (detected.active && (!hasSpecificTarget || technicianMatches.length > 0)),
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
    intent.skipGlobalDocuments = customers.length > 0 && hasSearchableTarget(hints, focusCustomerId);
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
  const confirmedPaidValue =
    String(stats.completedJobValueBasis || '').startsWith('completed jobs currently marked PAID');
  const valueLabel = confirmedPaidValue
    ? 'confirmed-paid value of jobs completed in period'
    : 'billed value of jobs completed in period';
  const comparisonValueLabel = confirmedPaidValue ? 'confirmed-paid completed-job value' : 'billed';
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
  const requestedCustomerCodes = (pack.hints?.lookupTerms || [])
    .map((term) => String(term || '').toUpperCase())
    .filter((term) => /^C\d+$/.test(term));
  for (const code of requestedCustomerCodes) {
    const exact = (pack.customers || []).find(
      (customer) => String(customer.customerCode || '').toUpperCase() === code
    );
    if (exact) {
      lines.push(
        `Exact customer-code match: ${code} is ${exact.name} (id ${exact.id}). Do not say this customer code was not found.`
      );
    }
  }
  lines.push('CRM lookup results (bounded; treat as facts only):');

  const statLines = [];
  if (stats.jobsScheduledInRange != null)
    statLines.push(`jobs scheduled in period = ${stats.jobsScheduledInRange}`);
  if (stats.jobsCompletedInRange != null)
    statLines.push(`jobs completed in period = ${stats.jobsCompletedInRange}`);
  if (stats.openJobsTotal != null)
    statLines.push(
      `jobs in requested open status(es) ${(stats.openJobsStatuses || ONGOING_JOB_STATUSES).join('/')} during the requested period = ${stats.openJobsTotal}`
    );
  if (stats.followUpJobsTotal != null)
    statLines.push(`jobs in FOLLOW_UP during the requested period = ${stats.followUpJobsTotal}`);
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
      `${valueLabel} (INR) = ${stats.completedJobValueInRange}; basis: ${stats.completedJobValueBasis}`
    );
  if (stats.completedJobValuePrevious)
    statLines.push(
      `same-length previous period (${stats.completedJobValuePrevious.label}) ${comparisonValueLabel} INR ${stats.completedJobValuePrevious.value}${
        stats.completedJobValuePrevious.changePct != null
          ? `, change ${stats.completedJobValuePrevious.changePct > 0 ? '+' : ''}${stats.completedJobValuePrevious.changePct}%`
          : ''
      }`
    );
  if (stats.completedJobValuePreviousToDate)
    statLines.push(
      `same elapsed window of the previous period (${stats.completedJobValuePreviousToDate.label}) ${comparisonValueLabel} INR ${stats.completedJobValuePreviousToDate.value}${
        stats.completedJobValuePreviousToDate.changePct != null
          ? `, change ${stats.completedJobValuePreviousToDate.changePct > 0 ? '+' : ''}${stats.completedJobValuePreviousToDate.changePct}%`
          : ''
      } — this is the fair like-for-like comparison while the period is still running`
    );
  if (stats.completedJobValueProjection)
    statLines.push(
      `straight-line projection for the full period (${comparisonValueLabel}) = INR ${stats.completedJobValueProjection.projectedPeriodTotal} (${stats.completedJobValueProjection.elapsedDays} of ${stats.completedJobValueProjection.periodDays} days elapsed, INR ${stats.completedJobValueProjection.perDay} per day so far) — state it as an estimate at the current run rate`
    );
  if (stats.expenses) {
    const business = stats.expenses.business;
    const technician = stats.expenses.technician;
    statLines.push(
      `expense totals for ${stats.expenses.period}: business expenses ${
        business ? `INR ${business.total} across ${business.count} rows` : 'unavailable'
      }; technician expenses ${
        technician ? `INR ${technician.total} across ${technician.count} rows` : 'unavailable'
      }; combined ${
        stats.expenses.combinedTotal == null ? 'unavailable because one source failed' : `INR ${stats.expenses.combinedTotal}`
      }`
    );
    if (business) {
      statLines.push(`business expense categories = ${JSON.stringify(business.byCategory)}`);
      statLines.push(`latest business expenses = ${JSON.stringify(business.latest)}`);
    }
    if (technician) {
      statLines.push(`technician expense categories = ${JSON.stringify(technician.byCategory)}`);
      statLines.push(`latest technician expenses = ${JSON.stringify(technician.latest)}`);
    }
  }
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
  if (stats.remindersListed != null)
    statLines.push(
      `non-payment reminders in ${stats.remindersScope || stats.rangeLabel || 'the requested period'} = ${stats.remindersListed}`
    );
  if (stats.amcExpiryWindow) statLines.push(`AMC contracts listed expire between ${stats.amcExpiryWindow}`);
  if (stats.liveOps) {
    const live = stats.liveOps;
    statLines.push(
      `live field snapshot (${live.snapshotLabel || 'right now'}): ongoing open jobs = ${live.ongoingTotal}; unassigned/waiting = ${live.unassignedWaiting}; follow-ups open = ${live.followUpTotal}; completed today = ${live.completedToday}`
    );
    if (live.fieldIsClear) statLines.push('no open ongoing jobs right now — field is clear aside from follow-ups');
    if (live.byStatus) {
      statLines.push(
        `ongoing by status: ${Object.entries(live.byStatus)
          .map(([status, count]) => `${status}=${count}`)
          .join(', ')}`
      );
    }
    if (live.techniciansIdle?.length) {
      statLines.push(`technicians idle (no ongoing job assigned): ${live.techniciansIdle.join(', ')}`);
    }
  }
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

  if (Array.isArray(stats.technicianFieldStats)) {
    lines.push(
      `Technician field stats (${stats.technicianFieldStatsPeriod || 'today'}; authoritative):`
    );
    if (stats.technicianFieldStatsFilteredBy?.length) {
      lines.push(`- Filtered to: ${stats.technicianFieldStatsFilteredBy.join(', ')}`);
    }
    if (!stats.technicianFieldStats.length) {
      lines.push('- No field work found for this period.');
    }
    for (const row of stats.technicianFieldStats) {
      lines.push(
        `- name=${row.name}; worked=${row.durationLabel || '—'}; travelKm=${row.travelLabel || row.travelKm || '—'}; jobsStarted=${row.jobsStarted}; jobsCompleted=${row.jobsCompleted}; live=${row.live ? 'yes' : 'no'}`
      );
    }
    if (pack.truncated?.technicianFieldStats) {
      lines.push('- Warning: field-stats job scan hit its safety cap; totals may be incomplete.');
    }
  }

  if (stats.liveOps) {
    const live = stats.liveOps;
    lines.push(`Live operations snapshot (${live.snapshotLabel || 'right now'}; authoritative):`);
    if (live.techniciansOnField?.length) {
      lines.push('- Technicians on open jobs:');
      for (const row of live.techniciansOnField) {
        lines.push(
          `  • ${row.technicianName} — ${row.status} — job ${row.jobNumber} — ${row.customerName} — scheduled ${row.scheduledDate}`
        );
      }
    } else if (live.fieldIsClear) {
      lines.push('- No open ongoing jobs are assigned right now.');
    }
    if (live.unassignedWaiting > 0) {
      lines.push(`- ${live.unassignedWaiting} job(s) are waiting unassigned (PENDING with no technician).`);
    }
    if (pack.truncated?.liveOps) {
      lines.push('- Warning: open-job list was truncated; counts above are from the loaded slice.');
    }
  }

  const scopes = new Set(pack.intent?.scopes || []);
  const isTargetedLookup = scopes.size === 0;
  const showCustomers =
    isTargetedLookup || scopes.has('customers') || scopes.has('customer_value_ranking');
  const showJobs =
    isTargetedLookup ||
    scopes.has('jobs') ||
    scopes.has('summary') ||
    scopes.has('revenue') ||
    scopes.has('live_ops');

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

// ─── Universal read-only SQL fallback ────────────────────────────────────────

/**
 * Curated schema description given to the AI so it can write correct SQL.
 * Only includes tables the ai_readonly role can access.
 * Deliberately omits sensitive columns (secrets, tokens, hashed values).
 */
const AI_READONLY_SCHEMA = `
Tables available (read-only):

customers(id uuid, customer_id text, full_name text, phone text, alternate_phone text,
  email text, service_type text, brand text, model text, last_service_date date,
  customer_tier text, status text, latitude numeric, longitude numeric,
  visible_address text, created_at timestamptz)

jobs(id uuid, job_number text, customer_id uuid, status text,
  service_type text, service_sub_type text, service_brand text,
  payment_amount numeric, actual_cost numeric, payment_method text,
  completed_at timestamptz, end_time timestamptz, scheduled_date date,
  assigned_technician_id uuid, completed_by uuid,
  follow_up_date date, follow_up_time text, follow_up_notes text,
  follow_up_scheduled_at timestamptz, created_at timestamptz)
  status values: PENDING, ASSIGNED, EN_ROUTE, ONGOING, COMPLETED, CANCELLED, FOLLOW_UP

technicians(id uuid, name text, phone text, email text, is_active boolean, created_at timestamptz)

expenses(id uuid, category text, amount numeric, expense_date date,
  description text, expense_type text, technician_id uuid, created_at timestamptz)
  expense_type: business | technician

reminders(id uuid, entity_type text, entity_id uuid, title text,
  notes text, reminder_at timestamptz, completed_at timestamptz, created_at timestamptz)

payments(id uuid, customer_id uuid, job_id uuid, amount numeric,
  payment_method text, status text, paid_at timestamptz, created_at timestamptz)
  status: pending | paid | partial

amc_contracts(id uuid, customer_id uuid, start_date date, end_date date,
  years integer, status text, service_period_months integer)

Notes:
- IST = UTC+5:30. Use: (col AT TIME ZONE 'Asia/Kolkata')
- For day-of-week: EXTRACT(DOW FROM scheduled_date) 0=Sun 1=Mon ... 6=Sat
- Always use LIMIT (max 100 rows unless counting)
- scheduled_date is a date column (no time zone conversion needed)
- Join jobs to technicians via assigned_technician_id = technicians.id
- Join jobs to customers via jobs.customer_id = customers.id
`.trim();

/**
 * Execute a safe read-only SQL query via the ai_readonly_query RPC.
 * Returns { rows, error, rowCount } — never throws.
 */
async function runReadonlyQuery(db, sql) {
  if (!sql || typeof sql !== 'string') return { rows: [], error: 'Empty SQL', rowCount: 0 };
  try {
    const { data, error } = await db.rpc('ai_readonly_query', { p_sql: sql, p_max_rows: 100 });
    if (error) {
      console.warn('[ai-crm-lookup] ai_readonly_query error:', error.message);
      return { rows: [], error: error.message, rowCount: 0 };
    }
    const rows = Array.isArray(data) ? data : [];
    return { rows, error: null, rowCount: rows.length };
  } catch (e) {
    console.warn('[ai-crm-lookup] ai_readonly_query exception:', e.message);
    return { rows: [], error: e.message, rowCount: 0 };
  }
}

/**
 * Format raw SQL result rows into a readable text block for the AI answer formatter.
 */
function formatSqlRows(rows, label) {
  if (!rows?.length) return `${label}\n  No results.`;
  const keys = Object.keys(rows[0]);
  const lines = rows.map((row) =>
    keys
      .map((k) => {
        const v = row[k];
        if (v == null) return null;
        // Format numbers with commas for INR-like values
        if (typeof v === 'number' && k.match(/amount|cost|total|revenue|expense|payment/i)) {
          return `${k}: INR ${v.toLocaleString('en-IN')}`;
        }
        return `${k}: ${v}`;
      })
      .filter(Boolean)
      .join(' · ')
  );
  return `${label}\n  ${lines.join('\n  ')}`;
}

// ─── Location-based customer search ─────────────────────────────────────────

/** Extract (lat, lng, radiusKm) from a message containing a Maps URL or explicit coords. */
function extractLocationFromMessage(message) {
  if (!message) return null;

  // Google Maps URL: /place/12.8332033,77.6573798 or /@12.8332033,77.6573798
  const mapsUrl = message.match(/[/@](-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (mapsUrl) {
    const lat = parseFloat(mapsUrl[1]);
    const lng = parseFloat(mapsUrl[2]);
    if (isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng, radiusKm: extractRadiusKm(message) };
    }
  }

  // Plain coords: 12.8332033,77.6573798 or 12.8332033 77.6573798
  const plain = message.match(/(-?\d{1,3}\.\d{4,})[,\s]+(-?\d{1,3}\.\d{4,})/);
  if (plain) {
    const lat = parseFloat(plain[1]);
    const lng = parseFloat(plain[2]);
    if (isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng, radiusKm: extractRadiusKm(message) };
    }
  }

  return null;
}

function extractRadiusKm(message) {
  // "within 3 km", "5 km radius", "nearby" (default 5km)
  const m = message.match(/(\d+(?:\.\d+)?)\s*(?:km|kilometer|kilometre)/i);
  if (m) return Math.min(parseFloat(m[1]), 50);
  return 5; // default 5km
}

/**
 * Find customers near a lat/lng using the ai_customers_nearby RPC.
 * Returns array of customer-like objects with distance_km.
 */
async function findNearbyCustomers(db, lat, lng, radiusKm = 5) {
  try {
    const { data, error } = await db.rpc('ai_customers_nearby', {
      p_lat: lat,
      p_lng: lng,
      p_radius_km: radiusKm,
      p_limit: 20,
    });
    if (error) {
      console.warn('[ai-crm-lookup] ai_customers_nearby error:', error.message);
      return [];
    }
    return (data || []).map((row) => ({
      id: row.id,
      customerCode: row.customer_id,
      name: row.full_name,
      phone: row.phone,
      serviceType: row.service_type,
      latitude: row.latitude,
      longitude: row.longitude,
      distanceKm: typeof row.distance_km === 'number' ? row.distance_km.toFixed(2) : null,
    }));
  } catch (e) {
    console.warn('[ai-crm-lookup] ai_customers_nearby exception:', e.message);
    return [];
  }
}

/** Detect if message is asking for nearby/location-based customer search. */
function detectLocationSearch(message) {
  if (!message) return false;
  const lower = message.toLowerCase();
  const hasLocation = extractLocationFromMessage(message) !== null;
  const hasNearbyIntent =
    /\b(?:nearby|near|closest|close to|around|within|radius|location|map|maps\.google|google\.com\/maps)\b/i.test(
      message
    );
  return hasLocation && hasNearbyIntent;
}

module.exports = {
  CUSTOMER_LIMIT,
  JOB_LIMIT,
  OVERVIEW_JOB_LIMIT,
  TOP_CUSTOMER_LIMIT,
  TOP_TECHNICIAN_LIMIT,
  ONGOING_JOB_STATUSES,
  normalizeCrmQueryText,
  extractQueryHints,
  hasSearchableTarget,
  hasConcreteCustomerLookupTarget,
  extractQuickPaymentAmount,
  isQuickPaymentQrRequest,
  isQuickPaymentQrSendRequest,
  isQuickPaymentQrGenerationRequest,
  isQuickPaymentQrPhrase,
  isCustomerPaymentQrRequest,
  scopesForPlannerTools,
  detectOverviewIntent,
  detectCustomerValueRanking,
  detectTechnicianBillingRanking,
  detectTechnicianExpenseRanking,
  detectTechnicianFieldStats,
  nameMatchesToken,
  resolveCompletedJobValue,
  istDateKey,
  addDaysKey,
  lookupCrmContext,
  formatContextForPrompt,
  formatLiveOpsAnswer,
  publicLiveOpsSnapshot,
  formatStatsAnswerForTools,
  formatJobStatusLabel,
  slimCustomer,
  slimJob,
  // Universal SQL tool
  AI_READONLY_SCHEMA,
  runReadonlyQuery,
  formatSqlRows,
  // Location search
  extractLocationFromMessage,
  detectLocationSearch,
  findNearbyCustomers,
};
