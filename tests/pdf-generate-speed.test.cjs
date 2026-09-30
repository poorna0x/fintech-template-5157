/**
 * PDF generate-pdf reuses Chromium; font/image waits stay the same as before.
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
assert.match(src, /__hroSharedPdfBrowser/);
assert.match(src, /scheduleSharedBrowserIdleClose/);
assert.match(src, /page\.close\(\)/);
assert.doesNotMatch(src, /await browser\.close\(\)/);
assert.match(src, /document\.fonts\.load/);
assert.match(src, /setTimeout\(resolve, 300\)/);
assert.match(src, /setTimeout\(resolve, 200\)/);
assert.match(src, /timeoutMs = 2500/);
assert.match(src, /Promise\.all\(\[\s*isPdfCompressionEnabled\(\),\s*renderHtmlToPdf/);

console.log('pdf-generate-speed.test.cjs ok');
