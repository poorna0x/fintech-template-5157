/**
 * Rate limiter + login / review / email limit behaviour (no live DB).
 * Run: node tests/rate-limiter.test.cjs
 */
const assert = require('assert');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ev(ip, extra = {}) {
  return { headers: { 'x-forwarded-for': ip, ...extra } };
}

async function countStatuses(handler, n, makeEvent) {
  const codes = [];
  for (let i = 0; i < n; i++) {
    const res = await handler(makeEvent(i));
    codes.push(res.statusCode);
  }
  return codes;
}

async function run() {
  delete process.env.CONTEXT;
  const rlPath = require.resolve('../netlify/functions/rate-limiter');
  delete require.cache[rlPath];
  let rl = require('../netlify/functions/rate-limiter');

  assert.strictEqual(rl.isRateLimitEnabled(), false);
  assert.strictEqual(rl.rateLimiters.auth(ev('198.51.100.10')), null);

  process.env.CONTEXT = 'dev';
  delete require.cache[rlPath];
  rl = require('../netlify/functions/rate-limiter');
  assert.strictEqual(rl.isRateLimitEnabled(), false);

  process.env.CONTEXT = 'production';
  delete require.cache[rlPath];
  rl = require('../netlify/functions/rate-limiter');
  assert.strictEqual(rl.isRateLimitEnabled(), true);

  assert.strictEqual(rl.getClientIdentifier(ev('203.0.113.1, 10.0.0.1')), '203.0.113.1');
  assert.strictEqual(rl.getClientIdentifier({ headers: {} }), 'unknown');

  const authIp = ev('203.0.113.20');
  let allowed = 0;
  let denied = 0;
  let last = null;
  for (let i = 0; i < 12; i++) {
    last = rl.rateLimiters.auth(authIp);
    if (last) denied++;
    else allowed++;
  }
  assert.strictEqual(allowed, 10);
  assert.strictEqual(denied, 2);
  assert.strictEqual(last.statusCode, 429);
  assert.ok(last.headers['Retry-After']);
  const body = JSON.parse(last.body);
  assert.strictEqual(body.error, 'Too many requests');

  const short = { maxRequests: 2, windowMs: 80, endpoint: 'window-reset-selftest' };
  const wip = ev('203.0.113.21');
  assert.strictEqual(rl.checkRateLimit(wip, short).allowed, true);
  assert.strictEqual(rl.checkRateLimit(wip, short).allowed, true);
  assert.strictEqual(rl.checkRateLimit(wip, short).allowed, false);
  await sleep(90);
  assert.strictEqual(rl.checkRateLimit(wip, short).allowed, true, 'window should reset');

  const peekIp = ev('203.0.113.22');
  const peekOpts = { maxRequests: 3, windowMs: 60_000, endpoint: 'peek-selftest' };
  assert.strictEqual(rl.peekRateLimit(peekIp, peekOpts).allowed, true);
  assert.strictEqual(rl.peekRateLimit(peekIp, peekOpts).allowed, true);
  assert.strictEqual(rl.peekRateLimit(peekIp, peekOpts).remaining, 3);
  rl.incrementRateLimit(peekIp, peekOpts);
  rl.incrementRateLimit(peekIp, peekOpts);
  rl.incrementRateLimit(peekIp, peekOpts);
  assert.strictEqual(rl.peekRateLimit(peekIp, peekOpts).allowed, false);

  const a = rl.checkRateLimit(ev('203.0.113.23'), { maxRequests: 1, windowMs: 60_000, endpoint: 'iso' });
  const b = rl.checkRateLimit(ev('203.0.113.24'), { maxRequests: 1, windowMs: 60_000, endpoint: 'iso' });
  assert.strictEqual(a.allowed, true);
  assert.strictEqual(b.allowed, true);
  assert.strictEqual(
    rl.checkRateLimit(ev('203.0.113.23'), { maxRequests: 1, windowMs: 60_000, endpoint: 'iso' }).allowed,
    false
  );

  delete process.env.VITE_SUPABASE_URL;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  const pub = require('../netlify/functions/job-review-public');
  const notify = require('../netlify/functions/job-review-notify');
  const invite = require('../netlify/functions/job-review-invite');

  const getToken = 'gettoken12charsx';
  const getCodes = await countStatuses(pub.handler, 21, () => ({
    httpMethod: 'POST',
    headers: { 'x-forwarded-for': '192.0.2.80', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'get', token: getToken }),
  }));
  const getOk = getCodes.filter((c) => c !== 429).length;
  const get429 = getCodes.filter((c) => c === 429).length;
  assert.strictEqual(getOk, 20, `get token cap 20, got ${getOk} non-429: ${getCodes.join(',')}`);
  assert.ok(get429 >= 1);

  const submitToken = 'submittoken12chx';
  const subCodes = await countStatuses(pub.handler, 8, () => ({
    httpMethod: 'POST',
    headers: { 'x-forwarded-for': '192.0.2.81', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'submit', token: submitToken, rating: 5 }),
  }));
  assert.strictEqual(subCodes.filter((c) => c !== 429).length, 6);
  assert.ok(subCodes.slice(6).every((c) => c === 429));

  const notifyToken = 'notifytoken12chr';
  const nCodes = await countStatuses(notify.handler, 5, () => ({
    httpMethod: 'POST',
    headers: { 'x-forwarded-for': '192.0.2.82', 'content-type': 'application/json' },
    body: JSON.stringify({ token: notifyToken }),
  }));
  assert.strictEqual(nCodes.filter((c) => c !== 429).length, 3, `notify token cap 3: ${nCodes.join(',')}`);
  assert.ok(nCodes.slice(3).every((c) => c === 429));

  const inv = await invite.handler({
    httpMethod: 'POST',
    headers: { 'x-forwarded-for': '192.0.2.83', origin: 'https://hydrogenro.com' },
    body: JSON.stringify({ jobId: '11111111-1111-1111-1111-111111111111' }),
  });
  assert.ok(inv.statusCode === 401 || inv.statusCode === 403, `invite without JWT: ${inv.statusCode}`);

  const authLimits = require('../netlify/functions/auth-rate-limits');
  const loginEv = ev('192.0.2.90');
  const email = 'rate-limit-selftest@example.com';
  for (let i = 0; i < 5; i++) {
    const peek = authLimits.checkLoginRateLimits(loginEv, email, {});
    assert.strictEqual(peek.blocked, false, `login peek should not consume quota (${i})`);
  }
  for (let i = 0; i < 5; i++) {
    authLimits.recordLoginRateLimitFailure(loginEv, email);
  }
  const locked = authLimits.checkLoginRateLimits(loginEv, email, {});
  assert.strictEqual(locked.blocked, true);
  assert.strictEqual(locked.response.statusCode, 429);
  const otherEmail = authLimits.checkLoginRateLimits(loginEv, 'other-selftest@example.com', {});
  assert.strictEqual(otherEmail.blocked, false, 'email buckets are separate; IP still under 10 fails');

  process.env.CONTEXT = 'dev';
  delete require.cache[rlPath];
  rl = require('../netlify/functions/rate-limiter');
  assert.strictEqual(rl.enforceSendEmailRateLimits(ev('192.0.2.91'), 'a@b.com'), null);

  delete process.env.CONTEXT;
  delete require.cache[rlPath];
  rl = require('../netlify/functions/rate-limiter');
  const mailEv = ev('192.0.2.92');
  for (let i = 0; i < 3; i++) {
    assert.strictEqual(rl.enforceSendEmailRateLimits(mailEv, 'once@example.com'), null);
  }
  const mailBlocked = rl.enforceSendEmailRateLimits(mailEv, 'once@example.com');
  assert.ok(mailBlocked);
  assert.strictEqual(mailBlocked.statusCode, 429);

  console.log('rate-limiter.test.cjs: all checks passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
