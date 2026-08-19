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

  const deterministic = chat.buildDeterministicCrmResponse({
    plan,
    pack,
    message,
    config,
    servedProvider: config.provider,
    servedModel: config.model,
    fellBack: false,
    started: Date.now(),
    usage: {},
    plannerStrategy: strategy,
  });
  if (deterministic) {
    return {
      answer: deterministic.answer,
      tools: plan.tools,
      strategy,
      actions: deterministic.proposedActions.map((action) => action.type),
      pack,
    };
  }

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

const { BATTERIES } = require('./ai-crm-smoke-batteries.cjs');

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
