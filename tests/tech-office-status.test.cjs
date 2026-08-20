/**
 * Family office-status helpers (no live DB / Maps).
 * Run: node tests/tech-office-status.test.cjs
 */
const assert = require('node:assert/strict');
const helper = require('../netlify/functions/tech-office-status-helper.js');
const mint = require('../netlify/functions/tech-office-status-mint.js');
const pub = require('../netlify/functions/tech-office-status.js');

if (!process.env.ALTCHA_HMAC_KEY && !process.env.PUSH_REPLY_HMAC_SECRET && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.ALTCHA_HMAC_KEY = 'test-office-status-hmac';
}

function event(method, body, headers = {}) {
  return {
    httpMethod: method,
    headers: { ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body || {}),
  };
}

async function run() {
  assert.equal(helper.OFFICE_RADIUS_M, 1000);
  assert.equal(helper.isInOffice(999), true);
  assert.equal(helper.isInOffice(1000), true);
  assert.equal(helper.isInOffice(1001), false);

  const office = { lat: 12.9716, lng: 77.5946 };
  const nearby = { lat: 12.973, lng: 77.5946 };
  const far = { lat: 13.05, lng: 77.59 };
  const nearM = helper.haversineDistanceMeters(nearby, office);
  const farM = helper.haversineDistanceMeters(far, office);
  assert.ok(nearM < 1000, `expected nearby < 1km, got ${nearM}`);
  assert.ok(farM > 1000, `expected far > 1km, got ${farM}`);
  assert.equal(helper.isInOffice(nearM), true);
  assert.equal(helper.isInOffice(farM), false);

  assert.equal(helper.etaMinutesFromDurationSec(1), 1);
  assert.equal(helper.etaMinutesFromDurationSec(60), 1);
  assert.equal(helper.etaMinutesFromDurationSec(61), 2);
  assert.equal(helper.etaMinutesFromDurationSec(12 * 60 + 1), 13);
  assert.equal(helper.etaMinutesFromDurationSec(-3), null);
  const est = helper.estimateDriveSecFromMeters(11000);
  assert.ok(est && est > 1000);
  assert.equal(helper.etaMinutesFromDurationSec(est) != null, true);

  assert.equal(helper.firstNameFromFullName('Ravi Kumar'), 'Ravi');
  assert.equal(helper.firstNameFromFullName('  '), '');

  const token = helper.newPublicToken();
  assert.equal(helper.isValidPublicToken(token), true);
  assert.equal(helper.isValidPublicToken('short'), false);
  const hash = helper.sha256Hex(token);
  assert.equal(hash.length, 64);
  assert.notEqual(hash, token);

  assert.equal(
    helper.shouldRefuseStatus({ enabled: false, accountStatus: 'ACTIVE' }),
    true
  );
  assert.equal(
    helper.shouldRefuseStatus({ enabled: true, accountStatus: 'INACTIVE' }),
    true
  );
  assert.equal(
    helper.shouldRefuseStatus({ enabled: true, accountStatus: 'ACTIVE' }),
    false
  );
  assert.deepEqual(helper.publicNotFound(), { ok: false, error: 'not_found' });

  const picked = helper.pickCoords(
    { latitude: 12.97, longitude: 77.59, fix_time: '2026-08-20T10:00:00.000Z' },
    { latitude: 1, longitude: 1 }
  );
  assert.equal(picked.source, 'live');
  assert.ok(!JSON.stringify(helper.publicNotFound()).includes('12.97'));

  const cookie = helper.signWhereCookie(hash, Math.floor(Date.now() / 1000) + 60);
  assert.ok(cookie);
  assert.equal(helper.verifyWhereCookie(cookie, hash), true);
  assert.equal(helper.verifyWhereCookie(cookie, helper.sha256Hex('other-token-value-xxxxxxxxxxxx')), false);

  let res = await mint.handler(event('GET', {}));
  assert.equal(res.statusCode, 405);

  res = await mint.handler(event('POST', { action: 'get', technicianId: 'not-a-uuid' }));
  assert.ok(res.statusCode === 401 || res.statusCode === 400 || res.statusCode === 403);

  res = await pub.handler(event('GET', {}));
  assert.equal(res.statusCode, 405);

  res = await pub.handler(event('POST', { token: 'short' }));
  assert.equal(res.statusCode, 400);
  assert.deepEqual(JSON.parse(res.body), { ok: false, error: 'not_found' });

  res = await pub.handler(event('POST', { token }));
  assert.ok(res.statusCode === 404 || res.statusCode === 500 || res.statusCode === 200);
  const body = JSON.parse(res.body);
  assert.ok(!JSON.stringify(body).includes('latitude'));
  assert.ok(!JSON.stringify(body).includes('longitude'));
  if (body.ok === false) {
    assert.equal(body.error === 'not_found' || body.error === 'failed', true);
  }

  res = await pub.handler(event('POST', 'x'.repeat(9000)));
  assert.ok(res.statusCode === 413 || res.statusCode === 400);

  console.log('tech-office-status.test.cjs: all checks passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
