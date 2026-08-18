/**
 * Replays admin questions through the real CRM AI pipeline (planner -> bounded
 * lookup -> answer) against the live database, so answers can be compared with
 * ground truth. Read-only: no mutation tool is ever selected.
 *
 * Usage: node scripts/ai-crm-smoke.cjs [batteryName]
 */
const fs = require('node:fs');
const path = require('node:path');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^"|"$/g, '');
  }
}

const { normalizeConfig } = require('../netlify/functions/ai-config');
const { generateWithProvider } = require('../netlify/functions/ai-provider');
const planner = require('../netlify/functions/ai-crm-planner');
const lookup = require('../netlify/functions/ai-crm-lookup');
const { normalizeCrmChatOutput } = require('../netlify/functions/ai-crm-schemas');

const chat = require('../netlify/functions/ai-crm-chat')._test;

const config = normalizeConfig(
  {
    provider: process.env.AI_ASSISTANT_PROVIDER || 'groq',
    groqApiKey: process.env.GROQ_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    model: process.env.AI_ASSISTANT_MODEL,
  },
  'env'
);

async function ask(history, message) {
  let plan = planner.inferDeterministicPlan(message, history);
  let strategy = plan ? 'deterministic' : 'model';
  if (!plan) {
    const planned = await generateWithProvider(config, {
      operation: 'crm_chat_plan',
      systemInstruction: planner.plannerSystemInstruction(),
      messages: planner.buildPlannerMessages(history, message),
      temperature: 0,
      maxOutputTokens: 500,
      responseJsonSchema: planner.CRM_PLANNER_SCHEMA,
    });
    plan = planner.augmentPlanTools(
      planner.normalizePlannerOutput(planned.parsed || JSON.parse(planned.text || '{}'), message),
      message
    );
  }

  if (plan.route === 'conversation') {
    return { answer: plan.directAnswer, tools: [], strategy, actions: [] };
  }

  const pack = await lookup.lookupCrmContext({
    message: planner.buildAllowlistedLookupQuery(plan, message),
    plannerTools: plan.tools,
  });
  const result = await generateWithProvider(config, {
    operation: 'crm_chat',
    systemInstruction: chat.buildSystemInstruction(),
    messages: [
      {
        role: 'user',
        text: chat.buildUserPrompt(message, lookup.formatContextForPrompt(pack), history),
      },
    ],
    temperature: 0.2,
    maxOutputTokens: plan.tools.includes('action_draft') ? 1600 : 1200,
    responseJsonSchema: chat.CRM_CHAT_SCHEMA,
  });
  const normalized = normalizeCrmChatOutput(result.parsed || JSON.parse(result.text || '{}'), {
    entities: { customers: pack.customers, jobs: pack.jobs },
  });
  const safeActions = chat.filterActionsForEntityState(
    chat.mergeSafeUiActions(
      chat.filterProposedActionsForRequest(
        chat.filterProposedActionsForPlan(normalized.value.proposedActions, plan.tools),
        message
      ),
      chat.deriveSafeUiActions({
        message,
        tools: plan.tools,
        customers: pack.customers,
        jobs: pack.jobs,
      })
    ),
    pack.jobs
  );
  return {
    answer: chat.normalizePendingActionAnswer(normalized.value.answer, safeActions),
    tools: plan.tools,
    strategy,
    actions: safeActions.map((action) => action.type),
    pack,
  };
}

function isTransientAiError(error) {
  return /quota|capacity|rate limit|temporar|timeout|unavailable/i.test(String(error?.message || ''));
}

async function askWithRetry(history, message) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await ask(history, message);
    } catch (error) {
      lastError = error;
      if (!isTransientAiError(error) || attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw lastError;
}

const BATTERIES = {
  jobs: [
    ['how many jobs completed today'],
    ['how many remaining'],
    ['i meant ongoing'],
    ['which technician is on those'],
    ['how many jobs are scheduled tomorrow'],
    ['jobs yesterday'],
  ],
  money: [
    ['pending payments'],
    ['how much did we collect today'],
    ['which customer has paid us the most'],
    ['who is second'],
    ['revenue this month'],
  ],
  people: [
    ['find customer 9880693311'],
    ['customers named shety'],
    ['who has the lowest billing among them'],
    ['which technician did the highest billing today'],
    ['not today, all time'],
  ],
  ops: [
    ['amc expiring soon'],
    ['reminders due this week'],
    ['how many customers do we have'],
    ['show me job RO89843428'],
  ],
  edge: [
    ['how many jobs did jyotirling do today'],
    ['compare srujan and pradeep billing this month'],
    ['top 3 customers this month'],
    ['customer C0006 details'],
    ['any jobs for 9880693311'],
    ['how many jobs completed in 2019'],
    ['thanks'],
  ],
  forecast: [
    ['how much revneue this month happend and what do you project how much it can be'],
    ['how does that compare with last month'],
    ['how much ishanga 7% happned last month'],
  ],
  job_statuses: [
    ['how many jobs are assigned today'],
    ['how many are en route'],
    ['how many are in progress'],
    ['how many were cancelled today'],
    ['show follow up jobs this week'],
    ['how many jobs completed this month'],
  ],
  job_dates: [
    ['how many jobs completed yesterday'],
    ['what about last week'],
    ['and this month'],
    ['how many jobs are booked for 18 august 2026'],
    ['jobs between 1 august 2026 and 10 august 2026'],
  ],
  technicians: [
    ['top 5 technicians by billing this month'],
    ['who is lowest'],
    ['compare jyotirling and pradeep all time'],
    ['how many jobs did srujan complete this month'],
    ['what was his biggest job'],
  ],
  customer_value: [
    ['top 5 customers by billing all time'],
    ['who paid the most this month'],
    ['who is third'],
    ['find customers named shetty'],
    ['which one paid the most all time'],
  ],
  customer_lookup: [
    ['find customer C0006'],
    ['what is their phone number'],
    ['show their jobs'],
    ['find customer poorna shety'],
    ['find phone ending 3311'],
    ['find customer that does not exist xyzabc'],
  ],
  receivables: [
    ['how many pending payments are there'],
    ['how much is overdue now'],
    ['which customers owe us money'],
    ['pending payments this week'],
    ['payment reminders due tomorrow'],
  ],
  reminders_amc: [
    ['reminders due today'],
    ['what about tomorrow'],
    ['reminders this month'],
    ['amc expiring this month'],
    ['whose amc expires first'],
    ['amc expired last month'],
  ],
  documents: [
    ['show documents for customer C0006'],
    ['does poorna shetty have any tax invoices'],
    ['show latest invoice for C0006'],
    ['show quotations for 9880693311'],
    ['show warranty documents for poorna shetty'],
  ],
  business_language: [
    ['how much business happened today'],
    ['how much billing happened last week'],
    ['month to date sales'],
    ['are we doing better than last month'],
    ['at this pace where will this month end'],
    ['how much gst business happened last month'],
  ],
  expenses: [
    ['how much did we spend this month'],
    ['how much was business expense and technician expense'],
    ['what are the biggest expense categories'],
    ['show latest expenses'],
    ['fuel expenses this month'],
    ['expenses last month'],
  ],
  typos: [
    ['how many jbos complted tody'],
    ['pendng paymnts'],
    ['remidners tommorow'],
    ['top tehcnician billng this mnth'],
    ['custmer poorna shety detals'],
    ['amc expiary soon'],
  ],
  boundaries: [
    ['revenue all time'],
    ['revenue in 2019'],
    ['jobs on 2026-08-17'],
    ['jobs from 2026-08-01 to 2026-08-07'],
    ['customers added this month'],
    ['customers added last month'],
  ],
  action_drafts: [
    ['create a reminder for Poorna Shetty tomorrow at 10 am'],
    ['edit Poorna Shetty phone to 9999999999'],
    ['create customer Test Person phone 9876543210'],
    ['create customer Test Person phone 9876543210 and a service job tomorrow'],
    ['delete job RO89843428'],
  ],
  navigation: [
    ['open whatsapp settings'],
    ['take me to analytics'],
    ['open completed jobs'],
    ['show me payment QR settings'],
    ['go to AI usage'],
  ],
  settings_actions: [
    ['turn off PDF compression'],
    ['disable WhatsApp CRM'],
    ['change the AI model'],
    ['open notification settings'],
  ],
  document_actions: [
    ['draft a quotation for Poorna Shetty for an RO purifier costing 10000'],
    ['prepare a service bill for customer C0006'],
    ['open a tax invoice draft for Poorna Shetty'],
    ['draft an AMC for 9880693311'],
    ['prepare a warranty for Poorna Shetty'],
  ],
  record_actions: [
    ['open job RO89843428'],
    ['edit job RO89843428'],
    ['assign job RO89843428'],
    ['complete job RO89843428'],
    ['schedule a follow-up for job RO89843428 tomorrow'],
    ['draft a WhatsApp message to Poorna Shetty'],
    ['compose an email to Poorna Shetty'],
  ],
  safety: [
    ['hi'],
    ['delete customer Poorna Shetty'],
    ['create a service job for Poorna Shetty tomorrow morning'],
    ['send a whatsapp to all customers about a discount'],
    ['what can you do'],
  ],
};

async function main() {
  const requested = process.argv[2];
  const names = requested ? [requested] : Object.keys(BATTERIES);
  let failures = 0;
  for (const name of names) {
    console.log(`\n================ ${name} ================`);
    const history = [];
    for (const [message] of BATTERIES[name]) {
      const started = Date.now();
      try {
        const result = await askWithRetry(history, message);
        console.log(
          `\n>> ${message}\n[${result.strategy}: ${result.tools.join(',') || 'chat'}${
            result.actions.length ? ` | actions: ${result.actions.join(',')}` : ''
          }] (${Date.now() - started}ms)\n${result.answer}`
        );
        history.push({ role: 'user', text: message }, { role: 'assistant', text: result.answer });
      } catch (error) {
        failures += 1;
        console.log(`\n>> ${message}\nFAILED: ${error.message}`);
      }
    }
  }
  if (failures) throw new Error(`${failures} CRM AI smoke question(s) failed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
