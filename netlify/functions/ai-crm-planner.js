/**
 * LLM planner for CRM chat.
 *
 * The model can select only these read-only capabilities. It never supplies SQL,
 * table names, RPC names or database filters; ai-crm-lookup remains authoritative.
 */

const {
  extractQueryHints,
  hasSearchableTarget,
  normalizeCrmQueryText,
} = require('./ai-crm-lookup');

const SEARCH_ONLY_TOOLS = new Set(['customer_search', 'job_search']);

const ALLOWED_CRM_TOOLS = Object.freeze([
  'customer_search',
  'customer_directory',
  'job_search',
  'jobs_overview',
  'payments',
  'reminders',
  'amc',
  'revenue',
  'expenses',
  'customer_value_ranking',
  'technician_billing_ranking',
  'documents',
  'action_draft',
  'app_navigation',
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
    `CRM tools are allowlisted: ${ALLOWED_CRM_TOOLS.join(', ')}.`,
    'Choose only tools needed for the request. Never request SQL, database access, deletion, sending, or external URLs.',
    'customer_search and job_search look up specific records the message names, so include the name, phone, code or job number in rewrittenQuery.',
    'customer_directory answers how many customers exist or which ones are new; it never needs a name.',
    'Use jobs_overview when the answer needs the jobs behind a total, such as which customer or job produced an amount.',
    'Use expenses for business expenses, technician expenses, spending, fuel costs, rent, and expense-category totals.',
    'For CRM, rewrite the current request into one self-contained query using recent history to resolve follow-ups like "what about yesterday?" or "show their jobs".',
    'Preserve names, phones, job numbers, amounts, dates, and requested action fields exactly. Never invent them.',
    'For create/edit requests choose action_draft plus customer_search or job_search only when an existing record must be found.',
    'Use app_navigation when the user asks to open, go to, manage, configure, or edit an allowlisted CRM screen/settings area. Navigation never changes a setting by itself.',
    'For a quotation, bill, tax invoice, AMC, or warranty draft for an existing customer, choose action_draft plus customer_search so the answer can propose open_document_draft.',
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
  if (
    (/\b(?:open|go to|take me to|navigate to|manage|configure|edit settings?)\b/.test(lower) ||
      /\b(?:show me|edit|change)\b.{0,40}\bsettings?\b/.test(lower)) &&
    /\b(?:settings?|dashboard|payments?|billing|analytics|inventory|whatsapp|calling|reminders?|technicians?|qr|reviews?|privacy|database|usage|jobs?|accounts?|customer|trackers?|email|distance|visit|location)\b/.test(
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
    /\b(create|add|edit|update|change|delete|remove|send|whatsapp|email|book|schedule|set)\b/.test(
      lower
    )
  ) {
    return null;
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
  const hasOwnSubject =
    /\bjobs?\b|\bvisits?\b|\bcustomers?\b|\bclients?\b|\bpayments?\b|\breminders?\b|\bamc\b|\brevenue\b|\btechnicians?\b|\btechs?\b|\bdocuments?\b|\binvoices?\b|\bquotations?\b|\bbills?\b/i.test(
      text
    );

  // "who has the lowest" only makes sense against the previous ranking, so keep
  // that tool instead of letting it decay into a plain name search.
  const superlativeFollowUp =
    !hasOwnSubject &&
    text.length <= 60 &&
    /^(?:so\s+)?(?:and\s+)?(?:who|which|what)?\s*(?:one)?\s*(?:has|had|is|was|did)?\s*(?:the)?\s*(?:lowest|highest|least|most|biggest|smallest|top|worst|best)\b/i.test(
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
    if (/\bcustomers?\b|\bclients?\b|\bpaid\b|\bbill(?:ed|ing)?\b/.test(context)) {
      return {
        route: 'crm',
        tools: ['customer_search', 'customer_value_ranking'],
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

  // "not today, all time" only changes the period of the previous question.
  const periodFollowUp =
    !hasOwnSubject &&
    !hasSearchableTarget(extractQueryHints(text), null) &&
    text.length <= 60 &&
    /\ball[\s-]?time\b|\bentire\b|\bever\b|\blife[\s-]?time\b|\byesterday\b|\bthis (?:week|month)\b|\blast (?:week|month)\b|\boverall\b|\bso far\b/i.test(
      text
    );
  if (periodFollowUp && lastUserMessage) {
    const inherited = inheritPlan();
    if (inherited) return inherited;
  }

  const detailFollowUp =
    /^(for |which |what )?(customer|job)( was it| is it)?[?!.]*$/i.test(text) ||
    /\bfor which customer\b|\bwhich customer\b|\bwhich job\b/i.test(text);
  const period = periodMarker(detailFollowUp ? combined : text);

  const namesAtLeastTwoPeople = extractQueryHints(text).nameTokens.length >= 2;
  if (
    ((/\btechnicians?\b|\btechs?\b|\btechcnians?\b|\btehcnc?ians?\b/.test(lower) ||
      (namesAtLeastTwoPeople && /\bcompare\b|\bvs\b|\bversus\b/.test(lower))) &&
      /\bhighest\b|\btop\b|\bmost\b|\blowest\b|\bleast\b|\bcompare\b|\bvs\b|\bversus\b|\beach\b|\bper technician\b/.test(
        lower
      ) &&
      /\bbill(?:ed|ing)?\b|\brevenue\b|\bsales\b|\bearn(?:ed|ings)?\b/.test(lower)) ||
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
    /\b(customers?|clients?)\b/.test(lower) &&
    /\bhighest\b|\btop\b|\bmost\b|\bbiggest\b|\blowest\b|\bleast\b|\bsmallest\b/.test(lower) &&
    /\bpaid\b|\bspent\b|\bbill(?:ed|ing)?\b|\bvalue\b/.test(lower)
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
    /\bpending payments?\b|\bpayments? pending\b|\bpayment dues?\b|\bpayments?\s+reminders?\b|\bpayments?[\s-]+due\b|\boverdue\b|\bwho (?:owes|owe)\b|\bcustomers? (?:owes|owe)\b|\bowe us\b|\boutstanding (?:amount|payments?)\b/.test(
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

  if (/\bexpenses?\b|\bspend\b|\bspent\b|\bspending\b|\bfuel costs?\b|\brent costs?\b/.test(lower)) {
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
    /\brevenue\b|\bcollect(?:ed|ion|ions)?\b|\bincome\b|\bturnover\b|\bearn(?:ed|ings|ing)?\b|\bbusiness (?:did|happened)\b|\bbilling happened\b|\bmonth[\s-]+to[\s-]+date sales\b|\bdoing better\b|\bdoing worse\b|\bat this pace\b|\bwhere will this month end\b/.test(
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
    (/\b(today'?s?|yesterday'?s?) jobs?\b|\bjobs? (today|yesterday)\b/.test(lower) ||
      (/\bjobs?\b|\bvisits?\b|\bservices?\b/.test(lower) &&
        /\bhow many\b|\bcount\b|\bon[\s-]?going\b|\bremaining\b|\bleft\b|\bopen\b|\bpending\b|\bin[\s-]?progress\b|\bunassigned\b|\bassigned\b|\ben[\s-]?route\b|\bcompleted?\b|\bcancell?ed\b/.test(
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
  if (namesSomeone && !tools.some((tool) => SEARCH_ONLY_TOOLS.has(tool))) {
    tools.push('customer_search');
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
    payments: 'pending payments',
    reminders: 'reminders',
    amc: 'AMC expiry',
    revenue: 'revenue',
    expenses: 'expenses',
    customer_value_ranking: 'top customer paid most',
    technician_billing_ranking: 'top technician highest billing',
    documents: 'documents',
    app_navigation: 'open app screen',
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
    jobs: shows('job_search', 'jobs_overview', 'revenue', 'action_draft') ? all.jobs : [],
    reminders: shows('reminders') ? all.reminders : [],
    payments: shows('payments') ? all.payments : [],
    documents: shows('documents', 'amc') ? all.documents : [],
    technicians: shows('technician_billing_ranking') ? all.technicians : [],
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
};
