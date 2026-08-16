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
const {
  extractQueryHints,
  detectOverviewIntent,
  addDaysKey,
  CUSTOMER_LIMIT,
  JOB_LIMIT,
  OVERVIEW_JOB_LIMIT,
} = require('../netlify/functions/ai-crm-lookup');
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
  assert.deepEqual(hints.nameTokens, ['Ramesh']);
  assert.ok(CUSTOMER_LIMIT <= 15);
  assert.ok(JOB_LIMIT <= 15);
}

function testNameSurvivesActionSentences() {
  const hints = extractQueryHints(
    'Find poorna and add job for tommrow 10 am it has leakage issue need to change pre filter agrred for 1500'
  );
  assert.equal(hints.nameHint, 'poorna');
  assert.equal(hints.nameTokens[0], 'poorna');
  // Operational chatter must never become a search term.
  for (const noise of ['job', 'leakage', 'filter', 'tommrow']) {
    assert.equal(hints.nameTokens.includes(noise), false);
  }

  const opsOnly = extractQueryHints('how many jobs are pending today');
  assert.deepEqual(opsOnly.nameTokens, []);
}

function testJobDraftTimeNormalization() {
  const customerId = '11111111-1111-1111-1111-111111111111';
  const known = { entities: { customers: [{ id: customerId }], jobs: [] } };

  const clock = normalizeCrmChatOutput(
    {
      answer: 'ok',
      proposedActions: [
        {
          type: 'create_job',
          payload: { customerId, scheduledTimeSlot: '10:00 AM', scheduledDate: '2026-08-17' },
        },
      ],
    },
    known
  );
  const clockPayload = clock.value.proposedActions[0].payload;
  assert.equal(clockPayload.scheduledTimeSlot, 'CUSTOM');
  assert.equal(clockPayload.scheduledTimeCustom, '10:00');

  const named = normalizeCrmChatOutput(
    {
      answer: 'ok',
      proposedActions: [
        { type: 'create_job', payload: { customerId, scheduledTimeSlot: 'afternoon' } },
      ],
    },
    known
  );
  assert.equal(named.value.proposedActions[0].payload.scheduledTimeSlot, 'AFTERNOON');
  assert.equal(named.value.proposedActions[0].payload.scheduledTimeCustom, null);

  const junk = normalizeCrmChatOutput(
    {
      answer: 'ok',
      proposedActions: [
        { type: 'create_job', payload: { customerId, scheduledTimeSlot: 'whenever' } },
      ],
    },
    known
  );
  assert.equal(junk.value.proposedActions[0].payload.scheduledTimeSlot, null);
}

function testOverviewIntentDetection() {
  const today = '2026-08-16';

  const todayJobs = detectOverviewIntent("show today's jobs", today);
  assert.equal(todayJobs.active, true);
  assert.equal(todayJobs.scopes.has('jobs'), true);
  assert.equal(todayJobs.range.start, today);
  assert.equal(todayJobs.range.end, today);

  const tomorrow = detectOverviewIntent('what is scheduled tomorrow', today);
  assert.equal(tomorrow.range.start, addDaysKey(today, 1));

  const followUps = detectOverviewIntent('follow ups pending', today);
  assert.deepEqual(followUps.statuses, ['FOLLOW_UP']);
  assert.equal(followUps.scopes.has('jobs'), true);

  const payments = detectOverviewIntent('pending payments', today);
  assert.equal(payments.scopes.has('payments'), true);

  const week = detectOverviewIntent('reminders due this week', today);
  assert.equal(week.range.end, addDaysKey(today, 6));

  const overdue = detectOverviewIntent('overdue reminders', today);
  assert.equal(overdue.range.start, null);
  assert.equal(overdue.range.end, addDaysKey(today, -1));

  // A plain person lookup must not turn into an operational sweep.
  const nameOnly = detectOverviewIntent('find Ramesh 9876543210', today);
  assert.equal(nameOnly.active, false);

  assert.ok(OVERVIEW_JOB_LIMIT <= 25);
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
  testNameSurvivesActionSentences();
  testJobDraftTimeNormalization();
  testOverviewIntentDetection();
  await testMockCrmChat();
  testEndpointSourceHasSafetyGuards();
  testLookupSourceIsBounded();
  console.log('ai-crm-chat tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
