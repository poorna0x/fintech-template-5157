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
  hasSearchableTarget,
  detectOverviewIntent,
  detectCustomerValueRanking,
  detectTechnicianBillingRanking,
  formatContextForPrompt,
  resolveCompletedJobValue,
  addDaysKey,
  CUSTOMER_LIMIT,
  JOB_LIMIT,
  OVERVIEW_JOB_LIMIT,
  TOP_CUSTOMER_LIMIT,
  TOP_TECHNICIAN_LIMIT,
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

function testGreetingsDoNotSearchTheCrm() {
  for (const greeting of ['hi', 'hello', 'hey there', 'thanks', 'what can you do']) {
    const hints = extractQueryHints(greeting);
    assert.equal(
      hasSearchableTarget(hints, null),
      false,
      `"${greeting}" must not trigger a CRM search`
    );
    assert.equal(detectOverviewIntent(greeting, '2026-08-17').active, false);
  }

  // Partial phones and customer/job codes must still search.
  assert.equal(hasSearchableTarget(extractQueryHints('9880693'), null), true);
  assert.equal(hasSearchableTarget(extractQueryHints('C1730'), null), true);
  assert.equal(hasSearchableTarget(extractQueryHints('find Ramesh'), null), true);
  assert.equal(hasSearchableTarget(extractQueryHints('hi'), 'customer-uuid'), true);

  const context = formatContextForPrompt({
    customers: [],
    jobs: [],
    reminders: [],
    payments: [],
    documents: [],
    technicians: [],
    stats: { today: '2026-08-17' },
    truncated: {},
    intent: { scopes: [], statuses: null, range: { label: 'today' } },
    noLookup: true,
  });
  assert.match(context, /No CRM lookup was performed/);
  assert.doesNotMatch(context, /Customers:/);
  assert.doesNotMatch(context, /Jobs:/);
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

function testCustomerDraftActionsAreReviewOnlyAndBounded() {
  const customerId = '11111111-1111-1111-1111-111111111111';
  const normalized = normalizeCrmChatOutput(
    {
      answer: 'Drafts ready',
      confidence: 0.95,
      proposedActions: [
        {
          type: 'create_customer',
          requiresConfirm: false,
          payload: {
            fullName: 'Ramesh',
            phone: '+91 98765 43210',
            visibleAddress: 'HSR Layout',
            googleLocation: 'https://maps.app.goo.gl/example',
            unknownAdminField: 'must be removed',
          },
        },
        {
          type: 'create_customer_and_job',
          payload: {
            fullName: 'Suresh',
            phone: '9988776655',
            serviceType: 'RO',
            serviceSubType: 'Leakage',
            scheduledTimeSlot: '10 am',
          },
        },
        {
          type: 'edit_customer',
          payload: {
            customerId,
            patch: { visibleAddress: 'Site 2', notes: 'Call before visit', is_admin: true },
          },
        },
        {
          type: 'edit_customer',
          payload: { customerId: 'unknown', patch: { fullName: 'Bad edit' } },
        },
        {
          type: 'delete_customer',
          payload: { customerId },
        },
      ],
    },
    { entities: { customers: [{ id: customerId }], jobs: [] } }
  );

  assert.equal(normalized.ok, true);
  assert.equal(normalized.value.proposedActions.length, 3);
  assert.equal(normalized.value.proposedActions[0].requiresConfirm, true);
  assert.equal(normalized.value.proposedActions[0].payload.phone, '9876543210');
  assert.equal('unknownAdminField' in normalized.value.proposedActions[0].payload, false);
  assert.equal(
    normalized.value.proposedActions[1].payload.scheduledTimeSlot,
    'CUSTOM'
  );
  assert.deepEqual(normalized.value.proposedActions[2].payload.patch, {
    visibleAddress: 'Site 2',
    notes: 'Call before visit',
  });
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

function testLifetimeCustomerValueRankingIntent() {
  const question = 'which customer has paid us the most in this entire thing';
  assert.equal(detectCustomerValueRanking(question), true);
  const intent = detectOverviewIntent(question, '2026-08-17');
  assert.equal(intent.active, true);
  assert.equal(intent.scopes.has('customer_value_ranking'), true);
  assert.ok(TOP_CUSTOMER_LIMIT <= 10);
  assert.equal(resolveCompletedJobValue({ payment_amount: 0, actual_cost: 2400 }), 2400);
  assert.equal(resolveCompletedJobValue({ payment_amount: 1800, actual_cost: 2400 }), 1800);

  const context = formatContextForPrompt({
    customers: [
      {
        id: 'customer-1',
        customerCode: 'C001',
        name: 'Top Customer',
        phone: '9999999999',
        confirmedPaidTotal: 12000,
        billedTotal: 15000,
        fullyPaidJobs: 4,
        completedJobs: 5,
      },
    ],
    jobs: [],
    reminders: [],
    payments: [],
    documents: [],
    stats: {
      today: '2026-08-17',
      customerValueRankingPeriod: 'lifetime',
      customerValueRankingBasis:
        'confirmed paid counts PAID jobs; billed may include unpaid work',
      customerValueRanking: [
        {
          rank: 1,
          customerId: 'customer-1',
          customerCode: 'C001',
          name: 'Top Customer',
          phone: '9999999999',
          confirmedPaidTotal: 12000,
          billedTotal: 15000,
          fullyPaidJobs: 4,
          completedJobs: 5,
        },
      ],
    },
    truncated: {},
    intent: {
      scopes: ['customer_value_ranking'],
      statuses: null,
      range: { start: '2026-08-17', end: '2026-08-17', label: 'today' },
    },
  });
  assert.match(context, /period = lifetime/);
  assert.match(context, /confirmedFullyPaidINR=12000/);
  assert.match(context, /completedJobBilledINR=15000/);
}

function testTechnicianBillingRankingIntentIsNarrow() {
  const question = 'Which tehcncian did highest billing today';
  assert.equal(detectTechnicianBillingRanking(question), true);
  assert.equal(detectCustomerValueRanking(question), false);

  const intent = detectOverviewIntent(question, '2026-08-17');
  assert.deepEqual([...intent.scopes], ['technician_billing_ranking']);
  assert.equal(intent.range.label, 'today');
  assert.ok(TOP_TECHNICIAN_LIMIT <= 10);

  const context = formatContextForPrompt({
    customers: [],
    jobs: [],
    reminders: [],
    payments: [],
    documents: [],
    technicians: [
      {
        technicianId: 'tech-1',
        employeeId: 'T001',
        name: 'Ravi',
        billedTotal: 12500,
        completedJobs: 4,
      },
    ],
    stats: {
      today: '2026-08-17',
      technicianBillingPeriod: 'today',
      technicianBillingBasis: 'completed job billing',
      technicianBillingRanking: [
        {
          rank: 1,
          technicianId: 'tech-1',
          employeeId: 'T001',
          name: 'Ravi',
          billedTotal: 12500,
          completedJobs: 4,
        },
      ],
    },
    truncated: {},
    intent: {
      scopes: ['technician_billing_ranking'],
      statuses: null,
      range: { start: '2026-08-17', end: '2026-08-17', label: 'today' },
    },
  });
  assert.match(context, /Technician billing ranking \(today/);
  assert.match(context, /name=Ravi/);
  assert.match(context, /completedJobBilledINR=12500/);
  assert.doesNotMatch(context, /Customers: \(none matched\)/);
  assert.doesNotMatch(context, /Jobs: \(none matched\)/);
  assert.doesNotMatch(context, /Pending payments:/);
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
  assert.match(src, /ai_crm_top_technicians/);
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
  testGreetingsDoNotSearchTheCrm();
  testJobDraftTimeNormalization();
  testCustomerDraftActionsAreReviewOnlyAndBounded();
  testOverviewIntentDetection();
  testLifetimeCustomerValueRankingIntent();
  testTechnicianBillingRankingIntentIsNarrow();
  await testMockCrmChat();
  testEndpointSourceHasSafetyGuards();
  testLookupSourceIsBounded();
  console.log('ai-crm-chat tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
