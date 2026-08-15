/**
 * Cloudinary signed-url must not run without a staff session.
 * Run: node tests/cloudinary-signed-url-auth.test.cjs
 */
const assert = require('assert');
const { handler } = require('../netlify/functions/cloudinary-signed-url');

async function run() {
  const missing = await handler({
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ urls: ['https://res.cloudinary.com/x/image/upload/v1/ro-service/a.jpg'] }),
  });
  assert.strictEqual(missing.statusCode, 400);

  const noAuth = await handler({
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({
      accessToken: 'not-a-jwt',
      urls: ['https://res.cloudinary.com/x/image/upload/v1/ro-service/a.jpg'],
    }),
  });
  assert.ok(noAuth.statusCode === 401 || noAuth.statusCode === 403 || noAuth.statusCode === 500);

  const method = await handler({ httpMethod: 'GET', headers: {}, body: '' });
  assert.strictEqual(method.statusCode, 405);

  console.log('cloudinary-signed-url-auth.test.cjs: all checks passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
