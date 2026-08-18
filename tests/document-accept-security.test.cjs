/**
 * Public/admin validation gates for Email Document Accept (no live DB or SMTP).
 * Run: node tests/document-accept-security.test.cjs
 */
const assert = require('assert');
const publicAccept = require('../netlify/functions/document-accept-public');
const emailSend = require('../netlify/functions/document-accept-email-send');
const emailHelper = require('../netlify/functions/document-accept-email-helper');

function event(method, body, headers = {}) {
  return {
    httpMethod: method,
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body || {}),
  };
}

async function run() {
  assert.strictEqual(emailHelper.normalizeEmail(' Customer@Example.COM '), 'customer@example.com');
  assert.strictEqual(emailHelper.normalizeEmail('a@example.com,b@example.com'), '');
  assert.strictEqual(emailHelper.normalizeEmail('not-an-email'), '');

  let response = await publicAccept.handler(event('GET', {}));
  assert.strictEqual(response.statusCode, 405);

  response = await publicAccept.handler(event('POST', { action: 'get', token: 'short' }));
  assert.strictEqual(response.statusCode, 400);
  assert.strictEqual(JSON.parse(response.body).error, 'invalid');

  response = await publicAccept.handler(
    event('POST', { action: 'delete', token: 'a'.repeat(43) })
  );
  assert.strictEqual(response.statusCode, 400);

  response = await publicAccept.handler(event('POST', 'x'.repeat(8_001)));
  assert.strictEqual(response.statusCode, 413);

  response = await publicAccept.handler(
    event('POST', { action: 'get', token: 'a'.repeat(43) }, { origin: 'https://evil.example' })
  );
  assert.strictEqual(response.statusCode, 403);

  response = await emailSend.handler(event('GET', {}));
  assert.strictEqual(response.statusCode, 405);

  response = await emailSend.handler(event('POST', {
    to: 'customer@example.com',
    originalPdfBase64: 'x',
    previewPdfBase64: 'x',
  }));
  assert.strictEqual(response.statusCode, 401);

  console.log('document-accept-security.test.cjs: all checks passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
