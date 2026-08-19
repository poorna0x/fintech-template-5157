/**
 * Full CRM AI battery: planner routing + lookup + answer validation.
 * Usage: node scripts/ai-crm-batch-test.cjs [--planner-only] [batteryName]
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

const { BATTERIES } = require('./ai-crm-smoke-batteries.cjs');

function isTransientAiError(error) {
  return /quota|capacity|rate limit|temporar|timeout|unavailable/i.test(String(error?.message || ''));
}

function buildProviderConfig(provider) {
  return normalizeConfig(
    {
      provider,
      groqApiKey: process.env.GROQ_API_KEY,
      geminiApiKey: process.env.GEMINI_API_KEY,
      model:
        provider === 'gemini'
          ? process.env.AI_ASSISTANT_GEMINI_MODEL || 'gemini-3.1-flash-lite'
          : process.env.AI_ASSISTANT_MODEL,
    },
    'env'
  );
}

let activeConfig = buildProviderConfig(process.env.AI_ASSISTANT_PROVIDER || 'groq');

async function generateWithFallback(opts) {
  const geminiModels = ['gemini-3.1-flash-lite', 'gemini-flash-latest'];
  const attempts = [];
  if (activeConfig.provider === 'groq') attempts.push(activeConfig);
  if (process.env.GEMINI_API_KEY) {
    for (const model of geminiModels) {
      attempts.push({ ...buildProviderConfig('gemini'), model });
    }
  }
  if (activeConfig.provider === 'gemini') {
    for (const model of geminiModels) {
      attempts.push({ ...activeConfig, model });
    }
  }
  if (!attempts.length) attempts.push(activeConfig);

  let lastError = null;
  for (const cfg of attempts) {
    try {
      const result = await generateWithProvider(cfg, opts);
      if (cfg.provider === 'gemini' && activeConfig.provider === 'groq') {
        console.warn(`[batch-test] Groq unavailable — using Gemini (${cfg.model})`);
      }
      activeConfig = cfg;
      return result;
    } catch (error) {
      lastError = error;
      if (
        !isTransientAiError(error) &&
        !/not available|404|invalid_argument/i.test(String(error?.message || ''))
      ) {
        throw error;
      }
    }
  }
  throw lastError || new Error('AI provider unavailable');
}

const plannerOnly = process.argv.includes('--planner-only');

function validateAnswer(message, tools, answer, extras = {}) {
  const issues = [];
  const text = String(answer || '').trim();
  if (!text) issues.push('empty answer');
  if (/\bsend\b/i.test(message) && /\b(?:qr|payment|upi)\b/i.test(message) && /\d{10}\b/.test(message)) {
    if (!extras.actions?.includes('send_payment_qr') && !/\bSend on WhatsApp\b/i.test(text)) {
      issues.push('send+phone QR query should offer send_payment_qr action');
    }
  }
  if (/\bshow me quick payment qr\b/i.test(message) && extras.actions?.length) {
    const hasNav = extras.actions.includes('open_app');
    if (!hasNav) issues.push('quick payment qr navigation should offer open_app');
  }
  if (tools.includes('live_ops')) {
    if (!extras.liveOpsSnapshot && !/^Field snapshot/m.test(text)) {
      issues.push('live_ops: missing Field snapshot structure');
    }
    if (text.length > 180 && !text.includes('\n\n') && !extras.liveOpsSnapshot) {
      issues.push('live_ops: answer is one dense paragraph');
    }
  }
  if (
    tools.includes('conversation') ||
    (!tools.length && /^(hi|thanks|hello)/i.test(message))
  ) {
    return issues;
  }
  if (
    text &&
    /\bI (?:could not|couldn't|cannot|can't) find\b/i.test(text) &&
    !/\bno (?:records|results|matches|jobs|customers|payments|reminders)\b/i.test(text)
  ) {
    issues.push('generic "could not find" without explicit empty-state');
  }
  if (text && /\bexecute_sql\b|\bSELECT \* FROM\b/i.test(text)) {
    issues.push('leaked SQL/internal detail');
  }
  return issues;
}

async function resolvePlan(message, history) {
  let plan = planner.inferDeterministicPlan(message, history);
  if (plan) {
    plan = planner.coerceCustomerPaymentQrPlan(message, plan);
    return { plan, strategy: plan.strategy || 'deterministic' };
  }
  return { plan: null, strategy: 'needs_model' };
}

async function ask(history, message) {
  let plan = planner.inferDeterministicPlan(message, history);
  let strategy = plan ? plan.strategy || 'deterministic' : 'model';
  if (!plan) {
    await new Promise((resolve) => setTimeout(resolve, 8000));
    const planned = await generateWithFallback({
      operation: 'crm_chat_plan',
      systemInstruction: planner.plannerSystemInstruction(),
      messages: planner.buildPlannerMessages(history, message),
      temperature: 0,
      maxOutputTokens: 500,
      timeoutMs: 12_000,
      responseJsonSchema: planner.CRM_PLANNER_SCHEMA,
    });
    plan = planner.augmentPlanTools(
      planner.normalizePlannerOutput(planned.parsed || JSON.parse(planned.text || '{}'), message),
      message
    );
  }
  plan = planner.coerceCustomerPaymentQrPlan(message, plan);

  if (plan.route === 'conversation') {
    return {
      answer: plan.directAnswer,
      tools: [],
      strategy,
      actions: [],
      plan,
    };
  }

  const pack = await lookup.lookupCrmContext({
    message: planner.buildAllowlistedLookupQuery(plan, message),
    plannerTools: plan.tools,
  });

  const deterministic = chat.buildDeterministicCrmResponse({
    plan,
    pack,
    message,
    config: activeConfig,
    servedProvider: activeConfig.provider,
    servedModel: activeConfig.model,
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
      plan,
      liveOpsSnapshot: deterministic.metaExtra?.liveOpsSnapshot,
      pack,
    };
  }

  const result = await generateWithFallback({
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
    timeoutMs: 20_000,
    responseJsonSchema: chat.CRM_CHAT_SCHEMA,
  });
  const normalized = normalizeCrmChatOutput(result.parsed || JSON.parse(result.text || '{}'), {
    entities: { customers: pack.customers, jobs: pack.jobs },
  });
  if (!normalized.ok) {
    throw new Error('AI returned empty answer');
  }
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
    plan,
    pack,
  };
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

const MODEL_PLANNER_BATTERIES = new Set([
  'action_drafts',
  'document_actions',
  'settings_actions',
]);

async function testPlannerOnly() {
  let failures = 0;
  let skipped = 0;
  for (const [name, rows] of Object.entries(BATTERIES)) {
    const history = [];
    for (const [message] of rows) {
      try {
        const { plan, strategy } = await resolvePlan(message, history);
        if (!plan) {
          if (MODEL_PLANNER_BATTERIES.has(name) || (name === 'safety' && !/^(hi|thanks|thank you|what can you do)\b/i.test(message))) {
            skipped += 1;
          } else {
            failures += 1;
            console.log(`FAIL [${name}] >> ${message}\n  no deterministic or model plan`);
          }
        } else if (plan.route === 'conversation') {
          if (!plan.directAnswer) {
            failures += 1;
            console.log(`FAIL [${name}] >> ${message}\n  conversation missing directAnswer`);
          }
        } else if (!Array.isArray(plan.tools) || !plan.tools.length) {
          failures += 1;
          console.log(`FAIL [${name}] >> ${message}\n  crm route with no tools (${strategy})`);
        }
        history.push(
          { role: 'user', text: message },
          { role: 'assistant', text: plan?.directAnswer || '(crm)' }
        );
      } catch (error) {
        failures += 1;
        console.log(`FAIL [${name}] >> ${message}\n  ${error.message}`);
      }
    }
  }
  console.log(`Planner-only: ${skipped} model-routed queries skipped`);
  return failures;
}

async function main() {
  if (plannerOnly) {
    const failures = await testPlannerOnly();
    if (failures) throw new Error(`${failures} planner routing failure(s)`);
    console.log('All planner routes OK');
    return;
  }

  const requestedNames = process.argv.slice(2).filter((arg) => !arg.startsWith('-') && BATTERIES[arg]);
  const names = requestedNames.length ? requestedNames : Object.keys(BATTERIES);
  let failures = 0;
  const failureRows = [];

  for (const name of names) {
    console.log(`\n================ ${name} ================`);
    const history = [];
    for (const [message] of BATTERIES[name]) {
      const started = Date.now();
      try {
        const result = await askWithRetry(history, message);
        const issues = validateAnswer(message, result.tools, result.answer, {
          liveOpsSnapshot: result.liveOpsSnapshot,
          actions: result.actions,
        });
        const tag = `[${result.strategy}: ${result.tools.join(',') || 'chat'}${
          result.actions?.length ? ` | actions: ${result.actions.join(',')}` : ''
        }] (${Date.now() - started}ms)`;
        if (issues.length) {
          failures += 1;
          failureRows.push({ name, message, issues, answer: result.answer });
          console.log(`\n>> ${message}\n${tag}\nISSUES: ${issues.join('; ')}\n${result.answer}`);
        } else {
          console.log(`\n>> ${message}\n${tag}\nOK · ${result.answer.slice(0, 120)}${result.answer.length > 120 ? '…' : ''}`);
        }
        history.push({ role: 'user', text: message }, { role: 'assistant', text: result.answer });
      } catch (error) {
        failures += 1;
        failureRows.push({ name, message, issues: [error.message], answer: '' });
        console.log(`\n>> ${message}\nFAILED: ${error.message}`);
      }
    }
  }

  if (failures) {
    console.log('\n========== SUMMARY ==========');
    for (const row of failureRows) {
      console.log(`- [${row.name}] ${row.message}: ${row.issues.join('; ')}`);
    }
    throw new Error(`${failures} CRM AI battery failure(s)`);
  }
  console.log('\nAll CRM AI battery queries passed');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
