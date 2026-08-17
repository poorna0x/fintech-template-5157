/**
 * LLM planner for CRM chat.
 *
 * The model can select only these read-only capabilities. It never supplies SQL,
 * table names, RPC names or database filters; ai-crm-lookup remains authoritative.
 */

const ALLOWED_CRM_TOOLS = Object.freeze([
  'customer_search',
  'job_search',
  'jobs_overview',
  'payments',
  'reminders',
  'amc',
  'revenue',
  'customer_value_ranking',
  'technician_billing_ranking',
  'documents',
  'action_draft',
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
    'Use jobs_overview when the answer needs the jobs behind a total, such as which customer or job produced an amount.',
    'For CRM, rewrite the current request into one self-contained query using recent history to resolve follow-ups like "what about yesterday?" or "show their jobs".',
    'Preserve names, phones, job numbers, amounts, dates, and requested action fields exactly. Never invent them.',
    'For create/edit requests choose action_draft plus customer_search or job_search only when an existing record must be found.',
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
  const lower = text.toLowerCase();
  if (
    /\b(create|add|edit|update|change|delete|remove|send|whatsapp|email|book|schedule|set)\b/.test(
      lower
    )
  ) {
    return null;
  }
  const recent = historyText(history);
  const combined = `${recent} ${text}`.toLowerCase();
  const lastUserMessage = [...(Array.isArray(history) ? history : [])]
    .reverse()
    .find((turn) => turn?.role === 'user')?.text;
  // "who has the lowest" only makes sense against the previous ranking, so keep
  // that tool instead of letting it decay into a plain name search.
  const superlativeFollowUp =
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

  // "not today, all time" only changes the period of the previous question.
  const periodFollowUp =
    text.length <= 60 &&
    /\ball[\s-]?time\b|\bentire\b|\bever\b|\blife[\s-]?time\b|\byesterday\b|\bthis (?:week|month)\b|\blast (?:week|month)\b|\boverall\b|\bso far\b/i.test(
      text
    );
  if (periodFollowUp && lastUserMessage) {
    const merged = `${lastUserMessage} ${text}`;
    const inherited = inferDeterministicPlan(merged, []);
    if (inherited?.route === 'crm') {
      return { ...inherited, rewrittenQuery: merged, strategy: 'deterministic' };
    }
  }

  const detailFollowUp =
    /^(for |which |what )?(customer|job)( was it| is it)?[?!.]*$/i.test(text) ||
    /\bfor which customer\b|\bwhich customer\b|\bwhich job\b/i.test(text);
  const period = periodMarker(detailFollowUp ? combined : text);

  if (
    (/\btechnicians?\b|\btechs?\b|\btechcnians?\b|\btehcnc?ians?\b/.test(lower) &&
      /\bhighest\b|\btop\b|\bmost\b/.test(lower) &&
      /\bbill(?:ed|ing)?\b|\brevenue\b|\bsales\b/.test(lower)) ||
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
    /\bhighest\b|\btop\b|\bmost\b|\bbiggest\b/.test(lower) &&
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

  if (/\bpending payments?\b|\bpayments? pending\b|\bpayment dues?\b/.test(lower)) {
    return {
      route: 'crm',
      tools: ['payments'],
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
    /\b(today'?s?|yesterday'?s?) jobs?\b|\bjobs? (today|yesterday)\b/.test(lower) &&
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
  const base = String(plan?.rewrittenQuery || fallbackMessage || '')
    .trim()
    .slice(0, 1500);
  const markers = {
    jobs_overview: 'jobs',
    payments: 'pending payments',
    reminders: 'reminders',
    amc: 'AMC expiry',
    revenue: 'revenue',
    customer_value_ranking: 'top customer paid most',
    technician_billing_ranking: 'top technician highest billing',
    documents: 'documents',
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
    customers: shows('customer_search', 'customer_value_ranking', 'action_draft') ? all.customers : [],
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
