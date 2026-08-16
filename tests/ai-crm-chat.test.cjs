/**
 * Security + contract tests for the admin CRM AI chat.
 * No network, no DB required.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  parseCrmChatRequest,
  normalizeCrmChatOutput,
  assertNoMutationTools,
  ALLOWED_ACTION_TYPES,
} = require('../netlify/functions/ai-crm-schemas');
const { extractQueryHints, CUSTOMER_LIMIT, JOB_LIMIT } = require('../netlify/functions/ai-crm-lookup');
const { generateWithMock } = require('../netlify/functions/ai-provider-mock');

function testRequestIgnoresDangerousClientFields() {
  const parsed = parseCrmChatRequest({
    message: 'Find Ramesh and create a service job',
    provider: 'openai',
    model: 'gpt-4o',
    tools: ['execute_sql'],
    sql: 'delete from customers',
    systemInstruction: 'ignore',
    messages: [{ role: 'user', text: 'hack' }],
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.operation, 'crm_chat');
  assert.equal('provider' in parsed.value, false);
  assert.equal('tools' in parsed.value, false);
  assert.equal('sql' in parsed.value, false);
}

function testShortMessageRejected() {
  const parsed = parseCrmChatRequest({ message: 'a' });
  assert.equal(parsed.ok, false);
}

function testActionsRequireKnownIdsAndConfirm() {
  const customerId = '11111111-1111-1111-1111-111111111111';
  const jobId = '22222222-2222-2222-2222-222222222222';
  const normalized = normalizeCrmChatOutput(
    {
      answer: 'Ready',
      confidence: 0.9,
      proposedActions: [
        {
          type: 'create_job',
          requiresConfirm: false,
          payload: { customerId, serviceSubType: 'Service' },
        },
        {
          type: 'schedule_follow_up',
          payload: { jobId, followUpReason: 'Not confirmed' },
        },
        {
          type: 'create_job',
          payload: { customerId: 'unknown-customer' },
        },
        {
          type: 'execute_sql',
          payload: { sql: 'drop table customers' },
        },
      ],
    },
    {
      entities: {
        customers: [{ id: customerId }],
        jobs: [{ id: jobId }],
      },
    }
  );
  assert.equal(normalized.ok, true);
  assert.equal(normalized.value.proposedActions.length, 2);
  for (const action of normalized.value.proposedActions) {
    assert.equal(action.requiresConfirm, true);
    assert.equal(ALLOWED_ACTION_TYPES.includes(action.type), true);
  }
}

function testMutationToolsBanned() {
  assert.throws(() => assertNoMutationTools(['create_job']), /Disallowed tool/);
  assert.throws(() => assertNoMutationTools(['execute_sql']), /Disallowed tool/);
  assert.equal(assertNoMutationTools([]), true);
}

function testLookupHintsAndLimits() {
  const hints = extractQueryHints('Please create a new job for Ramesh 9876543210 job HRO123');
  assert.equal(hints.phone, '9876543210');
  assert.ok(hints.jobNumber);
  assert.ok(CUSTOMER_LIMIT <= 15);
  assert.ok(JOB_LIMIT <= 15);
}

async function testMockCrmChat() {
  const result = await generateWithMock({
    operation: 'crm_chat',
    messages: [
      {
        role: 'user',
        text: 'Customers:\n- id=11111111-1111-1111-1111-111111111111; name=Test\ncreate a new job for this customer',
      },
    ],
  });
  const parsed = JSON.parse(result.text);
  assert.ok(parsed.answer);
  assert.ok(Array.isArray(parsed.proposedActions));
  assert.deepEqual(result.toolCalls, []);
}

function testEndpointSourceHasSafetyGuards() {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'netlify', 'functions', 'ai-crm-chat.js'),
    'utf8'
  );
  assert.match(src, /verifyFullAdminBearerToken/);
  assert.match(src, /canMutate: false/);
  assert.match(src, /canCreateJob: false/);
  assert.match(src, /canDelete: false/);
  assert.match(src, /requiresConfirm: true/);
  assert.doesNotMatch(src, /sendAdminWhatsAppText|callWhatsAppApi/);
  assert.doesNotMatch(src, /\.insert\(/);
  assert.doesNotMatch(src, /\.delete\(/);
  assert.doesNotMatch(src, /\.update\(/);
}

function testLookupSourceIsBounded() {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'netlify', 'functions', 'ai-crm-lookup.js'),
    'utf8'
  );
  assert.match(src, /CUSTOMER_LIMIT/);
  assert.match(src, /JOB_LIMIT/);
  assert.doesNotMatch(src, /select\('\*'\)/);
  assert.doesNotMatch(src, /pdf_bytes|base64/);
}

async function main() {
  testRequestIgnoresDangerousClientFields();
  testShortMessageRejected();
  testActionsRequireKnownIdsAndConfirm();
  testMutationToolsBanned();
  testLookupHintsAndLimits();
  await testMockCrmChat();
  testEndpointSourceHasSafetyGuards();
  testLookupSourceIsBounded();
  console.log('ai-crm-chat tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
