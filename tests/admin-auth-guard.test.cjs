/**
 * Admin auth must not treat technicians as admins; preview secret is non-prod only.
 * Run: node tests/admin-auth-guard.test.cjs
 */
const assert = require('assert');

const origContext = process.env.CONTEXT;
const origPreview = process.env.EMAIL_PREVIEW_SECRET;

function loadGuard() {
  const resolved = require.resolve('../netlify/functions/admin-auth-guard');
  delete require.cache[resolved];
  return require('../netlify/functions/admin-auth-guard');
}

async function run() {
  process.env.CONTEXT = 'production';
  process.env.EMAIL_PREVIEW_SECRET = 'test-preview-secret';
  let guard = loadGuard();
  assert.strictEqual(
    guard.isPreviewSecretAuthorized({
      headers: { 'x-email-preview-secret': 'test-preview-secret' },
    }),
    false,
    'preview secret must be rejected in production'
  );

  const admin = await guard.verifyAdminBearerToken('');
  assert.strictEqual(admin.ok, false);

  const staff = await guard.verifyStaffBearerToken('');
  assert.strictEqual(staff.ok, false);

  const fullAdmin = await guard.verifyFullAdminBearerToken('');
  assert.strictEqual(fullAdmin.ok, false);
  assert.strictEqual(typeof guard.verifyFullAdminBearerToken, 'function');

  process.env.CONTEXT = origContext;
  if (origPreview === undefined) delete process.env.EMAIL_PREVIEW_SECRET;
  else process.env.EMAIL_PREVIEW_SECRET = origPreview;
  loadGuard();

  console.log('admin-auth-guard.test.cjs: all checks passed');
}

run().catch((err) => {
  process.env.CONTEXT = origContext;
  if (origPreview === undefined) delete process.env.EMAIL_PREVIEW_SECRET;
  else process.env.EMAIL_PREVIEW_SECRET = origPreview;
  console.error(err);
  process.exit(1);
});
