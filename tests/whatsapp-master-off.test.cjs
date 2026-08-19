/**
 * Master WhatsApp toggle: off = no Graph send/receive processing.
 * Run: node tests/whatsapp-master-off.test.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  isWhatsAppMasterEnabledFromRow,
} = require('../netlify/functions/whatsapp-helper');

function testRowGate() {
  assert.equal(isWhatsAppMasterEnabledFromRow(null), true);
  assert.equal(isWhatsAppMasterEnabledFromRow(undefined), true);
  assert.equal(isWhatsAppMasterEnabledFromRow({}), true);
  assert.equal(isWhatsAppMasterEnabledFromRow({ enabled: true }), true);
  assert.equal(isWhatsAppMasterEnabledFromRow({ enabled: false }), false);
}

function testWebhookSkipsWhenDisabled() {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'netlify/functions/whatsapp-webhook.js'),
    'utf8'
  );
  assert.match(src, /isWhatsAppMasterEnabled/);
  assert.match(src, /skipped: 'disabled'/);
  assert.match(src, /statusCode: 200/);
}

function run() {
  testRowGate();
  testWebhookSkipsWhenDisabled();
  console.log('whatsapp-master-off tests passed');
}

run();
