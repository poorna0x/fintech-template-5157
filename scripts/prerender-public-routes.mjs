import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const puppeteer = require('../netlify/functions/node_modules/puppeteer-core');
const chromium = require('../netlify/functions/node_modules/@sparticuz/chromium');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

// Highest-value public entry pages. The remaining long-tail routes continue to
// use the SPA fallback and can be added here when search demand justifies it.
const routes = [
  '/',
  '/services',
  '/ro-installation',
  '/ro-repair',
  '/ro-service-whitefield',
  '/ro-service-electronic-city',
  '/ro-service-hsr-layout',
  '/ro-service-koramangala',
  '/ro-service-sarjapur',
  '/ro-service-hebbal',
  '/ro-service-yelahanka',
];

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveStaticFile(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split('?')[0]);
  const requested = path.resolve(dist, `.${cleanPath}`);
  if (!requested.startsWith(`${dist}${path.sep}`) && requested !== dist) return null;

  if (await fileExists(requested)) {
    const info = await stat(requested);
    if (info.isFile()) return requested;
    const nestedIndex = path.join(requested, 'index.html');
    if (await fileExists(nestedIndex)) return nestedIndex;
  }

  return path.join(dist, 'index.html');
}

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const filePath = await resolveStaticFile(req.url || '/');
        if (!filePath) {
          res.writeHead(404).end();
          return;
        }
        const body = await readFile(filePath);
        res.writeHead(200, {
          'cache-control': 'no-store',
          'content-type': mimeTypes[path.extname(filePath)] || 'application/octet-stream',
        });
        res.end(body);
      } catch (error) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(String(error));
      }
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function browserExecutable() {
  const localChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (process.platform === 'darwin' && await fileExists(localChrome)) return localChrome;
  return chromium.executablePath();
}

async function main() {
  if (!await fileExists(path.join(dist, 'index.html'))) {
    throw new Error('dist/index.html is missing; run vite build before prerendering');
  }

  const clientShell = await readFile(path.join(dist, 'index.html'), 'utf8');
  const shellModulePreloads = [...clientShell.matchAll(
    /<link\b[^>]*\brel=["']modulepreload["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi,
  )].map((match) => match[1]);

  const server = await startStaticServer();
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not start prerender server');
  const origin = `http://127.0.0.1:${address.port}`;

  const browser = await puppeteer.launch({
    executablePath: await browserExecutable(),
    args:
      process.platform === 'darwin'
        ? ['--no-sandbox', '--disable-dev-shm-usage']
        : [...new Set([...(chromium.args || []), '--no-sandbox', '--disable-dev-shm-usage'])],
    headless: true,
    protocolTimeout: 60_000,
  });
  const snapshots = [];

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });

    for (const route of routes) {
      const response = await page.goto(`${origin}${route}`, {
        waitUntil: 'networkidle0',
        timeout: 60_000,
      });
      if (!response?.ok()) {
        throw new Error(`Prerender failed for ${route}: HTTP ${response?.status() ?? 'unknown'}`);
      }

      await page.waitForSelector('#root > *', { timeout: 20_000 });
      await page.evaluate((allowedModulePreloads) => {
        document.documentElement.dataset.prerendered = 'true';
        // Cookie banner is client-consent UI. Leaving it in the snapshot makes it
        // flash on then off after React hydrates (especially if the visitor already
        // accepted/rejected in localStorage).
        document.querySelectorAll('[data-cookie-consent-banner]').forEach((el) => el.remove());
        // React.lazy/Vite appends preloads while producing the snapshot. Those
        // are not first-paint dependencies and must not become eager downloads
        // when the generated HTML is served to a real visitor.
        document.querySelectorAll('link[rel="modulepreload"]').forEach((link) => {
          const href = link.getAttribute('href');
          if (!href || !allowedModulePreloads.includes(href)) link.remove();
        });
      }, shellModulePreloads);

      const html = await page.content();
      const output =
        route === '/'
          ? path.join(dist, 'index.html')
          : path.join(dist, route.slice(1), 'index.html');
      snapshots.push({ route, output, html });
    }
  } finally {
    await browser.close();
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }

  for (const { route, output, html } of snapshots) {
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, html);
    console.log(`Prerendered ${route} -> ${path.relative(root, output)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
