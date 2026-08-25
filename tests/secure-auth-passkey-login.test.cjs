/**
 * Passkey login gate rejects missing ALTCHA token and non-POST.
 * Run: node tests/secure-auth-passkey-login.test.cjs
 */
const assert = require('assert');

function loadHandler() {
  const resolved = require.resolve('../netlify/functions/secure-auth-passkey-login');
  delete require.cache[resolved];
  return require('../netlify/functions/secure-auth-passkey-login');
}

async function run() {
  const origContext = process.env.CONTEXT;
  delete process.env.CONTEXT;

  const { handler } = loadHandler();

  const options = await handler({
    httpMethod: 'OPTIONS',
    headers: { origin: 'http://localhost:8080' },
    body: '',
  });
  assert.strictEqual(options.statusCode, 200, 'OPTIONS should succeed');

  const get = await handler({
    httpMethod: 'GET',
    headers: { origin: 'http://localhost:8080' },
    body: '',
  });
  assert.strictEqual(get.statusCode, 405, 'GET should be rejected');

  const missing = await handler({
    httpMethod: 'POST',
    headers: { origin: 'http://localhost:8080' },
    body: JSON.stringify({ step: 'start' }),
  });
  assert.strictEqual(missing.statusCode, 400, 'start without ALTCHA token should be 400');
  const missingBody = JSON.parse(missing.body);
  assert.match(String(missingBody.error), /security verification/i);

  const noStep = await handler({
    httpMethod: 'POST',
    headers: { origin: 'http://localhost:8080' },
    body: JSON.stringify({ altchaLoginToken: 'x' }),
  });
  assert.strictEqual(noStep.statusCode, 400, 'missing step should be 400');

  if (origContext === undefined) delete process.env.CONTEXT;
  else process.env.CONTEXT = origContext;

  console.log('secure-auth-passkey-login.test.cjs: all checks passed');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
