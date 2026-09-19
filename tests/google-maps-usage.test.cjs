/**
 * Google Maps usage helper + admin endpoint gates (no live GCP required).
 * Run: node tests/google-maps-usage.test.cjs
 */
const assert = require('assert');

const helperPath = require.resolve('../netlify/functions/google-maps-usage-helper');
delete require.cache[helperPath];
const helper = require('../netlify/functions/google-maps-usage-helper');

async function run() {
  const rolled = helper.rollupSkus([
    { service: 'maps-backend.googleapis.com', requests: 12_500 },
    { service: 'maps.googleapis.com', requests: 500 },
    { service: 'places.googleapis.com', requests: 100 },
    { service: 'geocoding-backend.googleapis.com', requests: 10_000 },
    { service: 'distance-matrix-backend.googleapis.com', requests: 11_000 },
    { service: 'street-view.googleapis.com', requests: 9 },
  ]);

  const byId = Object.fromEntries(rolled.skus.map((row) => [row.id, row]));
  assert.strictEqual(byId.dynamic_maps.requests, 13_000);
  assert.strictEqual(byId.dynamic_maps.billable, 3_000);
  assert.strictEqual(byId.dynamic_maps.estimatedUsd, 21);
  assert.strictEqual(byId.places.requests, 100);
  assert.strictEqual(byId.places.billable, 0);
  assert.strictEqual(byId.geocoding.requests, 10_000);
  assert.strictEqual(byId.geocoding.billable, 0);
  assert.strictEqual(byId.distance.requests, 11_000);
  assert.strictEqual(byId.distance.billable, 1_000);
  assert.strictEqual(byId.distance.estimatedUsd, 5);
  assert.strictEqual(rolled.estimatedUsd, 26);
  assert.strictEqual(rolled.other.length, 1);
  assert.strictEqual(rolled.other[0].service, 'street-view.googleapis.com');

  const empty = helper.emptySkus();
  assert.strictEqual(empty.length, 4);
  assert.ok(empty.every((row) => row.freeCap === 10_000));

  const usageFn = require('../netlify/functions/google-maps-usage');
  const unauth = await usageFn.handler({
    httpMethod: 'POST',
    headers: { origin: 'https://hydrogenro.com' },
    body: '{}',
  });
  assert.ok(unauth.statusCode === 401 || unauth.statusCode === 403, `unauth ${unauth.statusCode}`);
  const unauthBody = JSON.parse(unauth.body);
  assert.ok(!JSON.stringify(unauthBody).includes('private_key'));
  assert.ok(!JSON.stringify(unauthBody).includes('BEGIN RSA'));

  const badMethod = await usageFn.handler({
    httpMethod: 'PUT',
    headers: { origin: 'https://hydrogenro.com' },
    body: '',
  });
  assert.strictEqual(badMethod.statusCode, 405);

  console.log('google-maps-usage.test.cjs: all checks passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
