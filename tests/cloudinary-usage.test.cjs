/**
 * Cloudinary usage helper + admin endpoint gates (no live Cloudinary required).
 * Run: node tests/cloudinary-usage.test.cjs
 */
const assert = require('assert');

process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
process.env.CLOUDINARY_API_KEY = 'test-key';
process.env.CLOUDINARY_API_SECRET = 'super-secret-test-value';
delete process.env.CLOUDINARY_SECONDARY_CLOUD_NAME;
delete process.env.CLOUDINARY_SECONDARY_API_KEY;
delete process.env.CLOUDINARY_SECONDARY_API_SECRET;

const helperPath = require.resolve('../netlify/functions/cloudinary-usage-helper');
delete require.cache[helperPath];
const helper = require('../netlify/functions/cloudinary-usage-helper');

async function run() {
  const meterObj = helper.parseMeter({ usage: 100, limit: 1000, used_percent: 10, credits_usage: 0.2 });
  assert.strictEqual(meterObj.available, true);
  assert.strictEqual(meterObj.usage, 100);
  assert.strictEqual(meterObj.limit, 1000);
  assert.strictEqual(meterObj.remaining, 900);
  assert.strictEqual(meterObj.usedPercent, 10);

  const noLimit = helper.parseMeter({ usage: 50 });
  assert.strictEqual(noLimit.limit, null);
  assert.strictEqual(noLimit.remaining, null);
  assert.strictEqual(noLimit.usedPercent, null);

  const missing = helper.parseMeter(undefined);
  assert.strictEqual(missing.available, false);

  const asNumber = helper.parseMeter(877212);
  assert.strictEqual(asNumber.usage, 877212);
  assert.strictEqual(asNumber.limit, null);

  const report = helper.parseUsageReport({
    plan: 'Free',
    last_updated: '2026-08-01',
    date_requested: '2026-08-02T00:00:00Z',
    storage: { usage: 1024, limit: 2048, used_percent: 50 },
    bandwidth: { usage: 10 },
    transformations: { usage: 3, limit: 25, used_percent: 12 },
    objects: { usage: 9 },
    requests: 100,
    resources: 7,
    derived_resources: 2,
    imagga_crop: { usage: 1, limit: 10 },
    media_limits: { image_max_size_bytes: 100 },
  });
  assert.strictEqual(report.plan, 'Free');
  assert.strictEqual(report.resources, 7);
  assert.strictEqual(report.meters.storage.usedPercent, 50);
  assert.strictEqual(report.meters.storage.quotaSource, 'api');
  assert.strictEqual(report.meters.bandwidth.limit, helper.FREE_PLAN_CREDITS * helper.BYTES_PER_CREDIT);
  assert.ok(report.meters.bandwidth.usedPercent != null);
  assert.strictEqual(report.meters.bandwidth.quotaSource, 'free_plan');
  const freeOnly = helper.parseUsageReport({
    plan: 'Free',
    storage: { usage: 500_000_000 },
    bandwidth: { usage: 100_000_000 },
    transformations: { usage: 500 },
    credits: { usage: 0.6 },
  });
  assert.strictEqual(freeOnly.meters.storage.limit, 25_000_000_000);
  assert.ok(Math.abs(freeOnly.meters.storage.usedPercent - 2) < 0.01);
  assert.strictEqual(freeOnly.meters.transformations.limit, 25_000);
  assert.strictEqual(freeOnly.meters.credits.limit, 25);
  assert.strictEqual(report.meters.requests.usage, 100);
  assert.strictEqual(report.addons[0].key, 'imagga_crop');

  helper.clearUsageCache();
  const payload = await helper.buildCloudinaryUsagePayload({
    fetchImpl: async (url, opts) => {
      assert.ok(String(opts.headers.Authorization || '').startsWith('Basic '));
      assert.ok(!String(url).includes('super-secret'));
      const u = String(url);
      let json = {};
      if (u.endsWith('/usage') || /\/usage\/\d{4}-\d{2}-\d{2}$/.test(u)) {
        json = {
          plan: 'Free',
          last_updated: '2026-08-14',
          storage: { usage: 500, limit: 10000, used_percent: 5 },
          bandwidth: { usage: 20, limit: 1000, used_percent: 2 },
          transformations: { usage: 1, limit: 25, used_percent: 4 },
          resources: 4,
          derived_resources: 1,
          requests: 12,
        };
      } else if (u.includes('/folders')) {
        json = { folders: [{ name: 'jobs', path: 'jobs' }] };
      } else if (u.includes('/resources/search')) {
        const body = opts && opts.body ? JSON.parse(opts.body) : {};
        const expr = String(body.expression || '');
        if (expr === 'resource_type:image') {
          json = { total_count: 3, resources: [] };
        } else if (expr === 'resource_type:video') {
          json = { total_count: 1, resources: [] };
        } else if (expr === 'resource_type:raw') {
          json = { total_count: 0, resources: [] };
        } else {
          json = {
            total_count: 4,
            aggregations: { format: { jpg: 3, png: 1 }, resource_type: { image: 3, video: 1 } },
            resources: [
              {
                public_id: 'jobs/a',
                filename: 'a',
                resource_type: 'image',
                format: 'jpg',
                bytes: 1200,
                created_at: '2026-08-01T00:00:00Z',
              },
            ],
          };
        }
      } else if (u.includes('/resources/image')) {
        json = { total_count: 3, resources: [] };
      } else if (u.includes('/resources/video')) {
        json = { total_count: 1, resources: [] };
      } else if (u.includes('/resources/raw')) {
        json = { total_count: 0, resources: [] };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => json,
      };
    },
    details: true,
    history: true,
  });

  assert.strictEqual(payload.ok, true);
  assert.ok(payload.lastUpdated);
  assert.strictEqual(payload.accounts.length, 1);
  assert.strictEqual(payload.accounts[0].cloudName, 'test-cloud');
  assert.strictEqual(payload.accounts[0].overview.usage.meters.storage.usage, 500);
  assert.strictEqual(payload.accounts[0].overview.resourceCounts.image, 3);
  assert.strictEqual(payload.accounts[0].details.folders.count, 1);
  assert.strictEqual(payload.accounts[0].details.recentAssets.items[0].publicId, 'jobs/a');
  assert.ok(String(payload.accounts[0].details.recentAssets.items[0].previewUrl).includes('res.cloudinary.com'));
  const dumped = JSON.stringify(payload);
  assert.ok(!dumped.includes('super-secret-test-value'));
  assert.ok(!/api[_-]?secret/i.test(dumped));
  assert.ok(!dumped.includes('test-key'));

  const usageFn = require('../netlify/functions/cloudinary-usage');
  const unauth = await usageFn.handler({
    httpMethod: 'POST',
    headers: { origin: 'https://hydrogenro.com' },
    body: '{}',
  });
  assert.ok(unauth.statusCode === 401 || unauth.statusCode === 403, `unauth ${unauth.statusCode}`);
  const unauthBody = JSON.parse(unauth.body);
  assert.ok(!JSON.stringify(unauthBody).includes('super-secret'));

  const badMethod = await usageFn.handler({
    httpMethod: 'PUT',
    headers: { origin: 'https://hydrogenro.com' },
    body: '',
  });
  assert.strictEqual(badMethod.statusCode, 405);

  console.log('cloudinary-usage.test.cjs: all checks passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
