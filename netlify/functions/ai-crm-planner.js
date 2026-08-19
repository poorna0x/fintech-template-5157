/**
 * LLM planner for CRM chat.
 *
 * The model can select only these read-only capabilities. It never supplies SQL,
 * table names, RPC names or database filters; ai-crm-lookup remains authoritative.
 */

const {
  extractQueryHints,
  hasSearchableTarget,
  hasConcreteCustomerLookupTarget,
  normalizeCrmQueryText,
  isQuickPaymentQrGenerationRequest,
  detectOverviewIntent,
  detectTechnicianFieldStats,
} = require('./ai-crm-lookup');

const SEARCH_ONLY_TOOLS = new Set(['customer_search', 'job_search']);

const ALLOWED_CRM_TOOLS = Object.freeze([
  'customer_search',
  'customer_directory',
  'job_search',
  'jobs_overview',
  'live_ops',
  'payments',
  'reminders',
  'amc',
  'revenue',
  'expenses',
  'customer_value_ranking',
  'technician_billing_ranking',
  'technician_field_stats',
  'documents',
  'action_draft',
  'app_navigation',
  'location_search',
  'sql_query',
]);

const CRM_PLANNER_SCHEMA = {
  type: 'object',
  required: ['route', 'tools', 'rewrittenQuery', 'directAnswer'],
  properties: {
    route: { type: 'string', enum: ['conversation', 'crm'] },
    tools: {
      type: 'array',
      maxItems: 4,
      items: { type: 'string', enum: ALLOWED_CRM_TOOLS },
    },
    rewrittenQuery: { type: 'string' },
    directAnswer: { type: 'string' },
  },
};

function plannerSystemInstruction() {
  return [
    'You route messages for an admin CRM assistant.',
    'Return JSON only: route, tools, rewrittenQuery, directAnswer.',
    'Use route=conversation for greetings, thanks, casual chat, explanations, or general questions that need no private CRM data.',
    'For conversation, tools=[], rewrittenQuery="", and provide a concise helpful directAnswer.',
    'Use route=crm when the user asks to find, count, compare, rank, summarize, create, or edit CRM records.',
    'For route=crm you MUST pick at least one tool. Never return an empty tools array for CRM questions.',
    'When unsure which tool fits, prefer jobs_overview plus payments or revenue for a safe read-only snapshot.',
    `CRM tools are allowlisted: ${ALLOWED_CRM_TOOLS.join(', ')}.`,
    'Choose only tools needed for the request. Never request SQL, database access, deletion, sending, or external URLs.',
    'customer_search and job_search look up specific records the message names, so include the name, phone, code or job number in rewrittenQuery.',
    'customer_directory answers how many customers exist or which ones are new; it never needs a name.',
    'Use jobs_overview when the answer needs the jobs behind a total, such as which customer or job produced an amount.',
    'Use live_ops for right-now field questions: what is going on now, who is waiting, where technicians are, unassigned jobs, or the current operations snapshot.',
    'Use technician_field_stats for how many km a technician drove or how many hours they worked (today, this week, etc.).',
    'Use expenses for business expenses, technician expenses, spending, fuel costs, rent, and expense-category totals.',
    'For CRM, rewrite the current request into one self-contained query using recent history to resolve follow-ups like "what about yesterday?" or "show their jobs".',
    'Preserve names, phones, job numbers, amounts, dates, and requested action fields exactly. Never invent them.',
    'For create/edit requests choose action_draft plus customer_search or job_search only when an existing record must be found.',
    'Use app_navigation when the user asks to open, go to, manage, configure, or edit an allowlisted CRM screen/settings area. Navigation never changes a setting by itself.',
    'For a quotation, bill, tax invoice, AMC, or warranty draft for an existing customer, choose action_draft plus customer_search so the answer can propose open_document_draft.',
    'For view/edit/assign/reassign/complete/follow-up requests about an existing job, choose action_draft plus job_search.',
    'For WhatsApp/email draft or compose requests about an existing customer, choose action_draft plus customer_search. The CRM only opens the composer and never sends automatically.',
    'Use location_search when the user pastes a Google Maps URL or coordinates and asks for nearby customers.',
    'Use sql_query for complex analytics questions that cannot be answered by other tools — e.g. busiest day of week, month-by-month trend, service type breakdown, cross-table aggregations.',
    'directAnswer must be empty for route=crm.',
  ].join(' ');
}

function exactConversationalReply(message) {
  const text = String(message || '')
    .trim()
    .toLowerCase()
    .replace(/[!?.,]+$/g, '')
    .trim();
  if (/^(hi|hii+|hey|hello|hai|hola|namaste|good (morning|afternoon|evening))$/.test(text)) {
    return 'Hello! How can I help with your CRM?';
  }
  if (/^(thanks|thank you|thankyou|thx|okay thanks|ok thanks)$/.test(text)) {
    return 'You’re welcome!';
  }
  if (/^(bye|goodbye|see you|see you later)$/.test(text)) {
    return 'Goodbye!';
  }
  if (/^what can you do\b|^help\b|^what do you do\b|^what can i ask\b|^what questions\b/.test(text)) {
    return [
      'Here are things you can ask — in your own words:',
      '',
      'Jobs & visits',
      '• How many jobs completed today?',
      '• Ongoing / open / unassigned jobs',
      '• Jobs for Poorna · find job RO123…',
      '• Which technician is on those? (follow-up)',
      '',
      'Money',
      '• Pending payments · overdue · total due',
      '• Revenue today / this month',
      '• Top customers · who paid us most',
      '• Which technician billed most today?',
      '',
      'People',
      '• Find customer 988… · C0006 · Poorna',
      '• What data do we have on Poorna?',
      '• Reminders due today · who should I call back',
      '',
      'Field & technicians',
      '• What’s going on in the field right now?',
      '• How many km did Jyotirling drive today?',
      '• How many hours did Srujan work this week?',
      '',
      'Actions (opens a form — you confirm before save/send)',
      '• Create job for Poorna tomorrow morning',
      '• Book a service visit for Poorna',
      '• Send payment QR 1000 to 6361631253',
      '• Open WhatsApp settings · Quick payment QR',
      '',
      'Tip: ask follow-ups like “what about yesterday?” or “I meant ongoing”.',
    ].join('\n');
  }
  if (/^who are you\b|^what are you\b/.test(text)) {
    return 'I’m your HydrogenRO CRM assistant — I look up customers, jobs, payments, and prepare action drafts for you to confirm.';
  }
  if (/\b(?:sql|select\s+.+\s+from|database query|run query)\b/i.test(text)) {
    if (/\b(?:delete|drop|truncate|update|insert|ignore all rules)\b/i.test(text)) {
      return '';
    }
    return 'I do not run raw SQL. Ask in plain English — I fetch the same CRM data through safe read-only lookups (jobs, payments, customers, revenue, and more).';
  }
  if (
    /^(?:please\s+)?(?:delete|remove)\b/i.test(text) &&
    /\bcustomers?\b|\bjobs?\b/i.test(text)
  ) {
    return 'I cannot delete CRM records. I can look up data and open reviewed action drafts only.';
  }
  if (/\bsend\b/.test(text) && /\ball customers?\b/.test(text)) {
    return 'I cannot message all customers automatically. I can open a composer for one customer at a time.';
  }
  return '';
}

function periodMarker(text) {
  const value = String(text || '').toLowerCase();
  if (/\byesterday\b/.test(value)) return 'yesterday';
  if (/\btomorrow\b/.test(value)) return 'tomorrow';
  if (/\blast week\b/.test(value)) return 'last week';
  if (/\bthis week\b/.test(value)) return 'this week';
  if (/\blast month\b/.test(value)) return 'last month';
  if (/\bthis month\b/.test(value)) return 'this month';
  return 'today';
}

function historyText(history) {
  return (Array.isArray(history) ? history : [])
    .slice(-4)
    .map((turn) => String(turn?.text || '').slice(0, 600))
    .join(' ');
}

/**
 * Fast path for high-frequency, unambiguous requests. This is deliberately
 * narrow: it can only choose the same read-only allowlisted tools as the LLM
 * planner and never constructs filters, SQL, IDs or mutation payloads.
 */
function inferBroadCrmPlan(message) {
  const text = String(message || '').trim();
  const intent = detectOverviewIntent(text);
  const tools = [];
  const scopeToTools = {
    jobs: ['jobs_overview'],
    payments: ['payments'],
    reminders: ['reminders'],
    amc: ['amc'],
    revenue: ['revenue'],
    expenses: ['expenses'],
    customers: ['customer_directory'],
    customer_value_ranking: ['customer_value_ranking'],
    technician_billing_ranking: ['technician_billing_ranking'],
    technician_field_stats: ['technician_field_stats'],
    live_ops: ['live_ops'],
    documents: ['documents'],
    summary: ['jobs_overview', 'revenue'],
  };
  for (const scope of intent.scopes || []) {
    for (const tool of scopeToTools[scope] || []) {
      if (!tools.includes(tool)) tools.push(tool);
    }
  }
  const hints = extractQueryHints(text);
  if (hints.jobNumber && !tools.includes('job_search')) tools.unshift('job_search');
  else if (hasConcreteCustomerLookupTarget(hints, text, null) && !tools.includes('customer_search')) {
    tools.unshift('customer_search');
  }
  if (!tools.length && hasConcreteCustomerLookupTarget(hints, text, null)) tools.push('customer_search');
  if (!tools.length) {
    if (
      /\b(?:ongoing|technician|techs?|those|remaining|completed|unassigned|assigned|en route|in progress|follow[\s-]?up)\b/i.test(
        text
      )
    ) {
      tools.push('jobs_overview');
    } else {
      tools.push('jobs_overview', 'payments', 'revenue');
    }
  }
  return {
    route: 'crm',
    tools: tools.slice(0, 4),
    rewrittenQuery: text,
    directAnswer: '',
    strategy: 'deterministic',
  };
}

/** Last-resort read-only plan: every CRM question gets bounded data, never raw SQL. */
function inferUniversalCrmPlan(message) {
  const text = String(message || '').trim();
  const hints = extractQueryHints(text);
  const tools = [];
  if (hints.jobNumber) tools.push('job_search');
  else if (hasSearchableTarget(hints, null)) tools.push('customer_search');
  tools.push('jobs_overview', 'payments', 'revenue');
  return {
    route: 'crm',
    tools: tools.slice(0, 4),
    rewrittenQuery: text,
    directAnswer: '',
    strategy: 'deterministic',
  };
}

function looksLikeCrmQuestion(text) {
  const raw = String(text || '').trim();
  const lower = raw.toLowerCase();
  if (raw.length < 2) return false;
  if (/\b(?:weather|joke|recipe|movie|cricket score|stock price|bitcoin|politics|poem)\b/.test(lower)) {
    return false;
  }
  if (/\b(?:sql|select\s+.+\s+from|database query|run query)\b/i.test(raw)) return true;
  if (
    /^(how|what|who|which|where|when|why|can|could|is|are|do|does|did|will|would|should|tell|give|show|find|list|get|any|count|total|sum|average|query|fetch|pull|search)\b/i.test(
      lower
    )
  ) {
    return true;
  }
  if (/\?/.test(raw)) return true;
  return /\b(?:customer|client|job|visit|service|payment|remind|amc|revenue|technician|tech|invoice|bill|quot|warranty|expense|billing|purifier|whatsapp|pending|due|owe|outstanding|booking|schedule|follow|business|sales|report|summary|overview|status|check|look up|open|go to|create|add|draft|send|qr|upi|ro\b|completed|ongoing|assigned|waiting|unassigned|field|live|today|yesterday|tomorrow|this month|last month|data|stats|metric|record|row|table)\b/.test(
    lower
  );
}

function looksLikeSaleLookup(text, lower) {
  const hasAmount = /\b(?:₹|rs\.?|inr)?\s*\d{1,2}(?:,\d{2}){2,}\b|\b\d{4,6}\b|\b\d+(?:\.\d+)?\s*k\b/i.test(text);
  const hasProduct = /\b(?:softeners?|\bro\b|installation|filter|amc)\b/.test(lower);
  const hasSale =
    /\b(?:sold|sale|billed|charged|invoiced|which customer|whose|who (?:bought|purchased|took))\b/.test(lower);
  return hasSale && (hasAmount || hasProduct);
}

function looksLikeSqlAnalyticsQuestion(lower) {
  const text = String(lower || '');
  if (
    /\b(?:pending payments?|top customers?|most expense|field stats|how much (?:did we )?(?:spend|revenue)|km (?:did|drove))\b/.test(
      text
    )
  ) {
    return false;
  }
  return (
    /\b(?:busiest|slowest|quietest|peak|off[\s-]?peak)\b/.test(text) ||
    (/\b(?:average|avg|mean|median)\b/.test(text) &&
      /\b(?:job|duration|time|rating|review|completion)\b/.test(text)) ||
    (/\b(?:shortest|longest|fastest)\b/.test(text) &&
      /\b(?:job|visit|completion|completed|duration|time)\b/.test(text)) ||
    /\bmonth[\s-]?(?:by[\s-]?month|wise|over month)\b|\bmonthly (?:trend|breakdown|revenue|jobs|report)\b/.test(text) ||
    /\b(?:trend|compare month|monthly breakdown|by month|each month)\b/.test(text) ||
    (/\b(?:service type|category|sub[\s-]?type)\b/.test(text) &&
      /\b(?:breakdown|split|distribution|most|highest|popular|common|revenue|jobs|count)\b/.test(text)) ||
    /\b(?:per (?:day|hour|week|weekday|month)|jobs per weekday|by (?:day|hour|week|brand|type|area|service|status))\b/.test(
      text
    ) ||
    /\b(?:which|what) (?:brand|area|service type|day|hour|month|locality)\b/.test(text) ||
    /\b(?:cancelled vs|completed vs|repeat vs|new vs|status breakdown)\b/.test(text) ||
    /\b(?:jobs? (?:at )?night|night jobs?|after hours|what time do most jobs)\b/.test(text) ||
    /\b(?:review ratings?|average rating)\b/.test(text) ||
    /\btop \d+ areas?\b|\bareas by jobs\b/.test(text)
  );
}

function inferDeterministicPlan(message, history = []) {
  const directAnswer = exactConversationalReply(message);
  if (directAnswer) {
    return {
      route: 'conversation',
      tools: [],
      rewrittenQuery: '',
      directAnswer,
      strategy: 'local',
    };
  }

  const text = String(message || '').trim();
  const lower = normalizeCrmQueryText(text).toLowerCase();
  const directHints = extractQueryHints(text);
  const quickPaymentQr = isQuickPaymentQrGenerationRequest(text, directHints);
  const customerPaymentQr = quickPaymentQr;
  const hasDirectJobReference =
    Boolean(directHints.jobNumber) &&
    (!/^C\d+$/i.test(String(directHints.jobNumber)) || /\bjob\b/.test(lower));
  if (
    hasDirectJobReference &&
    /\b(?:open|view|show|details?|edit|change|update|assign|reassign|complete|close|finish|follow[\s-]?up|reschedule)\b/.test(
      lower
    )
  ) {
    return {
      route: 'crm',
      tools: ['job_search', 'action_draft'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }
  if (quickPaymentQr && !hasDirectJobReference) {
    const hasCustomer = directHints.nameTokens.length > 0 || directHints.phone;
    return {
      route: 'crm',
      tools: hasCustomer ? ['customer_search', 'action_draft'] : ['action_draft'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }
  if (
    customerPaymentQr &&
    hasSearchableTarget(directHints, null) &&
    !hasDirectJobReference
  ) {
    return {
      route: 'crm',
      tools: ['customer_search', 'action_draft'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }
  if (
    (/\b(?:open|go to|take me to|navigate to|manage|configure|edit settings?|show me)\b/.test(
      lower
    ) ||
      /\b(?:show me|edit|change)\b.{0,40}\bsettings?\b/.test(lower)) &&
    /\b(?:settings?|dashboard|payments?|billing|analytics|inventory|whatsapp|calling|reminders?|technicians?|qr|upi|reviews?|privacy|database|usage|jobs?|accounts?|customer|trackers?|email|distance|visit|location)\b/.test(
      lower
    ) &&
    !hasDirectJobReference &&
    !customerPaymentQr &&
    !/\bshow me (?:everything|all|details|their|full)\b/i.test(lower) &&
    !/\bfor customer\b|\bcustomer c\d+\b/i.test(lower) &&
    // "show me jobs from august" / "show me pending jobs" are data queries, not navigation
    !/\b(?:from|in|during|for)\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i.test(lower) &&
    !/\bshow me\s+(?:pending|completed?|ongoing|open|cancelled?|assigned|unassigned|in[\s-]?progress|follow[\s-]?up|en[\s-]?route)\b/i.test(lower)
  ) {
    return {
      route: 'crm',
      tools: ['app_navigation'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }
  if (
    (/\b(?:turn|switch)\s+(?:on|off)\b|\b(?:enable|disable)\b/.test(lower) ||
      (/\b(?:change|switch|select|choose)\b/.test(lower) &&
        /\b(?:ai|model|provider)\b/.test(lower))) &&
    /\b(?:settings?|whatsapp|notifications?|push|pdf|compression|tracking|glow|reminders?|ai|model)\b/.test(
      lower
    )
  ) {
    return {
      route: 'crm',
      tools: ['app_navigation'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }
  if (
    /\b(?:documents?|invoices?|quotations?|quotes?|warrant(?:y|ies)|bills?|authenticity|verify code)\b/.test(
      lower
    ) &&
    !/\b(?:draft|prepare|create|make|generate|email|whatsapp|send)\b/.test(lower)
  ) {
    return {
      route: 'crm',
      tools: ['documents'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }
  if (
    /\bbook(?:ing)?\s+(?:a\s+)?(?:service|visit|appointment|job)\b/i.test(lower) &&
    hasSearchableTarget(directHints, null) &&
    !/\ball customers?\b/.test(lower)
  ) {
    return {
      route: 'crm',
      tools: ['customer_search', 'action_draft'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }
  const wantsHardMutation =
    /\b(edit|change|delete|remove|assign|reassign|schedule|set)\b/.test(lower) ||
    (/\bupdate\b/.test(lower) && !/\b(?:status|quick) update\b/i.test(lower)) ||
    (/\bbook\b/.test(lower) && !/\bbook(?:ing)?\s+(?:a\s+)?(?:service|visit|job|appointment)\b/i.test(lower)) ||
    (/\bcreate\b/.test(lower) && !/\b(?:service )?job\b/.test(lower)) ||
    (/\bsend\b/.test(lower) && !/\b(?:draft|compose|write|prepare|open|payment|pay|qr|link)\b/.test(lower)) ||
    /\b(?:complete|finish|close)\s+(?:the\s+)?job\b/.test(lower);
  if (wantsHardMutation) {
    return null;
  }
  if (
    /\bcreate\s+(?:a\s+)?customers?\b/.test(lower) &&
    /\b(?:service )?job\b/.test(lower)
  ) {
    return {
      route: 'crm',
      tools: ['action_draft'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }
  if (
    (/\bcreate\b/.test(lower) || /\badd\b/.test(lower)) &&
    /\b(?:service )?job\b/.test(lower) &&
    hasSearchableTarget(directHints, null) &&
    !/\ball customers?\b/.test(lower)
  ) {
    return {
      route: 'crm',
      tools: ['customer_search', 'action_draft'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }
  if (
    /\b(?:draft|compose|write|prepare)\b/.test(lower) &&
    /\b(?:whatsapp|email|message)\b/.test(lower) &&
    hasSearchableTarget(directHints, null) &&
    !/\ball customers?\b/.test(lower)
  ) {
    return {
      route: 'crm',
      tools: ['customer_search', 'action_draft'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }
  const recent = historyText(history);
  const combined = `${recent} ${text}`.toLowerCase();
  const userTurns = (Array.isArray(history) ? history : [])
    .filter((turn) => turn?.role === 'user' && turn.text)
    .map((turn) => String(turn.text));
  const lastUserMessage = userTurns[userTurns.length - 1];
  // A follow-up chain ("how many completed today" -> "i meant ongoing" -> "which
  // technician is on those") loses the subject unless earlier turns are merged
  // back in, so widen the window until the merged text routes on its own.
  const inheritPlan = () => {
    for (let depth = 1; depth <= Math.min(3, userTurns.length); depth += 1) {
      const merged = `${userTurns.slice(-depth).join(' ')} ${text}`;
      const inherited = inferDeterministicPlan(merged, []);
      if (inherited?.route === 'crm') {
        return { ...inherited, rewrittenQuery: merged, strategy: 'deterministic' };
      }
    }
    return null;
  };
  // A message naming its own subject is a fresh question, not a follow-up.
  const possessiveReference =
    /\b(?:their|his|her)\b/i.test(text) && text.length <= 80;
  const hasOwnSubject =
    !possessiveReference &&
    /\bjobs?\b|\bvisits?\b|\bcustomers?\b|\bclients?\b|\bpayments?\b|\breminders?\b|\bamc\b|\brevenue\b|\btechnicians?\b|\btechs?\b|\bdocuments?\b|\binvoices?\b|\bquotations?\b|\bbills?\b/i.test(
      text
    );

  // "who has the lowest" only makes sense against the previous ranking, so keep
  // that tool instead of letting it decay into a plain name search.
  const superlativeFollowUp =
    !hasOwnSubject &&
    text.length <= 60 &&
    /^(?:so\s+)?(?:and\s+)?(?:who|which|what)?\s*(?:one\s+)?(?:has|had|is|was|did\s+)?\s*(?:the\s+)?(?:lowest|highest|least|most|biggest|smallest|top|worst|best|second|third|fourth|fifth|sixth|\d+(?:st|nd|rd|th))\b/i.test(
      text
    );
  if (superlativeFollowUp && lastUserMessage) {
    const context = `${lastUserMessage} ${text}`.toLowerCase();
    const aboutTechnician = /\btechnicians?\b|\btechs?\b|\btechcnians?\b|\btehcnc?ians?\b/.test(context);
    if (aboutTechnician) {
      return {
        route: 'crm',
        tools: ['technician_billing_ranking'],
        rewrittenQuery: `${lastUserMessage} ${text}`,
        directAnswer: '',
        strategy: 'deterministic',
      };
    }
    if (/\bcustomers?\b|\bclients?\b|\bpaid\b|\bbill(?:ed|ing)?\b|\btop\b|\bmost\b/.test(context)) {
      const tools = ['customer_value_ranking'];
      if (extractQueryHints(lastUserMessage).nameTokens.length) {
        tools.unshift('customer_search');
      }
      return {
        route: 'crm',
        tools,
        rewrittenQuery: `${lastUserMessage} ${text}`,
        directAnswer: '',
        strategy: 'deterministic',
      };
    }
  }

  if (
    lastUserMessage &&
    /\b(?:his|her|their)\b/i.test(text) &&
    /\b(?:biggest|highest|largest|top)\b/i.test(text) &&
    /\bjob\b/i.test(text)
  ) {
    const merged = `${lastUserMessage} ${text}`;
    return {
      route: 'crm',
      tools: ['technician_billing_ranking', 'jobs_overview'],
      rewrittenQuery: merged,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }

  // "which technician is on those" points at the rows the previous question
  // returned, so re-ask that question with the new detail.
  const pronounFollowUp =
    text.length <= 70 &&
    /\b(?:those|them|these|it|that one|the same)\b/i.test(text) &&
    !/\btoday\b|\byesterday\b|\btomorrow\b|\bthis (?:week|month)\b|\blast (?:week|month)\b/i.test(
      text
    );
  if (pronounFollowUp && lastUserMessage) {
    const inherited = inheritPlan();
    if (inherited) return inherited;
  }

  // "how many remaining" / "I meant ongoing" only swaps the status filter of the
  // previous question, so re-ask that question with the new filter.
  const statusFollowUp =
    !hasOwnSubject &&
    text.length <= 60 &&
    /\bon[\s-]?going\b|\bremaining\b|\bleft\b|\bopen\b|\bpending\b|\bin[\s-]?progress\b|\bunassigned\b|\bcancell?ed\b|\bcompleted?\b|\bassigned\b|\ben[\s-]?route\b/i.test(
      text
    );
  if (statusFollowUp && lastUserMessage) {
    const inherited = inheritPlan();
    if (inherited) return inherited;
  }

  // "not today, all time" / "what about tomorrow" only changes the period.
  const periodFollowUp =
    !hasOwnSubject &&
    !hasSearchableTarget(extractQueryHints(text), null) &&
    text.length <= 60 &&
    /\ball[\s-]?time\b|\bentire\b|\bever\b|\blife[\s-]?time\b|\btoday\b|\byesterday\b|\btomorrow\b|\bthis week\b|\bthis month\b|\blast week\b|\blast month\b|\boverall\b|\bso far\b/i.test(
      text
    );
  if (periodFollowUp && lastUserMessage) {
    const inherited = inheritPlan();
    if (inherited) return inherited;
  }

  const possessiveFollowUp =
    !hasOwnSubject &&
    text.length <= 80 &&
    /\b(?:their|his|her)\b/i.test(text) &&
    lastUserMessage;
  if (possessiveFollowUp) {
    const merged = `${lastUserMessage} ${text}`;
    const inherited = inheritPlan();
    const tools = inherited?.tools?.length
      ? [...inherited.tools]
      : hasSearchableTarget(extractQueryHints(lastUserMessage), null)
        ? ['customer_search']
        : [];
    if (tools.length) {
      if (/\b(?:jobs?|visits?|services?)\b/i.test(text) && !tools.includes('jobs_overview')) {
        tools.push('jobs_overview');
      }
      return {
        route: 'crm',
        tools: tools.slice(0, 4),
        rewrittenQuery: merged,
        directAnswer: '',
        strategy: 'deterministic',
      };
    }
  }

  const detailFollowUp =
    /^(for |which |what )?(customer|job)( was it| is it)?[?!.]*$/i.test(text) ||
    /\bfor which customer\b|\bwhich customer\b|\bwhich job\b/i.test(text);
  const period = periodMarker(detailFollowUp ? combined : text);

  const namesAtLeastTwoPeople = extractQueryHints(text).nameTokens.length >= 2;
  if (
    namesAtLeastTwoPeople &&
    /\bcompare\b|\bvs\b|\bversus\b/.test(lower) &&
    !/\bcreate\b|\badd\b|\bdelete\b|\bsend\b/.test(lower)
  ) {
    return {
      route: 'crm',
      tools: ['technician_billing_ranking'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }
  if (
    ((/\btechnicians?\b|\btechs?\b|\btechcnians?\b|\btehcnc?ians?\b/.test(lower) ||
      (namesAtLeastTwoPeople && /\bcompare\b|\bvs\b|\bversus\b/.test(lower))) &&
      /\bhighest\b|\btop\b|\bmost\b|\blowest\b|\bleast\b|\bcompare\b|\bvs\b|\bversus\b|\beach\b|\bper technician\b/.test(
        lower
      ) &&
      /\bbill(?:ed|ing)?\b|\brevenue\b|\bsales\b|\bearn(?:ed|ings)?\b|\bmost jobs\b|\bmost work\b|\bmost kaam\b/.test(lower)) ||
    (detailFollowUp &&
      /\btechnicians?\b|\btechs?\b|\btechcnians?\b|\btehcnc?ians?\b/.test(combined) &&
      /\bhighest\b|\btop\b|\bmost\b/.test(combined) &&
      /\bbill(?:ed|ing)?\b|\brevenue\b|\bsales\b/.test(combined))
  ) {
    return {
      route: 'crm',
      tools: detailFollowUp ? ['technician_billing_ranking', 'jobs_overview'] : ['technician_billing_ranking'],
      rewrittenQuery: detailFollowUp
        ? `For the highest-billing technician ${period}, identify the underlying job and customer.`
        : text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }

  if (
    /\b(?:who is (?:our )?best customer|top spenders?\b|most loyal customers?\b|biggest customers?\b|best (?:paying )?customer|most valuable customer|highest spending customer)\b/i.test(lower) ||
    (
      /\b(customers?|clients?)\b/.test(lower) &&
      /\bhighest\b|\btop\b|\bmost\b|\bbiggest\b|\blowest\b|\bleast\b|\bsmallest\b|\btop\s+\d+\b/.test(lower) &&
      (/\bpaid\b|\bspent\b|\bbill(?:ed|ing)?\b|\bvalue\b|\brevenue\b|\bspend(?:ers?)?\b|\bloyal\b/.test(lower) ||
        /\btop\s+\d*\s*customers?\b|\bbest customers?\b/.test(lower))
    )
  ) {
    return {
      route: 'crm',
      tools: ['customer_value_ranking'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }

  if (
    /\bhow many customers?\b|\btotal customers?\b|\bcustomer count\b|\bnumber of customers?\b|\bcustomers?\s+(?:added|created|joined)\b/.test(
      lower
    )
  ) {
    return {
      route: 'crm',
      tools: ['customer_directory'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }

  if (
    /\bpending payments?\b|\bpayments? pending\b|\bpayment dues?\b|\bpayments?\s+reminders?\b|\bpayments?[\s-]+due\b|\boverdue\b|\bwho (?:owes|owe)\b|\bcustomers? (?:owes|owe)\b|\bowe us\b|\boutstanding (?:amount|payments?)\b|\bwho has not paid\b|\bnot (?:yet )?paid\b|\blist customers with dues\b|\bstill outstanding\b|\bhow much is (?:still )?(?:due|owed)\b|\bpaise\b|\bwhen will we get paid\b|\bunpaid invoices?\b/.test(
      lower
    )
  ) {
    return {
      route: 'crm',
      tools: ['payments'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }

  if (/\bexpenses?\b|\bspend\b|\bspent\b|\bspending\b|\bfuel costs?\b|\brent costs?\b|\boutgoing\b|\boverheads?\b|\bsalary\b|\bstaff costs?\b|\bhow much did we pay (?:staff|team|technicians?|employees?)\b|\bkharcha\b/.test(lower)) {
    const hasPeriod =
      /\btoday\b|\byesterday\b|\btomorrow\b|\bthis (?:week|month)\b|\blast (?:week|month)\b|\ball[\s-]?time\b|\b20\d{2}(?:-\d{2}-\d{2})?\b/i.test(
        text
      );
    const periodSource = hasPeriod
      ? ''
      : [...userTurns]
          .reverse()
          .slice(0, 3)
          .find(
            (turn) =>
              /\bexpenses?\b|\bspend\b|\bspent\b|\bspending\b/i.test(turn) &&
              /\btoday\b|\byesterday\b|\btomorrow\b|\bthis (?:week|month)\b|\blast (?:week|month)\b|\ball[\s-]?time\b|\b20\d{2}(?:-\d{2}-\d{2})?\b/i.test(
                turn
              )
          );
    return {
      route: 'crm',
      tools: ['expenses'],
      rewrittenQuery: periodSource ? `${periodSource} ${text}` : text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }

  // Money we earned, as opposed to money customers still owe us.
  if (
    /\bhow are we doing\b|\bcompared to last month\b|\bdoing better than last month\b|\bvs last month\b/.test(
      lower
    ) &&
    !/\bcreate\b|\badd\b|\bbook\b|\bschedule\b/.test(lower)
  ) {
    return {
      route: 'crm',
      tools: ['revenue'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }

  if (
    /\b(?:status update|quick status|daily report|situation report|ops update|daily summary|quick update|any updates?|give me (?:a )?(?:full|quick)? ?(?:status|update|summary|report)|what(?:'s| is) (?:new|happening) today|what happened today)\b/i.test(
      lower
    )
  ) {
    return {
      route: 'crm',
      tools: ['live_ops', 'jobs_overview'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }

  if (
    /\b(?:anything|what(?:'s| is)) pending\b|\bpending right now\b|\banything due\b|\bwhat needs attention\b/i.test(
      lower
    )
  ) {
    return {
      route: 'crm',
      tools: ['payments', 'reminders'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }

  if (
    /\b(?:analytics?|insights?|dashboard numbers?|kpi|kpis|performance report|business snapshot|today'?s? (?:stats?|numbers?|report|summary)|show me (?:today'?s? )?stats?|daily stats?|give me a full report|full report|everything today|show me everything today)\b/i.test(
      lower
    ) &&
    !/\bcreate\b|\badd\b|\bbook\b|\bschedule\b/.test(lower)
  ) {
    return {
      route: 'crm',
      tools: ['jobs_overview', 'payments', 'revenue', 'expenses'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }

  if (
    /\b(?:call back|callback|follow[\s-]?up calls?|who should i call)\b/i.test(lower) &&
    !/\bcreate\b|\badd\b|\bschedule\b/.test(lower)
  ) {
    return {
      route: 'crm',
      tools: ['reminders', 'payments'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }

  if (looksLikeSaleLookup(text, lower)) {
    return {
      route: 'crm',
      tools: ['job_search', 'customer_search'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }

  const areaHints = extractQueryHints(text);
  if (areaHints.placeHint) {
    return {
      route: 'crm',
      tools: ['customer_search'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }

  // Location / nearby customer search — must come BEFORE field stats so "within X km" doesn't misroute
  if (
    /[/@]-?\d{1,3}\.\d+,-?\d{1,3}\.\d+/.test(text) ||
    (/\b(?:nearby|near|closest|close to|within|around|surrounding|radius)\b/i.test(lower) &&
      /-?\d{2,3}\.\d{4,}/.test(text))
  ) {
    return {
      route: 'crm',
      tools: ['location_search'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }

  if (detectTechnicianFieldStats(text)) {
    return {
      route: 'crm',
      tools: ['technician_field_stats'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }

  if (
    /\b(?:problems?|issues?|trouble)\b.*\b(?:field|floor|site)\b|\b(?:field|floor)\b.*\b(?:problems?|issues?)\b/i.test(
      lower
    )
  ) {
    return {
      route: 'crm',
      tools: ['live_ops'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }

  // Analytics questions needing SQL GROUP BY / aggregation — route to sql_query
  if (looksLikeSqlAnalyticsQuestion(lower)) {
    return { route: 'crm', tools: ['sql_query'], rewrittenQuery: text, directAnswer: '', strategy: 'deterministic' };
  }
  if (
    /\b(?:within|surrounding|nearby|around|radius)\b/i.test(lower) &&
    /(\d+(?:\.\d+)?)\s*(?:m|meters?|metres?|mtr|km|kilometers?|kilometres?)\b/i.test(lower) &&
    !/[/@]-?\d{1,3}\.\d+/.test(text) &&
    !/-?\d{2,3}\.\d{4,}/.test(text)
  ) {
    return {
      route: 'conversation',
      tools: [],
      rewrittenQuery: '',
      directAnswer: 'Paste a Google Maps pin or coordinates, and I can list customers within that distance (for example 50m or 3 km).',
      strategy: 'deterministic',
    };
  }

  // "find customer who visited / came / last service in [month]" — jobs query not customer lookup
  if (
    /\b(?:customer|client|clients?|who|which)\b/i.test(lower) &&
    /\b(?:visited|came|last (?:service|visit|job)|service(?:d)? (?:in|during)?|was (?:here|serviced)|serviced)\b/i.test(lower) &&
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|last month|this month|yesterday|today)\b/i.test(lower)
  ) {
    return {
      route: 'crm',
      tools: ['jobs_overview'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }

  if (
    /\bshow me (?:everything|all|full details)\b/i.test(lower) &&
    (hasSearchableTarget(directHints, null) || /\bcustomer\b/i.test(lower))
  ) {
    return {
      route: 'crm',
      tools: ['customer_search', 'jobs_overview', 'payments', 'documents'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }

  if (
    /\brevenue\b|\bcollect(?:ed|ion|ions)?\b|\bincome\b|\bturnover\b|\bearn(?:ed|ings|ing)?\b|\bproject\b|\bforecast\b|\bbusiness (?:did|happened|going|is)\b|\bbusiness today\b|\bhow(?:'s| is) business\b|\bbilling happened\b|\bmonth[\s-]+to[\s-]+date sales\b|\bdoing better\b|\bdoing worse\b|\bat this pace\b|\bwhere will this month end\b|\btotal invoiced\b|\bbilled so far\b|\bmoney came in\b|\bhow much (?:money|cash) (?:came in|received|did we get)\b|\bkamai\b/.test(
      lower
    ) &&
    !/\bcreate\b|\badd\b|\bbook\b|\bschedule\b/.test(lower)
  ) {
    return {
      route: 'crm',
      tools: ['revenue'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }

  if (/\bamc\b/.test(lower) && /\bexpir(?:y|ing|e)|\bdue\b|\brenew/.test(lower)) {
    return {
      route: 'crm',
      tools: ['amc'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }

  if (/\breminders?\b/.test(lower) && !/\bcreate\b|\badd\b|\bset\b/.test(lower)) {
    return {
      route: 'crm',
      tools: ['reminders'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }

  if (
    (
      /\bwhat(?:'s| is) (?:going on|happening)\b|\bright now\b|\bat the moment\b|\blive status\b|\bfield status\b|\boperations snapshot\b|\bfloor status\b|\banyone waiting\b|\bwho(?:'s| is) waiting\b|\bwaiting (?:for|jobs?|customers?)\b|\bwhere are (?:the )?technicians?\b|\btechnicians? (?:locations?|whereabouts)\b|\bunassigned jobs?\b|\bjobs? waiting\b|\bwhat are (?:the )?techs?\b|\bwhat are technicians\b/i.test(lower) ||
      // Hindi live-ops — check both normalized and original
      /\bkya hua\b|\bkya ho raha\b|\bfield mein\b|\baaj field\b|\bkya chal raha\b/i.test(lower) ||
      /\bkya hua\b|\bkya ho raha\b|\bfield mein\b|\baaj field\b|\bkya chal raha\b/i.test(text.toLowerCase())
    ) &&
    !/\bcreate\b|\badd\b|\bbook\b|\bschedule\b/.test(lower)
  ) {
    return {
      route: 'crm',
      tools: ['live_ops'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }

  // "which day of the week are we busiest" — analytical question not yet backed by a tool
  if (/\bday of the week\b|\bbusiest day\b|\bpeak day\b|\bbusiest\b.*\b(?:day|week)\b/i.test(lower)) {
    return {
      route: 'crm',
      tools: ['jobs_overview'],
      rewrittenQuery: 'jobs completed this month',
      directAnswer: '',
      strategy: 'deterministic',
    };
  }

  if (
    (/\b(today'?s?|yesterday'?s?) jobs?\b|\bjobs? (today|yesterday)\b/.test(lower) ||
      (/\bjobs?\b|\bvisits?\b|\bservices?\b/.test(lower) &&
        /\bhow many\b|\bcount\b|\bon[\s-]?going\b|\bremaining\b|\bleft\b|\bopen\b|\bpending\b|\bin[\s-]?progress\b|\bunassigned\b|\bassigned\b|\ben[\s-]?route\b|\bcompleted?\b|\bcancell?ed\b|\bfollow[\s-]?up\b/.test(
          lower
        )) ||
      (/\bjobs?\b/.test(lower) &&
        /\b20\d{2}-\d{2}-\d{2}\b|\bbetween\b|\bfrom\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/.test(
          lower
        ))) &&
    !/\bcreate\b|\badd\b|\bbook\b|\bschedule\b/.test(lower)
  ) {
    return {
      route: 'crm',
      tools: ['jobs_overview'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }

  if (
    directHints.nameTokens.length >= 1 &&
    /\bjobs?\b/i.test(lower) &&
    /\b(?:complete|completed|did|finished)\b/i.test(lower) &&
    !/\bcreate\b|\badd\b|\bbook\b|\bschedule\b/.test(lower)
  ) {
    return {
      route: 'crm',
      tools: ['jobs_overview'],
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }

  if (
    hasConcreteCustomerLookupTarget(directHints, text, null) &&
    !/\b(?:create|add|edit|update|change|delete|remove|send|draft|prepare|turn|disable|enable|assign|complete|book|schedule)\b/i.test(
      lower
    )
  ) {
    const tools = [];
    if (directHints.jobNumber && /\bjob\b/i.test(lower) && !/\bcustomer\b/i.test(lower)) {
      tools.push('job_search');
    } else {
      tools.push('customer_search');
    }
    if (/\b(?:jobs?|visits?|services?)\b/i.test(lower)) {
      tools.push('jobs_overview');
    }
    return {
      route: 'crm',
      tools: tools.slice(0, 4),
      rewrittenQuery: text,
      directAnswer: '',
      strategy: 'deterministic',
    };
  }

  if (looksLikeCrmQuestion(text)) {
    return inferBroadCrmPlan(text);
  }

  return null;
}

function normalizePlannerOutput(raw, fallbackMessage) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const route = src.route === 'conversation' ? 'conversation' : 'crm';
  const seen = new Set();
  const tools = [];
  for (const value of Array.isArray(src.tools) ? src.tools : []) {
    const tool = String(value || '').trim();
    if (!ALLOWED_CRM_TOOLS.includes(tool) || seen.has(tool)) continue;
    seen.add(tool);
    tools.push(tool);
    if (tools.length >= 4) break;
  }
  if (route === 'conversation') {
    return {
      route,
      tools: [],
      rewrittenQuery: '',
      directAnswer:
        String(src.directAnswer || '')
          .trim()
          .slice(0, 1200) || 'How can I help with your CRM today?',
    };
  }
  return {
    route,
    tools,
    rewrittenQuery: String(src.rewrittenQuery || fallbackMessage || '')
      .trim()
      .slice(0, 1500),
    directAnswer: '',
  };
}

/**
 * A ranking answer alone cannot say which customer or job produced a total, so
 * guarantee the underlying jobs are fetched rather than trusting the model to ask.
 */
function augmentPlanTools(plan, message) {
  if (plan?.route !== 'crm') return plan;
  const tools = [...(plan.tools || [])];
  const isRanking = tools.includes('technician_billing_ranking') || tools.includes('customer_value_ranking');
  const wantsRecordDetail = /\bcustomers?\b|\bjobs?\b/i.test(`${message || ''} ${plan.rewrittenQuery || ''}`);
  if (isRanking && wantsRecordDetail && !tools.includes('jobs_overview')) {
    tools.push('jobs_overview');
  }
  // job_search / customer_search only find a named record. With nothing to
  // search for, the plan would query nothing and wrongly report "no records".
  const combined = `${plan.rewrittenQuery || ''} ${message || ''}`;
  const searchOnly = tools.length > 0 && tools.every((tool) => SEARCH_ONLY_TOOLS.has(tool));
  const namesSomeone = hasSearchableTarget(extractQueryHints(combined), null);
  if (searchOnly && !namesSomeone) {
    tools.push('jobs_overview');
  }
  // Without a search tool a named person is never looked up, and the answer ends
  // up claiming a search that never ran.
  if (namesSomeone && !tools.some((tool) => SEARCH_ONLY_TOOLS.has(tool)) && !tools.includes('technician_field_stats')) {
    tools.push('customer_search');
  }
  if (plan?.route === 'crm' && !tools.length) {
    return inferUniversalCrmPlan(message);
  }
  return { ...plan, tools: tools.slice(0, 4) };
}

function buildPlannerMessages(history, message) {
  const turns = (Array.isArray(history) ? history : []).slice(-8).map((turn) => ({
    role: turn.role === 'assistant' ? 'assistant' : 'user',
    text: String(turn.text || '').slice(0, 600),
  }));
  turns.push({ role: 'user', text: String(message || '').slice(0, 1500) });
  return turns;
}

function buildAllowlistedLookupQuery(plan, fallbackMessage) {
  const fallback = String(fallbackMessage || '');
  // A current message that names a customer/phone/code is a fresh target. Keep
  // the model's tool choice, but do not let dates or comparisons from an older
  // conversation topic leak into this lookup.
  const source = hasSearchableTarget(extractQueryHints(fallback), null)
    ? fallback
    : plan?.rewrittenQuery || fallback;
  const base = String(source || '')
    .trim()
    .slice(0, 1500);
  const markers = {
    jobs_overview: 'jobs',
    live_ops: 'live operations snapshot',
    payments: 'pending payments',
    reminders: 'reminders',
    amc: 'AMC expiry',
    revenue: 'revenue',
    expenses: 'expenses',
    customer_value_ranking: 'top customer paid most',
    technician_billing_ranking: 'top technician highest billing',
    technician_field_stats: 'technician km and worked hours',
    documents: 'documents',
    app_navigation: 'open app screen',
    location_search: 'nearby customers location',
    sql_query: 'analytics sql query',
  };
  const suffix = (plan?.tools || [])
    .map((tool) => markers[tool])
    .filter(Boolean)
    .join(' ');
  return `${base}${suffix ? `\n${suffix}` : ''}`.slice(0, 1800);
}

/**
 * Only surface the record sections the plan actually asked for, so a targeted
 * question does not render unrelated customer/job cards.
 */
function visibleEntitiesForTools(pack, tools) {
  const selected = Array.isArray(tools) ? tools : [];
  const all = {
    customers: pack?.customers || [],
    jobs: pack?.jobs || [],
    reminders: pack?.reminders || [],
    payments: pack?.payments || [],
    documents: pack?.documents || [],
    technicians: pack?.technicians || [],
  };
  if (!selected.length) return all;

  const shows = (...names) => names.some((name) => selected.includes(name));
  return {
    customers: shows('customer_search', 'customer_directory', 'customer_value_ranking', 'action_draft')
      ? all.customers
      : [],
    jobs: shows('job_search', 'jobs_overview', 'revenue', 'live_ops', 'action_draft') ? all.jobs : [],
    reminders: shows('reminders') ? all.reminders : [],
    payments: shows('payments') ? all.payments : [],
    documents: shows('documents', 'amc') ? all.documents : [],
    technicians: shows('technician_billing_ranking', 'technician_field_stats', 'live_ops') ? all.technicians : [],
  };
}

/** Never treat Quick payment QR as pending-payment lookup or settings. */
function coerceCustomerPaymentQrPlan(message, plan) {
  const text = String(message || '').trim();
  const hints = extractQueryHints(text);
  if (!text || !isQuickPaymentQrGenerationRequest(text, hints)) return plan;
  const hasCustomer = hints.nameTokens.length > 0 || hints.phone;
  return {
    route: 'crm',
    tools: hasCustomer ? ['customer_search', 'action_draft'] : ['action_draft'],
    rewrittenQuery: text,
    directAnswer: '',
    strategy: 'deterministic',
  };
}

module.exports = {
  ALLOWED_CRM_TOOLS,
  CRM_PLANNER_SCHEMA,
  plannerSystemInstruction,
  normalizePlannerOutput,
  buildPlannerMessages,
  buildAllowlistedLookupQuery,
  visibleEntitiesForTools,
  augmentPlanTools,
  inferDeterministicPlan,
  coerceCustomerPaymentQrPlan,
  inferUniversalCrmPlan,
};
