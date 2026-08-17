/**
 * Contract tests for AI usage stats + model save allowlists.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  ALLOWED_PROVIDERS,
  ALLOWED_GEMINI_MODELS,
  ALLOWED_GROQ_MODELS,
  listSelectableModels,
  publicConfigSummary,
  clearAiAssistantConfigCache,
} = require('../netlify/functions/ai-config');
const { aggregateRows, emptyPeriod } = require('../netlify/functions/ai-usage')._test;
const { localDayKey, monthStartDayKey } = require('../netlify/functions/ai-audit');

function testAllowlistsExposeNoSecrets() {
  assert.equal(ALLOWED_PROVIDERS.has('groq'), true);
  assert.equal(ALLOWED_GEMINI_MODELS.has('gemini-2.5-flash'), true);
  assert.equal(ALLOWED_GROQ_MODELS.has('openai/gpt-oss-120b'), true);

  const selectable = listSelectableModels();
  assert.ok(selectable.providers.includes('gemini'));
  assert.ok(selectable.models.groq.includes('openai/gpt-oss-120b'));

  const summary = publicConfigSummary({
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    geminiApiKey: 'secret-gemini',
    groqApiKey: 'secret-groq',
    fallbackChain: [{ provider: 'gemini', model: 'gemini-3.1-flash-lite' }],
    dailyRequestLimit: 80,
    dailyTokenLimit: 200000,
  });
  assert.equal(summary.provider, 'groq');
  assert.equal(summary.model, 'openai/gpt-oss-120b');
  assert.equal(summary.geminiConfigured, true);
  assert.equal(summary.groqConfigured, true);
  assert.equal(summary.providerFreeTiers?.rpd, 1000);
  assert.equal(summary.providerFreeTiers?.tpd, 200000);
  assert.equal(summary.providerFreeTiers?.rpm, 30);
  assert.match(String(summary.providerFreeTiers?.resetNote || ''), /midnight UTC/i);
  assert.equal('geminiApiKey' in summary, false);
  assert.equal('groqApiKey' in summary, false);
  assert.equal(JSON.stringify(summary).includes('secret'), false);
}

function testAggregationAndIstDay() {
  clearAiAssistantConfigCache();
  const day = localDayKey();
  assert.match(day, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(monthStartDayKey().endsWith('-01'), true);

  const rows = [
    {
      status: 'ok',
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      operation: 'crm_chat',
      input_tokens: 10,
      output_tokens: 5,
      fell_back: true,
      error_category: null,
    },
    {
      status: 'error',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      operation: 'document_draft',
      input_tokens: 2,
      output_tokens: 0,
      fell_back: false,
      error_category: 'provider_error',
    },
  ];
  const period = aggregateRows(rows, { fallbackTracked: true });
  assert.equal(period.requests, 2);
  assert.equal(period.ok, 1);
  assert.equal(period.error, 1);
  assert.equal(period.fallbackCount, 1);
  assert.equal(period.inputTokens, 12);
  assert.equal(period.byModel[0].count, 1);
  assert.equal(emptyPeriod().requests, 0);
}

function testEndpointSourceGuards() {
  const usageSrc = fs.readFileSync(
    path.join(__dirname, '..', 'netlify', 'functions', 'ai-usage.js'),
    'utf8'
  );
  assert.match(usageSrc, /verifyFullAdminBearerToken/);
  assert.doesNotMatch(usageSrc, /geminiApiKey|groqApiKey/);
  assert.doesNotMatch(usageSrc, /prompt_hash|response_hash/);

  const saveSrc = fs.readFileSync(
    path.join(__dirname, '..', 'netlify', 'functions', 'ai-config-save.js'),
    'utf8'
  );
  assert.match(saveSrc, /verifyFullAdminBearerToken/);
  assert.match(saveSrc, /Invalid fields/);
  assert.match(saveSrc, /saveAiAssistantModelSelection/);

  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'add-ai-assistant-usage-fallback.sql'),
    'utf8'
  );
  assert.match(sql, /fell_back/);
  assert.match(sql, /p_provider/);
  assert.match(sql, /service_role/);
  assert.doesNotMatch(sql, /\bDROP TABLE\b/i);
}

function testSettingsPanelRegistered() {
  const urlSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'lib', 'settingsUrl.ts'),
    'utf8'
  );
  assert.match(urlSrc, /'ai-usage'/);
  const managerSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'lib', 'managerAccess.ts'),
    'utf8'
  );
  assert.match(managerSrc, /'ai-usage'/);
}

function main() {
  testAllowlistsExposeNoSecrets();
  testAggregationAndIstDay();
  testEndpointSourceGuards();
  testSettingsPanelRegistered();
  console.log('ai-usage tests passed');
}

main();
