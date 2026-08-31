/**
 * Status-only WhatsApp webhooks must not require the Node function.
 * Run: node tests/whatsapp-webhook-gate.test.cjs
 */
const assert = require('node:assert/strict');
const {
  hasInboundWhatsAppMessages,
  collectWhatsAppStatuses,
  shouldAckStatusOnlyAtEdge,
} = require('../netlify/functions/whatsapp-webhook-payload.js');

function testStatusOnly() {
  const payload = {
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              statuses: [
                { id: 'wamid.1', status: 'delivered' },
                { id: 'wamid.2', status: 'read', errors: [{ title: 'x' }] },
              ],
            },
          },
        ],
      },
    ],
  };
  assert.equal(hasInboundWhatsAppMessages(payload), false);
  assert.equal(shouldAckStatusOnlyAtEdge(payload), true);
  const st = collectWhatsAppStatuses(payload);
  assert.equal(st.length, 2);
  assert.equal(st[0].status, 'delivered');
  assert.equal(st[1].error, 'x');
}

function testInboundPassesThrough() {
  const payload = {
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              messages: [{ id: 'wamid.in', type: 'text', from: '9198' }],
              statuses: [{ id: 'wamid.1', status: 'sent' }],
            },
          },
        ],
      },
    ],
  };
  assert.equal(hasInboundWhatsAppMessages(payload), true);
  assert.equal(shouldAckStatusOnlyAtEdge(payload), false);
}

function testEmptyAck() {
  assert.equal(hasInboundWhatsAppMessages({ entry: [] }), false);
  assert.equal(hasInboundWhatsAppMessages({}), false);
  assert.equal(shouldAckStatusOnlyAtEdge({ entry: [] }), false);
  assert.equal(shouldAckStatusOnlyAtEdge({}), false);
  assert.equal(
    shouldAckStatusOnlyAtEdge({
      entry: [{ changes: [{ field: 'message_template_status_update', value: {} }] }],
    }),
    false
  );
}

function run() {
  testStatusOnly();
  testInboundPassesThrough();
  testEmptyAck();
  console.log('whatsapp-webhook-gate tests passed');
}

run();
