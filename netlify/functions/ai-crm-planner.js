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
        String(src.directAnswer || '').trim().slice(0, 1200) ||
        'How can I help with your CRM today?',
    };
  }
  return {
    route,
    tools,
    rewrittenQuery:
      String(src.rewrittenQuery || fallbackMessage || '').trim().slice(0, 1500),
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
  const isRanking =
    tools.includes('technician_billing_ranking') || tools.includes('customer_value_ranking');
  const wantsRecordDetail = /\bcustomers?\b|\bjobs?\b/i.test(
    `${message || ''} ${plan.rewrittenQuery || ''}`
  );
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
  const base = String(plan?.rewrittenQuery || fallbackMessage || '').trim().slice(0, 1500);
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
  const suffix = (plan?.tools || []).map((tool) => markers[tool]).filter(Boolean).join(' ');
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
    customers: shows('customer_search', 'customer_value_ranking', 'action_draft')
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
};
