const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  isPdfCompressionEnabled,
} = require('../netlify/functions/pdf-compression-setting');
const {
  maybeCompressPdfBuffer,
  fetchILovePdfAccountUsage,
  clearILovePdfConfigCache,
} = require('../netlify/functions/ilovepdf-compress-helper');

function mockSettingsDb(result) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => result,
        }),
      }),
    }),
  };
}

async function testSettingGate() {
  assert.equal(await isPdfCompressionEnabled(null), false);
  assert.equal(
    await isPdfCompressionEnabled(mockSettingsDb({ data: null, error: null })),
    true
  );
  assert.equal(
    await isPdfCompressionEnabled(mockSettingsDb({ data: { value: true }, error: null })),
    true
  );
  assert.equal(
    await isPdfCompressionEnabled(mockSettingsDb({ data: { value: false }, error: null })),
    false
  );
  assert.equal(
    await isPdfCompressionEnabled(
      mockSettingsDb({ data: null, error: { message: 'offline' } })
    ),
    false
  );
}

async function testCreditFallback() {
  const originalFetch = global.fetch;
  const originalKey = process.env.ILOVEPDF_PUBLIC_KEY;
  const originalToggle = process.env.ILOVEPDF_COMPRESS;
  const input = Buffer.alloc(2048, 7);
  let apiCalls = 0;
  const requestedUrls = [];

  process.env.ILOVEPDF_PUBLIC_KEY = 'test-public-key';
  delete process.env.ILOVEPDF_COMPRESS;
  clearILovePdfConfigCache();
  global.fetch = async (url) => {
    requestedUrls.push(String(url));
    if (/api\.ilovepdf\.com|mock\.ilovepdf\.test/.test(String(url))) apiCalls += 1;
    if (String(url).endsWith('/auth')) {
      return new Response(JSON.stringify({ token: 'test-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(
      JSON.stringify({
        server: 'mock.ilovepdf.test',
        task: 'task-1',
        remaining_credits: 0,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    const result = await maybeCompressPdfBuffer(input, { filename: 'Document_test.pdf' });
    assert.equal(result.compressed, false);
    assert.strictEqual(result.buffer, input);
    assert.equal(result.compressedBytes, input.length);
    assert.equal(apiCalls, 2, 'must only authenticate and start the task');
    assert.equal(
      requestedUrls.some((url) => url.endsWith('/upload')),
      false,
      'must not upload when fewer than 10 credits remain'
    );
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ILOVEPDF_PUBLIC_KEY;
    else process.env.ILOVEPDF_PUBLIC_KEY = originalKey;
    if (originalToggle === undefined) delete process.env.ILOVEPDF_COMPRESS;
    else process.env.ILOVEPDF_COMPRESS = originalToggle;
  }
}

async function testDeadlineFallback() {
  const originalFetch = global.fetch;
  const originalKey = process.env.ILOVEPDF_PUBLIC_KEY;
  const input = Buffer.alloc(2048, 9);
  let apiCalls = 0;

  process.env.ILOVEPDF_PUBLIC_KEY = 'test-public-key';
  clearILovePdfConfigCache();
  global.fetch = async (url) => {
    if (/api\.ilovepdf\.com|mock\.ilovepdf\.test/.test(String(url))) apiCalls += 1;
    throw new Error('fetch should not run after deadline');
  };

  try {
    const result = await maybeCompressPdfBuffer(input, {
      filename: 'Invoice_test.pdf',
      deadlineAt: Date.now() - 1,
    });
    assert.equal(result.compressed, false);
    assert.strictEqual(result.buffer, input);
    assert.equal(apiCalls, 0);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ILOVEPDF_PUBLIC_KEY;
    else process.env.ILOVEPDF_PUBLIC_KEY = originalKey;
  }
}

async function testUsageLookup() {
  const originalFetch = global.fetch;
  const originalKey = process.env.ILOVEPDF_PUBLIC_KEY;
  process.env.ILOVEPDF_PUBLIC_KEY = 'test-public-key';
  clearILovePdfConfigCache();
  global.fetch = async (url) => {
    if (String(url).endsWith('/auth')) {
      return new Response(JSON.stringify({ token: 'test-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(
      JSON.stringify({
        server: 'mock.ilovepdf.test',
        task: 'task-usage',
        remaining_credits: 2490,
        remaining_files: 249,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    const usage = await fetchILovePdfAccountUsage();
    assert.equal(usage.ok, true);
    assert.equal(usage.configured, true);
    assert.equal(usage.remainingCredits, 2490);
    assert.equal(usage.remainingFiles, 249);
    assert.equal(usage.estimatedCompressJobs, 249);
    assert.equal(usage.compressCreditsPerFile, 10);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ILOVEPDF_PUBLIC_KEY;
    else process.env.ILOVEPDF_PUBLIC_KEY = originalKey;
  }
}

function testGeneratePdfGuardsAndGlobalGate() {
  const source = fs.readFileSync(
    path.join(__dirname, '../netlify/functions/generate-pdf.js'),
    'utf8'
  );
  assert.match(source, /const shouldCompress = await isPdfCompressionEnabled\(\)/);
  assert.doesNotMatch(source, /body\.compression/);
  assert.match(source, /iframe\|frame\|object\|embed/);
  assert.match(source, /requestStartedAt \+ 22_000/);
  assert.match(
    source,
    /isPrivateOrLoopbackHost\(host\)\) return !process\.env\.AWS_LAMBDA_FUNCTION_NAME/
  );
}

async function run() {
  testGeneratePdfGuardsAndGlobalGate();
  await testSettingGate();
  await testCreditFallback();
  await testDeadlineFallback();
  await testUsageLookup();
  console.log('PDF compression tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
