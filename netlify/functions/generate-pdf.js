// Netlify Function: render HTML to PDF via headless Chromium (Puppeteer).
// Auth: admin or technician JWT required.
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const { getCorsHeaders, isOriginAllowed } = require('./cors-helper');
const { addSecurityHeaders } = require('./security-headers');
const { verifyStaffBearerToken } = require('./admin-auth-guard');
const { checkRateLimit, checkRateLimitForKey, getClientIdentifier } = require('./rate-limiter');
const { maybeCompressPdfBuffer } = require('./ilovepdf-compress-helper');
const {
  isPdfCompressionEnabled,
} = require('./pdf-compression-setting');

chromium.setGraphicsMode = false;

const MAX_HTML_BYTES = 3 * 1024 * 1024; // 3 MB
const MAX_FILENAME_LENGTH = 180;

const ALLOWED_ASSET_HOSTS = [
  'hydrogenro.com',
  'www.hydrogenro.com',
  'elevenro.com',
  'www.elevenro.com',
  'hydrogenro.netlify.app',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'localhost',
  '127.0.0.1',
];

function isPrivateOrLoopbackHost(host) {
  const h = String(host || '').toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  return false;
}

function isNgrokHost(host) {
  const h = String(host || '').toLowerCase();
  return (
    h.endsWith('.ngrok-free.app') ||
    h.endsWith('.ngrok-free.dev') ||
    h.endsWith('.ngrok.io') ||
    h.includes('.ngrok.')
  );
}
function jsonResponse(statusCode, corsHeaders, body) {
  return {
    statusCode,
    headers: addSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  };
}

function readBearerToken(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
}

function sanitizeFilename(raw) {
  const base = String(raw || 'document.pdf')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, MAX_FILENAME_LENGTH);
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

function getAllowedAssetHosts() {
  const hosts = new Set(ALLOWED_ASSET_HOSTS);
  for (const envUrl of [process.env.URL, process.env.DEPLOY_PRIME_URL]) {
    if (!envUrl) continue;
    try {
      hosts.add(new URL(envUrl).hostname.toLowerCase());
    } catch {
      /* skip invalid URL */
    }
  }
  return hosts;
}

function isAllowedPdfResourceUrl(url, requestOrigin) {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('data:') || url.startsWith('blob:')) return true;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

  const host = parsed.hostname.toLowerCase();
  // Local / LAN hosts are needed only by the local CRM. Never let production
  // Chromium reach Lambda/VPC/private-network addresses.
  if (isPrivateOrLoopbackHost(host)) return !process.env.AWS_LAMBDA_FUNCTION_NAME;

  if (requestOrigin) {
    try {
      const originHost = new URL(requestOrigin).hostname.toLowerCase();
      if (host === originHost) return true;
    } catch {
      /* ignore */
    }
  }

  // ngrok tunnels to local Vite — allow on dev machine (not production Lambda).
  if (isNgrokHost(host) && !process.env.AWS_LAMBDA_FUNCTION_NAME) return true;

  const allowedHosts = getAllowedAssetHosts();
  for (const allowed of allowedHosts) {
    if (host === allowed || host.endsWith(`.${allowed}`)) return true;
  }
  return false;
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

async function waitForDocumentFonts(page, timeoutMs = 2500) {
  await Promise.race([
    page
    .evaluate(async () => {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      const families = ['Poppins', 'Inter'];
      const weights = [300, 400, 500, 600, 700];
      for (const family of families) {
        for (const weight of weights) {
          try {
            await document.fonts.load(`${weight} 16px "${family}"`);
          } catch {
            /* ignore missing family */
          }
        }
      }
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
    })
    .catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
  await new Promise((resolve) => setTimeout(resolve, 300));
}

async function waitForDocumentImages(page, timeoutMs = 2500) {
  await Promise.race([
    page
    .evaluate(async () => {
      const imgs = Array.from(document.images || []);
      await Promise.all(
        imgs.map(
          (img) =>
            new Promise((resolve) => {
              if (img.complete) {
                resolve();
                return;
              }
              const done = () => resolve();
              img.addEventListener('load', done, { once: true });
              img.addEventListener('error', done, { once: true });
            })
        )
      );
    })
    .catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
  await new Promise((resolve) => setTimeout(resolve, 200));
}

async function renderHtmlToPdf(html, requestOrigin, options = {}) {
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (isAllowedPdfResourceUrl(req.url(), requestOrigin)) {
        try {
          const host = new URL(req.url()).hostname.toLowerCase();
          if (isNgrokHost(host)) {
            req.continue({
              headers: {
                ...req.headers(),
                'ngrok-skip-browser-warning': '1',
              },
            });
            return;
          }
        } catch {
          /* ignore */
        }
        req.continue();
        return;
      }
      console.warn('[generate-pdf] blocked asset', resourceType, req.url());
      req.abort();
    });

    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await page.setContent(html, {
      waitUntil: 'domcontentloaded',
      timeout: 8000,
    });
    await waitForDocumentFonts(page);
    await waitForDocumentImages(page);
    await page.emulateMediaType('print');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    const raw = Buffer.from(pdfBuffer);
    return raw;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/** Shared HTML→PDF for scheduled/internal callers (e.g. salary-slip-month-end). */
exports.renderHtmlToPdf = renderHtmlToPdf;

exports.handler = async (event) => {
  const requestStartedAt = Date.now();
  const requestOrigin = event.headers.origin || event.headers.Origin;
  const corsHeaders = getCorsHeaders(requestOrigin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: addSecurityHeaders(corsHeaders), body: '' };
  }

  if (requestOrigin && !isOriginAllowed(requestOrigin)) {
    return jsonResponse(403, corsHeaders, { error: 'Forbidden: Origin not allowed' });
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, corsHeaders, { error: 'Method not allowed' });
  }

  const token = readBearerToken(event);
  const auth = await verifyStaffBearerToken(token);
  if (!auth.ok) {
    return jsonResponse(401, corsHeaders, { error: auth.error || 'Unauthorized' });
  }

  const clientId = getClientIdentifier(event);
  const rate = checkRateLimit(event, {
    maxRequests: 30,
    windowMs: 60_000,
    endpoint: 'generate-pdf',
  });
  if (!rate.allowed) {
    return jsonResponse(429, corsHeaders, {
      error: 'Too many PDF requests. Please try again shortly.',
      retryAfterMs: Math.max(0, rate.resetTime - Date.now()),
    });
  }

  const userLimit = checkRateLimitForKey(`generate-pdf-user:${auth.userId}`, {
    maxRequests: 60,
    windowMs: 60 * 60 * 1000,
    endpoint: 'generate-pdf-user',
  });
  if (!userLimit.allowed) {
    return jsonResponse(429, corsHeaders, {
      error: 'Too many PDF requests. Please try again later.',
      retryAfterMs: Math.max(0, userLimit.resetTime - Date.now()),
    });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, corsHeaders, { error: 'Invalid JSON body' });
  }

  const html = typeof body.html === 'string' ? body.html.trim() : '';
  if (!html) {
    return jsonResponse(400, corsHeaders, { error: 'Missing html content' });
  }
  if (/<\s*(?:iframe|frame|object|embed)\b/i.test(html)) {
    return jsonResponse(400, corsHeaders, { error: 'Unsupported embedded document content' });
  }

  const htmlBytes = Buffer.byteLength(html, 'utf8');
  if (htmlBytes > MAX_HTML_BYTES) {
    return jsonResponse(413, corsHeaders, {
      error: `HTML payload too large (${htmlBytes} bytes, max ${MAX_HTML_BYTES})`,
    });
  }

  const filename = sanitizeFilename(body.filename);

  try {
    const shouldCompress = await isPdfCompressionEnabled();
    const rawPdf = await renderHtmlToPdf(html, requestOrigin, { filename });
    const functionBudgetMs = 25_000;
    const remainingMs = requestStartedAt + functionBudgetMs - Date.now();
    const minInlineCompressMs = 6_000;

    let pdfBytes = rawPdf;
    let compressed = false;
    let skipReason = shouldCompress ? null : 'toggle_off';
    let compressPending = false;

    if (shouldCompress && remainingMs >= minInlineCompressMs) {
      const result = await maybeCompressPdfBuffer(rawPdf, {
        filename,
        deadlineAt: Date.now() + remainingMs - 400,
      });
      pdfBytes = result.buffer;
      compressed = result.compressed === true;
      skipReason = result.skipReason || null;
      if (!compressed && result.skipReason === 'no_time') compressPending = true;
    } else if (shouldCompress) {
      skipReason = 'no_time';
      compressPending = true;
      console.warn('[generate-pdf] defer iLovePDF compress; Chromium used the function budget', {
        remainingMs,
      });
    }

    return {
      statusCode: 200,
      headers: addSecurityHeaders({
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      }),
      body: JSON.stringify({
        pdfBase64: pdfBytes.toString('base64'),
        filename,
        compressed,
        compressPending,
        skipReason,
      }),
    };
  } catch (error) {
    console.error('[generate-pdf] failed', { clientId, userId: auth.userId, message: error.message });
    return jsonResponse(500, corsHeaders, { error: 'Failed to generate PDF' });
  }
};
