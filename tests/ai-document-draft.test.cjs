/**
 * Security and contract tests for conversational document drafting.
 * No network or database required.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  DOCUMENT_KINDS,
  ALLOWED_FIELDS,
  parseDocumentDraftRequest,
  normalizeDocumentDraftOutput,
} = require('../netlify/functions/ai-document-draft-schemas');
const { generateWithMock } = require('../netlify/functions/ai-provider-mock');

function testRequestIsBoundedAndAllowlisted() {
  const parsed = parseDocumentDraftRequest({
    kind: 'bill',
    message: 'Add a membrane for ₹3500',
    provider: 'openai',
    tools: ['delete_customer'],
    currentDraft: {
      items: [],
      notes: [],
      paymentStatus: 'PENDING',
      billNumber: 'BILL-EDITABLE',
      secret: 'must not pass',
      __proto__: { polluted: true },
    },
    history: Array.from({ length: 30 }, (_, index) => ({
      role: index % 2 ? 'assistant' : 'user',
      text: `turn ${index}`,
    })),
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.history.length, 10);
  assert.equal('secret' in parsed.value.currentDraft, false);
  assert.equal(parsed.value.currentDraft.billNumber, 'BILL-EDITABLE');
  assert.equal('provider' in parsed.value, false);
  assert.equal('tools' in parsed.value, false);
}

function testUnsupportedKindsAndShortMessagesRejected() {
  assert.equal(parseDocumentDraftRequest({ kind: 'salary', message: 'edit it' }).ok, false);
  assert.equal(parseDocumentDraftRequest({ kind: 'bill', message: 'x' }).ok, false);
  assert.deepEqual(DOCUMENT_KINDS, ['bill', 'quotation', 'tax_invoice', 'amc', 'warranty']);
}

function testOutputDropsDisallowedAndMalformedChanges() {
  const currentDraft = {
    billNumber: 'BILL-2026-001',
    items: [],
    notes: [],
    paymentStatus: 'PENDING',
    serviceCharge: 0,
  };
  const normalized = normalizeDocumentDraftOutput(
    'bill',
    {
      answer: 'Prepared',
      confidence: 0.9,
      warnings: [],
      operations: [
        {
          field: 'billNumber',
          valueJson: '"BILL-2026-900"',
          explanation: 'Change document number',
        },
        {
          field: 'serviceCharge',
          valueJson: '750',
          explanation: 'Add service charge',
        },
        {
          field: 'paymentStatus',
          valueJson: '"PAID"',
          explanation: 'Change status',
        },
        {
          field: 'deleteCustomer',
          valueJson: 'true',
          explanation: 'Unsafe',
        },
        {
          field: 'notes',
          valueJson: '{bad json',
          explanation: 'Malformed',
        },
      ],
    },
    currentDraft
  );
  assert.deepEqual(normalized.patch, {
    billNumber: 'BILL-2026-900',
    serviceCharge: 750,
    paymentStatus: 'PAID',
  });
  assert.equal(normalized.changes.length, 3);
  assert.equal(normalized.requiresHuman, true);
  assert.ok(normalized.warnings.some((warning) => warning.includes('notes')));
}

function testItemsAreNormalizedAndPricedOnlyFromOutput() {
  const normalized = normalizeDocumentDraftOutput(
    'quotation',
    {
      answer: 'Ready',
      operations: [
        {
          field: 'items',
          valueJson: JSON.stringify([
            { description: 'RO membrane', quantity: 2, unitPrice: 3500, total: 1 },
          ]),
          explanation: 'Add membrane',
        },
      ],
    },
    { items: [] }
  );
  assert.equal(normalized.patch.items.length, 1);
  assert.match(normalized.patch.items[0].id, /^ai-item-/);
  assert.equal(normalized.patch.items[0].total, 7000);
}

function testNoMutationImportsOrToolExecution() {
  const endpoint = fs.readFileSync(
    path.join(__dirname, '../netlify/functions/ai-document-draft.js'),
    'utf8'
  );
  assert.equal(/\.from\s*\(|db\.(?:insert|update|delete)|execute_sql/i.test(endpoint), false);
  assert.equal(/canDelete:\s*false/.test(endpoint), true);
  assert.equal(/canSave:\s*false/.test(endpoint), true);
  assert.equal(/canSend:\s*false/.test(endpoint), true);
  for (const kind of DOCUMENT_KINDS) assert.ok(ALLOWED_FIELDS[kind] instanceof Set);
}

async function testMockDocumentConversation() {
  const result = await generateWithMock({
    operation: 'document_draft',
    messages: [
      {
        role: 'user',
        text: 'Current: {"notes":[]}\n<request>Add note: customer approved</request>',
      },
    ],
  });
  assert.equal(result.toolCalls.length, 0);
  assert.equal(result.parsed.operations[0].field, 'notes');
}

async function main() {
  testRequestIsBoundedAndAllowlisted();
  testUnsupportedKindsAndShortMessagesRejected();
  testOutputDropsDisallowedAndMalformedChanges();
  testItemsAreNormalizedAndPricedOnlyFromOutput();
  testNoMutationImportsOrToolExecution();
  await testMockDocumentConversation();
  console.log('ai-document-draft tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

