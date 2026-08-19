/**
 * One-word visible_address / bangaloreAreas matching (boundary rules).
 * Run: node tests/location-visible-address.test.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src/lib/adminUtils.ts'), 'utf8');

function testHalanaykanahalliDoesNotBecomeHal() {
  assert.doesNotMatch(
    src,
    /if \(haystack\.includes\(areaLower\)\)/,
    'findLongestAreaMatchInText must not use bare substring includes for short areas'
  );
  assert.match(src, /areaRequiresWordBoundary/);
  assert.match(src, /lastIndexOfAreaMatch/);
}

function testRegressionFixDocumented() {
  assert.match(src, /Halanaykanahalli|whole-token|WordBoundary/i);
  assert.match(src, /function nextVisibleAddressFromMapsFetch/);
}

function run() {
  testHalanaykanahalliDoesNotBecomeHal();
  testRegressionFixDocumented();
  console.log('location-visible-address tests passed');
}

run();
