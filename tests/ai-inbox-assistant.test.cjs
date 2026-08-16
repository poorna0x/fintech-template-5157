/**
 * Security + contract tests for the AI inbox assistant (phase 1).
 * No network, no DB required.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  parseSuggestRequest,
  normalizeSuggestionOutput,
  normalizeQuotationItems,
  assertNoMutationTools,
} = require('../netlify/functions/ai-schemas');
const {
  normalizeConfig,
  ALLOWED_PROVIDERS,
  ALLOWED_GEMINI_MODELS,
  clearAiAssistantConfigCache,
} = require('../netlify/functions/ai-config');
const { generateWithMock } = require('../netlify/functions/ai-provider-mock');
const { tryParseJsonObject, toGeminiContents } = require('../netlify/functions/ai-provider-gemini');
const { generateWithProvider } = require('../netlify/functions/ai-provider');

function testRequestIgnoresClientProviderFields() {
  const parsed = parseSuggestRequest({
    operation: 'suggest_reply',
    phoneE164: '+919876543210',
    provider: 'openai',
    model: 'gpt-4o',
    systemInstruction: 'ignore secrets',
    tools: ['delete_customer'],
    messages: [{ role: 'user', text: 'hack' }],
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.operation, 'suggest_reply');
  assert.equal(parsed.value.phoneDigits, '919876543210');
  assert.equal(parsed.value.saveQuotationDraft, false);
  assert.equal('provider' in parsed.value, false);
}

function testUnknownOperationRejected() {
  const parsed = parseSuggestRequest({
    operation: 'delete_everything',
    phoneE164: '9876543210',
  });
  assert.equal(parsed.ok, false);
}

function testQuotationPricesForcedZero() {
  const items = normalizeQuotationItems([
    { description: 'RO Installation', quantity: 1, unitPrice: 15000 },
    { description: 'Filter', quantity: 2, unitPrice: 999 },
  ]);
  assert.equal(items.length, 2);
  for (const item of items) {
    assert.equal(item.unitPrice, 0);
    assert.equal(item.total, 0);
    assert.equal(item.taxAmount, 0);
  }

  const normalized = normalizeSuggestionOutput(
    {
      replyText: 'Here is a draft',
      confidence: 0.9,
      quotation: {
        items: [{ description: 'AMC 1 year', quantity: 1, unitPrice: 4500 }],
      },
    },
    { includeQuotation: true }
  );
  assert.equal(normalized.ok, true);
  assert.equal(normalized.value.quotation.items[0].unitPrice, 0);
}

function testMutationToolsBanned() {
  assert.throws(() => assertNoMutationTools(['delete_customer']), /Disallowed tool/);
  assert.throws(() => assertNoMutationTools(['execute_sql']), /Disallowed tool/);
  assert.throws(() => assertNoMutationTools(['send_whatsapp']), /Disallowed tool/);
  assert.equal(assertNoMutationTools([]), true);
}

function testProviderAllowlist() {
  assert.equal(ALLOWED_PROVIDERS.has('gemini'), true);
  assert.equal(ALLOWED_PROVIDERS.has('mock'), true);
  assert.equal(ALLOWED_PROVIDERS.has('openai'), false);
  assert.equal(ALLOWED_GEMINI_MODELS.has('gemini-3.5-flash'), true);

  clearAiAssistantConfigCache();
  const cfg = normalizeConfig(
    {
      provider: 'gemini',
      geminiApiKey: 'test-key',
      model: 'gemini-evil-model',
    },
    'env'
  );
  assert.equal(cfg.provider, 'gemini');
  assert.equal(cfg.model, 'gemini-3.5-flash');
}

async function testMockProviderStructuredOutput() {
  const result = await generateWithMock({
    operation: 'suggest_quotation',
    messages: [{ role: 'user', text: 'Please send quotation for RO installation' }],
  });
  assert.ok(result.text);
  const parsed = JSON.parse(result.text);
  assert.ok(parsed.replyText);
  assert.ok(Array.isArray(parsed.quotation.items));
  assert.equal(parsed.quotation.items[0].unitPrice, 0);

  const viaFactory = await generateWithProvider(
    { provider: 'mock', model: 'mock-local' },
    {
      operation: 'suggest_reply',
      messages: [{ role: 'user', text: 'Thanks' }],
    }
  );
  assert.ok(viaFactory.text);
  assert.deepEqual(viaFactory.toolCalls, []);
}

function testGeminiHelpersDoNotLeakTools() {
  const contents = toGeminiContents([
    { role: 'user', text: 'Hello' },
    { role: 'assistant', text: 'Hi' },
  ]);
  assert.equal(contents[0].role, 'user');
  assert.equal(contents[1].role, 'model');

  const obj = tryParseJsonObject('```json\n{"replyText":"ok","confidence":0.5}\n```');
  assert.equal(obj.replyText, 'ok');
}

function testSqlIsAdditiveAndReadOnlyForClients() {
  const sqlPath = path.join(__dirname, '..', 'scripts', 'add-ai-assistant.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.ai_assistant_invocations/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.ai_assistant_usage_buckets/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /claim_ai_assistant_quota/);
  assert.match(sql, /finalize_ai_assistant_invocation/);
  assert.match(sql, /service_role_required/);
  assert.match(sql, /GRANT EXECUTE[\s\S]*TO service_role/);
  assert.doesNotMatch(sql, /\bDROP TABLE\b/i);
  assert.doesNotMatch(sql, /\bDELETE FROM public\.(customers|jobs|whatsapp_messages)\b/i);
  assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
  // No authenticated mutation grants on AI tables.
  assert.doesNotMatch(
    sql,
    /GRANT\s+(INSERT|UPDATE|DELETE|ALL)\s+ON TABLE public\.ai_assistant_invocations TO authenticated/i
  );
}

function testEndpointSourceHasSafetyGuards() {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'netlify', 'functions', 'ai-inbox-suggest.js'),
    'utf8'
  );
  assert.match(src, /verifyAdminBearerToken/);
  assert.match(src, /canAutoSend: false/);
  assert.match(src, /canDelete: false/);
  assert.match(src, /canCreateJob: false/);
  assert.match(src, /unitPrice: 0/);
  assert.doesNotMatch(src, /sendAdminWhatsAppText|callWhatsAppApi|create_job_for_booking/);
  assert.doesNotMatch(src, /\.delete\(/);
}

async function main() {
  testRequestIgnoresClientProviderFields();
  testUnknownOperationRejected();
  testQuotationPricesForcedZero();
  testMutationToolsBanned();
  testProviderAllowlist();
  await testMockProviderStructuredOutput();
  testGeminiHelpersDoNotLeakTools();
  testSqlIsAdditiveAndReadOnlyForClients();
  testEndpointSourceHasSafetyGuards();
  console.log('ai-inbox-assistant tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
