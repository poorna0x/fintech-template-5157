/**
 * One-off live Admin API probe. Prints metric names only — never secrets.
 * node tests/cloudinary-usage-live-probe.cjs
 */
const fs = require('fs');
const path = require('path');

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    if (!key.startsWith('CLOUDINARY_')) continue;
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(path.join(__dirname, '../.env.local'));
loadEnvFile(path.join(__dirname, '../.env'));

const helper = require('../netlify/functions/cloudinary-usage-helper');
const accounts = helper.getCloudinaryAdminAccounts();
if (!accounts.length) {
  console.log('LIVE_PROBE: no CLOUDINARY_* admin credentials (skip)');
  process.exit(0);
}

(async () => {
  helper.clearUsageCache();
  const payload = await helper.buildCloudinaryUsagePayload({ refresh: true });
  const dumped = JSON.stringify(payload);
  if (/api[_-]?secret/i.test(dumped) || dumped.includes('CLOUDINARY_API_SECRET')) {
    console.error('LIVE_PROBE: secret leaked in payload');
    process.exit(1);
  }
  console.log('LIVE_PROBE ok', payload.ok);
  console.log('accounts', payload.accounts.map((a) => a.label).join(','));
  for (const acc of payload.accounts) {
    const u = acc.overview && acc.overview.usage;
    const m = u && u.meters;
    console.log('cloud', acc.cloudName ? 'set' : 'missing');
    console.log('overviewError', acc.overviewError || null);
    if (!m) continue;
    console.log('plan', u.plan || null);
    console.log('resources', u.resources);
    console.log('storage.usage', m.storage.usage != null);
    console.log('storage.limit', m.storage.limit != null);
    console.log('storage.usedPercent', m.storage.usedPercent != null);
    console.log('bandwidth.usage', m.bandwidth.usage != null);
    console.log('bandwidth.limit', m.bandwidth.limit != null);
    console.log('transformations.usage', m.transformations.usage != null);
    console.log('transformations.limit', m.transformations.limit != null);
    console.log('credits.usage', m.credits.usage != null);
    console.log('credits.limit', m.credits.limit != null);
    console.log('requests.usage', m.requests.usage != null);
    console.log('objects.usage', m.objects.usage != null);
    console.log('imageCount', acc.overview.resourceCounts && acc.overview.resourceCounts.image != null);
    console.log('videoCount', acc.overview.resourceCounts && acc.overview.resourceCounts.video != null);
    console.log('rawCount', acc.overview.resourceCounts && acc.overview.resourceCounts.raw != null);
  }
})().catch((err) => {
  console.error('LIVE_PROBE_FAIL', String(err.message || err).slice(0, 180));
  process.exit(1);
});
