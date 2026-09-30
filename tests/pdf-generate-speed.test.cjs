/**
 * PDF generate-pdf keeps Chromium warm and skips extra font/image sleeps.
 * Run: node tests/pdf-generate-speed.test.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(
  path.join(__dirname, '../netlify/functions/generate-pdf.js'),
  'utf8'
);

assert.match(src, /function getSharedBrowser/);
assert.match(src, /SHARED_BROWSER_IDLE_MS/);
assert.match(src, /scheduleSharedBrowserIdleClose/);
assert.match(src, /page\.close\(\)/);
assert.doesNotMatch(src, /await browser\.close\(\)/);
assert.doesNotMatch(src, /document\.fonts\.load/);
assert.doesNotMatch(src, /setTimeout\(resolve, 300\)/);
assert.doesNotMatch(src, /setTimeout\(resolve, 200\)/);
assert.match(src, /Promise\.all\(\[\s*isPdfCompressionEnabled\(\),\s*renderHtmlToPdf/);

console.log('pdf-generate-speed.test.cjs ok');
