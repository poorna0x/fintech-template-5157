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
  return {
    answer: normalized.value.answer,
    tools: plan.tools,
    strategy,
    actions: (normalized.value.proposedActions || []).map((action) => action.type),
    pack,
  };
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
  for (const name of names) {
    console.log(`\n================ ${name} ================`);
    const history = [];
    for (const [message] of BATTERIES[name]) {
      const started = Date.now();
      try {
        const result = await ask(history, message);
        console.log(
          `\n>> ${message}\n[${result.strategy}: ${result.tools.join(',') || 'chat'}${
            result.actions.length ? ` | actions: ${result.actions.join(',')}` : ''
          }] (${Date.now() - started}ms)\n${result.answer}`
        );
        history.push({ role: 'user', text: message }, { role: 'assistant', text: result.answer });
      } catch (error) {
        console.log(`\n>> ${message}\nFAILED: ${error.message}`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
