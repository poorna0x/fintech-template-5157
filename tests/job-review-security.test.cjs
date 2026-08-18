/**
 * Authorization / validation gates for job-review Netlify functions (no live DB).
 * Run: node tests/job-review-security.test.cjs
 */
const assert = require('assert');

const invite = require('../netlify/functions/job-review-invite');
const pub = require('../netlify/functions/job-review-public');
const notify = require('../netlify/functions/job-review-notify');

function event(method, body, headers = {}) {
  return {
    httpMethod: method,
    headers: { ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body || {}),
  };
}

async function run() {
  const limiter = require('../netlify/functions/rate-limiter');
  assert.strictEqual(typeof limiter.isRateLimitEnabled, 'function');
  assert.strictEqual(typeof limiter.checkRateLimit, 'function');

  let res = await invite.handler(event('GET', {}));
  assert.strictEqual(res.statusCode, 405);

  res = await invite.handler(event('POST', 'not-json'));
  assert.strictEqual(res.statusCode, 400);

  res = await invite.handler(event('POST', { jobId: '11111111-1111-1111-1111-111111111111' }));
  assert.ok(res.statusCode === 401 || res.statusCode === 403);

  res = await pub.handler(event('GET', {}));
  assert.strictEqual(res.statusCode, 405);

  res = await pub.handler(event('POST', { action: 'get', token: 'short' }));
  assert.strictEqual(res.statusCode, 400);
  const shortBody = JSON.parse(res.body);
  assert.strictEqual(shortBody.ok, false);

  res = await pub.handler(
    event('POST', { action: 'submit', token: 'abcdefghijkl', rating: 9 })
  );
  assert.strictEqual(res.statusCode, 400);

  res = await pub.handler(
    event('POST', { action: 'submit', token: 'abcdefghijkl', rating: 'nope' })
  );
  assert.strictEqual(res.statusCode, 400);

  res = await pub.handler(event('POST', 'x'.repeat(13_000)));
  assert.ok(res.statusCode === 413 || res.statusCode === 400);

  res = await notify.handler(event('POST', { token: 'nope' }));
  assert.strictEqual(res.statusCode, 400);

  res = await notify.handler(event('POST', { token: 'abcdefghijkl' }));
  assert.notStrictEqual(res.statusCode, 404);
  const notifyBody = JSON.parse(res.body);
  assert.ok(notifyBody.sent === 0 || notifyBody.error);

  console.log('job-review-security.test.cjs: all checks passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
