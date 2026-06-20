// Netlify Function: render HTML to PDF via headless Chromium (Puppeteer).
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const { checkRateLimit, getClientIdentifier } = require('./rate-limiter');

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

function resolveChromeExecutablePath() {
  if (process.env.CHROME_EXECUTABLE_PATH) {
    return process.env.CHROME_EXECUTABLE_PATH;
  }

  const fs = require('fs');
  const candidates =
    process.platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ]
      : process.platform === 'win32'
        ? [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          ]
        : ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'];

  return candidates.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  });
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

  const localChrome = resolveChromeExecutablePath();
  if (localChrome) {
    try {
      return await puppeteer.launch({
        executablePath: localChrome,
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    } catch (error) {
      console.warn('[generate-pdf] Local Chrome launch failed, using bundled Chromium', error.message);
    }
  }

  return launchWithSparticuz();
}

async function renderHtmlToPdf(html) {
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setContent(html, {
      waitUntil: ['load', 'networkidle0'],
      timeout: 45000,
    });
    await page.emulateMediaType('print');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    return pdfBuffer;
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
    const pdfBuffer = await renderHtmlToPdf(html);

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
      body: pdfBuffer.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (error) {
    console.error('[generate-pdf] failed', { clientId, message: error.message });
    return jsonResponse(500, {
      error: 'Failed to generate PDF',
      details: error.message,
    });
  }
};
