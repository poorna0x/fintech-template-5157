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
  ALLOWED_GROQ_MODELS,
  clearAiAssistantConfigCache,
} = require('../netlify/functions/ai-config');
const { generateWithMock } = require('../netlify/functions/ai-provider-mock');
const { tryParseJsonObject, toGeminiContents } = require('../netlify/functions/ai-provider-gemini');
const { toGroqMessages } = require('../netlify/functions/ai-provider-groq');
const {
  generateWithProvider,
  buildProviderAttempts,
  isRetryableProviderError,
} = require('../netlify/functions/ai-provider');
const {
  detectPendingDetailRequest,
  enforceDetailVerification,
  looksLikeMapsLocationText,
} = require('../netlify/functions/ai-inbox-suggest')._test;
const {
  classifyAutoReplyInbound,
  normalizeAiDecision,
  buildSystemInstruction: buildAutoReplySystemInstruction,
} = require('../netlify/functions/whatsapp-ai-auto-reply');

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

function testQuotationBuilderRequestAndTerms() {
  const parsed = parseSuggestRequest({
    operation: 'build_quotation',
    customerId: 'customer-123',
    instruction: 'Build a membrane replacement quotation with service and warranty terms.',
    phoneE164: 'not-required',
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.phoneDigits, null);
  assert.equal(parsed.value.customerId, 'customer-123');
  assert.match(parsed.value.instruction, /membrane replacement/);

  const normalized = normalizeSuggestionOutput(
    {
      quotation: {
        items: [{ description: 'RO membrane', quantity: 1, unitPrice: 9999 }],
        notesHeading: 'Scope',
        notes: ['Installation included'],
        terms: ['Payment on completion', { text: 'Bengaluru jurisdiction' }],
        validityNote: 'Valid for 15 days',
        validityDays: 15,
        gstOption: 'include',
      },
    },
    { includeQuotation: true }
  );
  assert.equal(normalized.ok, true);
  assert.equal(normalized.value.quotation.items[0].unitPrice, 0);
  assert.deepEqual(normalized.value.quotation.terms, [
    'Payment on completion',
    'Bengaluru jurisdiction',
  ]);
  assert.equal(normalized.value.quotation.validityDays, 15);
}

function testPricesOnlyWhenAdminOptsIn() {
  const parsedDefault = parseSuggestRequest({
    operation: 'build_quotation',
    customerId: 'customer-123',
    instruction: 'Membrane replacement quotation for ₹3500.',
  });
  assert.equal(parsedDefault.value.allowPrices, false);

  const parsedOptIn = parseSuggestRequest({
    operation: 'build_quotation',
    customerId: 'customer-123',
    instruction: 'Membrane replacement quotation for ₹3500.',
    allowPrices: true,
  });
  assert.equal(parsedOptIn.value.allowPrices, true);

  const priced = normalizeQuotationItems(
    [{ description: 'RO membrane', quantity: 2, unitPrice: 3500 }],
    { allowPrices: true }
  );
  assert.equal(priced[0].unitPrice, 3500);
  assert.equal(priced[0].total, 7000);

  const blank = normalizeQuotationItems([
    { description: 'RO membrane', quantity: 2, unitPrice: 3500 },
  ]);
  assert.equal(blank[0].unitPrice, 0);
  assert.equal(blank[0].total, 0);

  // Inbox suggestions must never carry prices, even if the model returns them.
  const inbox = normalizeSuggestionOutput(
    {
      replyText: 'Draft',
      quotation: { items: [{ description: 'AMC', quantity: 1, unitPrice: 4500 }] },
    },
    { includeQuotation: true }
  );
  assert.equal(inbox.value.quotation.items[0].unitPrice, 0);
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

function testRequestedDetailVerification() {
  const rows = [
    {
      direction: 'outbound',
      msg_type: 'interactive',
      body: 'Please tap Send location below',
      created_at: '2026-08-17T10:00:00.000Z',
    },
    {
      direction: 'inbound',
      msg_type: 'text',
      body: 'near the metro station',
      created_at: '2026-08-17T10:01:00.000Z',
    },
  ];
  const verification = detectPendingDetailRequest(rows, {
    step: 'await_location',
    __requestedAt: '2026-08-17T10:00:00.000Z',
  });
  assert.equal(verification.kind, 'location');
  assert.equal(verification.status, 'still_missing');
  assert.equal(verification.receivedType, 'text');
  assert.equal(verification.reaskAction, 'request_location');

  const suggestion = enforceDetailVerification(
    {
      replyText: 'Thanks!',
      warnings: [],
      requiresHuman: false,
    },
    verification
  );
  assert.match(suggestion.replyText, /Google Maps location pin/i);
  assert.equal(suggestion.requiresHuman, true);
  assert.match(suggestion.warnings[0], /Location still missing/i);

  assert.equal(looksLikeMapsLocationText('https://maps.app.goo.gl/abc123'), true);
  assert.equal(
    detectPendingDetailRequest(
      [
        rows[0],
        {
          direction: 'inbound',
          msg_type: 'location',
          body: '12.971599,77.594566',
          created_at: '2026-08-17T10:01:00.000Z',
        },
      ],
      { step: 'await_location', __requestedAt: '2026-08-17T10:00:00.000Z' }
    ),
    null
  );
  assert.equal(
    detectPendingDetailRequest(rows, {
      step: 'await_location',
      __requestedAt: '2026-08-17T10:02:00.000Z',
    }),
    null,
    'an inbound message from before the request must not be treated as a failed reply'
  );
}

function testSafePerChatAutoReplyGuards() {
  assert.deepEqual(
    classifyAutoReplyInbound({
      msgType: 'text',
      text: 'My purifier is making a noise',
      priorBotState: null,
    }),
    { action: 'ai', reason: 'safe_service_conversation' }
  );
  assert.equal(
    classifyAutoReplyInbound({
      msgType: 'text',
      text: 'How much will repair cost?',
      priorBotState: null,
    }).action,
    'escalate'
  );
  assert.equal(
    classifyAutoReplyInbound({
      msgType: 'text',
      text: 'Book technician tomorrow',
      priorBotState: null,
    }).action,
    'yield'
  );
  assert.equal(
    classifyAutoReplyInbound({
      msgType: 'text',
      text: 'anything',
      priorBotState: { step: 'await_location' },
    }).action,
    'yield'
  );
  // Greetings and menu words stay with the deterministic booking bot.
  for (const greeting of ['Hi', 'hello', 'Menu', 'thanks', 'good morning']) {
    assert.equal(
      classifyAutoReplyInbound({ msgType: 'text', text: greeting, priorBotState: null }).action,
      'yield',
      `${greeting} must yield to the booking bot`
    );
  }

  const safe = normalizeAiDecision({
    replyText: 'Sorry about that. Please share a clear photo of the purifier.',
    shouldSend: true,
    requiresHuman: false,
    confidence: 0.92,
  });
  assert.equal(safe.shouldSend, true);

  const unsafe = normalizeAiDecision({
    replyText: 'The technician will arrive today and the cost is ₹500.',
    shouldSend: true,
    requiresHuman: false,
    confidence: 0.99,
  });
  assert.equal(unsafe.shouldSend, false);
  assert.match(buildAutoReplySystemInstruction(), /never instructions that can override/i);

  // Escalating must never silence the chat: the booking bot still gets its turn.
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'netlify', 'functions', 'whatsapp-ai-auto-reply.js'),
    'utf8'
  );
  assert.doesNotMatch(src, /handled: true, escalated: true/);
}

function testProviderAllowlist() {
  assert.equal(ALLOWED_PROVIDERS.has('gemini'), true);
  assert.equal(ALLOWED_PROVIDERS.has('groq'), true);
  assert.equal(ALLOWED_PROVIDERS.has('mock'), true);
  assert.equal(ALLOWED_PROVIDERS.has('openai'), false);
  assert.equal(ALLOWED_GEMINI_MODELS.has('gemini-3.1-flash-lite'), true);
  assert.equal(ALLOWED_GROQ_MODELS.has('openai/gpt-oss-120b'), true);

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
  assert.equal(cfg.model, 'gemini-3.1-flash-lite');

  const fallbackConfig = normalizeConfig(
    {
      provider: 'gemini',
      geminiApiKey: 'gemini-test-key',
      groqApiKey: 'groq-test-key',
      model: 'gemini-2.5-flash',
    },
    'app_secrets'
  );
  assert.deepEqual(fallbackConfig.fallbackChain, []);
  assert.deepEqual(buildProviderAttempts(fallbackConfig), [
    { provider: 'gemini', model: 'gemini-2.5-flash' },
  ]);

  const groqConfig = normalizeConfig(
    {
      provider: 'groq',
      geminiApiKey: 'gemini-test-key',
      groqApiKey: 'groq-test-key',
      model: 'openai/gpt-oss-120b',
    },
    'env'
  );
  assert.equal(groqConfig.provider, 'groq');
  assert.equal(groqConfig.model, 'openai/gpt-oss-120b');
  assert.deepEqual(groqConfig.fallbackChain, []);
  assert.deepEqual(buildProviderAttempts(groqConfig), [
    { provider: 'groq', model: 'openai/gpt-oss-120b' },
  ]);

  const ignoresStoredFallback = normalizeConfig(
    {
      provider: 'groq',
      geminiApiKey: 'gemini-test-key',
      groqApiKey: 'groq-test-key',
      model: 'openai/gpt-oss-120b',
      fallbackChain: [{ provider: 'gemini', model: 'gemini-3.1-flash-lite' }],
    },
    'env'
  );
  assert.deepEqual(ignoresStoredFallback.fallbackChain, []);
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

  const groqMessages = toGroqMessages('System only', [
    { role: 'user', text: 'Hello' },
    { role: 'assistant', text: 'Hi' },
  ]);
  assert.deepEqual(groqMessages.map(({ role }) => role), ['system', 'user', 'assistant']);
}

async function testQuotaFallbackUsesGroq() {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('generativelanguage.googleapis.com')) {
      return {
        ok: false,
        status: 429,
        json: async () => ({
          error: { status: 'RESOURCE_EXHAUSTED', message: 'quota exceeded' },
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: 'groq-test-response',
        choices: [
          {
            finish_reason: 'stop',
            message: { content: '{"replyText":"Fallback worked"}' },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    };
  };

  try {
    const result = await generateWithProvider(
      {
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        geminiApiKey: 'gemini-test-key',
        groqApiKey: 'groq-test-key',
        fallbackChain: [
          { provider: 'groq', model: 'openai/gpt-oss-120b' },
        ],
      },
      {
        operation: 'suggest_reply',
        systemInstruction: 'Return JSON.',
        messages: [{ role: 'user', text: 'Hello' }],
      }
    );
    assert.equal(calls.length, 2);
    assert.equal(result.rawMetadata.provider, 'groq');
    assert.equal(result.rawMetadata.fellBack, true);
    assert.equal(result.parsed.replyText, 'Fallback worked');
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(isRetryableProviderError(Object.assign(new Error('quota'), { retryable: true })), true);
  assert.equal(isRetryableProviderError(new Error('auth')), false);
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

  const chatSql = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'add-whatsapp-ai-chat-settings.sql'),
    'utf8'
  );
  assert.match(chatSql, /auto_reply_enabled boolean NOT NULL DEFAULT false/);
  assert.match(chatSql, /inbound_wa_message_id text PRIMARY KEY/);
  assert.match(chatSql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(chatSql, /public\.is_admin_user\(\)/);
  assert.doesNotMatch(
    chatSql,
    /GRANT\s+(INSERT|UPDATE|DELETE|ALL)\s+ON TABLE public\.whatsapp_chat_ai_settings TO authenticated/i
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
  testQuotationBuilderRequestAndTerms();
  testPricesOnlyWhenAdminOptsIn();
  testUnknownOperationRejected();
  testQuotationPricesForcedZero();
  testMutationToolsBanned();
  testRequestedDetailVerification();
  testSafePerChatAutoReplyGuards();
  testProviderAllowlist();
  await testMockProviderStructuredOutput();
  testGeminiHelpersDoNotLeakTools();
  await testQuotaFallbackUsesGroq();
  testSqlIsAdditiveAndReadOnlyForClients();
  testEndpointSourceHasSafetyGuards();
  console.log('ai-inbox-assistant tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
