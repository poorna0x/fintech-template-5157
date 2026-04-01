// Smoke-test CORS on production Netlify functions (OPTIONS + GET with Origin).
// When Netlify runs functions with isProduction() === false in cors-helper.js,
// responses use Access-Control-Allow-Origin: *. Set CORS_TEST_STRICT=1 to fail
// if a disallowed origin still receives * (use after tightening production detection).
import https from 'https';

const BASE_URL = process.env.CORS_TEST_BASE_URL || 'https://hydrogenro.com';
const FN_PATH = '/.netlify/functions/altcha-verify';
const STRICT = process.env.CORS_TEST_STRICT === '1';

function request(opts) {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function makeOptions(hostname, origin) {
  return {
    hostname,
    port: 443,
    path: `${FN_PATH}?complexity=12`,
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'GET',
    },
  };
}

function makeGet(hostname, origin) {
  return {
    hostname,
    port: 443,
    path: `${FN_PATH}?complexity=12`,
    method: 'GET',
    headers: { Origin: origin },
  };
}

async function runTests() {
  const { hostname } = new URL(BASE_URL);
  console.log('CORS production smoke test');
  console.log(`Base: ${BASE_URL}`);
  console.log(`Function: ${FN_PATH}`);
  console.log('');

  let failed = false;
  let warned = false;

  const allowedOrigins = [
    'https://hydrogenro.com',
    'https://www.hydrogenro.com',
  ];

  for (const origin of allowedOrigins) {
    const label = `OPTIONS (allowed ${origin})`;
    try {
      const res = await request(makeOptions(hostname, origin));
      const acao = res.headers['access-control-allow-origin'];
      const ok =
        res.status >= 200 &&
        res.status < 500 &&
        (acao === origin || acao === '*');
      if (!ok) {
        console.error(`FAIL ${label}: status=${res.status} ACAO=${acao ?? '(missing)'}`);
        failed = true;
      } else {
        console.log(`PASS ${label}: status=${res.status} ACAO=${acao}`);
      }
    } catch (e) {
      console.error(`FAIL ${label}: ${e.message}`);
      failed = true;
    }
  }

  const badOrigin = 'https://malicious-example.test';
  const badLabel = `OPTIONS (disallowed ${badOrigin})`;
  try {
    const res = await request(makeOptions(hostname, badOrigin));
    const acao = res.headers['access-control-allow-origin'];
    const lockedDown = acao === 'null' || acao === undefined;
    if (acao === '*') {
      const msg = `${badLabel}: ACAO=* (any origin). cors-helper may be using non-production CORS; review CONTEXT / NODE_ENV on Netlify.`;
      if (STRICT) {
        console.error(`FAIL ${msg}`);
        failed = true;
      } else {
        console.warn(`WARN ${msg}`);
        warned = true;
      }
    } else if (!lockedDown) {
      console.error(
        `FAIL ${badLabel}: expected ACAO null/absent or strict mode review, got ${acao}`,
      );
      failed = true;
    } else {
      console.log(`PASS ${badLabel}: ACAO=${acao ?? '(absent)'}`);
    }
  } catch (e) {
    console.error(`FAIL ${badLabel}: ${e.message}`);
    failed = true;
  }

  const getLabel = `GET challenge (allowed ${allowedOrigins[0]})`;
  try {
    const res = await request(makeGet(hostname, allowedOrigins[0]));
    const acao = res.headers['access-control-allow-origin'];
    const ok =
      res.status === 200 &&
      (acao === allowedOrigins[0] || acao === '*');
    if (!ok) {
      console.error(
        `FAIL ${getLabel}: status=${res.status} ACAO=${acao ?? '(missing)'}`,
      );
      failed = true;
    } else {
      console.log(`PASS ${getLabel}: status=${res.status}`);
    }
  } catch (e) {
    console.error(`FAIL ${getLabel}: ${e.message}`);
    failed = true;
  }

  console.log('');
  if (failed) {
    console.error('Some checks failed.');
    process.exit(1);
  }
  if (warned) {
    console.log(
      'Finished with warnings. Re-run with CORS_TEST_STRICT=1 after locking down CORS.',
    );
  } else {
    console.log('All checks passed.');
  }
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
