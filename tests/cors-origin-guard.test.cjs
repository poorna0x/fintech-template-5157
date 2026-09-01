/**
 * Regression: AI functions used to pass event.headers into
 * shouldRejectMissingOrigin(), which then crashed on event.headers.origin
 * (502) in production.
 */
process.env.AWS_LAMBDA_FUNCTION_NAME = 'test-lambda';
process.env.NODE_ENV = 'production';
delete process.env.NETLIFY_DEV;
delete process.env.CORS_PERMISSIVE;
delete process.env.CONTEXT;

const assert = require('node:assert/strict');
const { shouldRejectMissingOrigin } = require('../netlify/functions/cors-helper');

function testFullEventWithOriginDoesNotThrow() {
  assert.equal(
    shouldRejectMissingOrigin({
      httpMethod: 'GET',
      headers: { origin: 'https://hydrogenro.com' },
    }),
    false
  );
}

function testLegacyHeadersObjectDoesNotThrow() {
  assert.equal(
    shouldRejectMissingOrigin({ origin: 'https://hydrogenro.com' }),
    false
  );
  assert.equal(shouldRejectMissingOrigin({}), true);
}

function testMissingHeadersObjectDoesNotThrow() {
  assert.equal(shouldRejectMissingOrigin({ httpMethod: 'POST' }), true);
  assert.equal(shouldRejectMissingOrigin(undefined), true);
}

function testBearerAllowsMissingOrigin() {
  assert.equal(
    shouldRejectMissingOrigin({
      headers: { authorization: 'Bearer abc.def.ghi' },
    }),
    false
  );
}

testFullEventWithOriginDoesNotThrow();
testLegacyHeadersObjectDoesNotThrow();
testMissingHeadersObjectDoesNotThrow();
testBearerAllowsMissingOrigin();
console.log('cors-origin-guard tests passed');
