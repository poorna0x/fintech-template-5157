// Netlify Function: render HTML to PDF via headless Chromium (Puppeteer).
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const { checkRateLimit, getClientIdentifier } = require('./rate-limiter');

// Reduce Chromium startup time/memory on serverless.
chromium.setGraphicsMode = false;

const MAX_HTML_BYTES = 3 * 1024 * 1024; // 3 MB
const MAX_FILENAME_LENGTH = 180;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function sanitizeFilename(raw) {
  const base = String(raw || 'document.pdf')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, MAX_FILENAME_LENGTH);
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

function listBrowserExecutablePaths() {
  const fs = require('fs');
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const paths = [];

  const envPath = process.env.CHROME_EXECUTABLE_PATH?.trim();
  if (envPath) {
    try {
      if (fs.existsSync(envPath)) {
        paths.push(envPath);
      } else {
        console.warn(
          `[generate-pdf] CHROME_EXECUTABLE_PATH not found (${envPath}), trying auto-detect…`
        );
      }
    } catch {
      console.warn('[generate-pdf] Could not read CHROME_EXECUTABLE_PATH, trying auto-detect…');
    }
  }

  const candidates =
    process.platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
          '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
          '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
          '/Applications/Arc.app/Contents/MacOS/Arc',
          home ? `${home}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` : null,
        ].filter(Boolean)
      : process.platform === 'win32'
        ? [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
          ]
        : [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium',
            '/snap/bin/chromium',
          ];

  for (const candidate of candidates) {
    if (paths.includes(candidate)) continue;
    try {
      if (fs.existsSync(candidate)) {
        paths.push(candidate);
      }
    } catch {
      /* skip */
    }
  }

  return paths;
}

async function launchBrowser() {
  const launchWithSparticuz = async () =>
    puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

  const isServerless = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (isServerless) {
    return launchWithSparticuz();
  }

  const browserPaths = listBrowserExecutablePaths();
  if (browserPaths.length === 0) {
    throw new Error(
      'No Chrome, Brave, Edge, or Chromium found for local PDF generation. Install a Chromium browser or set CHROME_EXECUTABLE_PATH in .env.local (see .env.example).'
    );
  }

  let lastError;
  for (const executablePath of browserPaths) {
    try {
      console.log(`[generate-pdf] Launching headless browser: ${executablePath}`);
      return await puppeteer.launch({
        executablePath,
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
    } catch (error) {
      lastError = error;
      console.warn(`[generate-pdf] Failed to launch ${executablePath}:`, error.message);
    }
  }

  throw lastError || new Error('Could not launch a local browser for PDF generation');
}

async function renderHtmlToPdf(html) {
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await page.setContent(html, {
      waitUntil: 'load',
      timeout: 30000,
    });
    await page.evaluate(() => document.fonts.ready).catch(() => undefined);
    await page.emulateMediaType('print');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const clientId = getClientIdentifier(event);
  const rate = checkRateLimit(event, {
    maxRequests: 30,
    windowMs: 60_000,
    endpoint: 'generate-pdf',
  });
  if (!rate.allowed) {
    return jsonResponse(429, {
      error: 'Too many PDF requests. Please try again shortly.',
      retryAfterMs: Math.max(0, rate.resetTime - Date.now()),
    });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }

  const html = typeof body.html === 'string' ? body.html.trim() : '';
  if (!html) {
    return jsonResponse(400, { error: 'Missing html content' });
  }

  const htmlBytes = Buffer.byteLength(html, 'utf8');
  if (htmlBytes > MAX_HTML_BYTES) {
    return jsonResponse(413, {
      error: `HTML payload too large (${htmlBytes} bytes, max ${MAX_HTML_BYTES})`,
    });
  }

  const filename = sanitizeFilename(body.filename);

  try {
    const pdfBytes = await renderHtmlToPdf(html);

    // JSON + base64 avoids Netlify Lambda binary decode errors (502 illegal base64).
    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({
        pdfBase64: pdfBytes.toString('base64'),
        filename,
      }),
    };
  } catch (error) {
    console.error('[generate-pdf] failed', { clientId, message: error.message });
    return jsonResponse(500, {
      error: 'Failed to generate PDF',
      details: error.message,
    });
  }
};
