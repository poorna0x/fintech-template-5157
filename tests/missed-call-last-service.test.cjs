const assert = require('node:assert/strict');
const {
  pickLastCompletedServiceAt,
  formatLastServiceDate,
  maybeSendMissedCallCallbackWhatsApp,
} = require('../netlify/functions/missed-call-whatsapp-helper.js');

function testPicksLatestCompletedJob() {
  const at = pickLastCompletedServiceAt([
    { completed_at: '2026-06-30T10:00:00.000Z' },
    { completed_at: '2026-09-02T16:00:00.000Z' },
    { end_time: '2026-08-01T08:00:00.000Z' },
  ]);
  assert.equal(at, '2026-09-02T16:00:00.000Z');
}

function testIgnoresEmptyJobs() {
  assert.equal(pickLastCompletedServiceAt([]), null);
  assert.equal(pickLastCompletedServiceAt([{ completed_at: null, end_time: '' }]), null);
  assert.equal(formatLastServiceDate(null), 'not on file yet');
}

function testFormatsIstLabel() {
  const label = formatLastServiceDate('2026-09-02T16:10:15.816Z');
  assert.notEqual(label, 'not on file yet');
  assert.match(label, /2\s+Sep/);
  assert.match(label, /2026/);
}

async function testAutoSendIsNotStubbed() {
  const result = await maybeSendMissedCallCallbackWhatsApp(null, { phone: '+919876543210' });
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'no_db');
}

testPicksLatestCompletedJob();
testIgnoresEmptyJobs();
testFormatsIstLabel();
testAutoSendIsNotStubbed().then(() => {
  console.log('missed-call-last-service.test.cjs ok');
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
