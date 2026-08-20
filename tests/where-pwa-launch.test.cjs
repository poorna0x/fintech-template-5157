/**
 * Family office PWA must launch the exact /where/{token} page — never /, /admin, or /technician.
 * Run: node tests/where-pwa-launch.test.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const helper = require('../netlify/functions/tech-office-status-helper.js');

const TOKEN_RE = /^[A-Za-z0-9_-]{40,48}$/;

function whereTokenFromPath(pathname) {
  const m = String(pathname || '').match(/^\/where\/([A-Za-z0-9_-]{40,48})\/?$/);
  if (!m) return null;
  return TOKEN_RE.test(m[1]) ? m[1] : null;
}

function buildWhereWebManifest(startPath) {
  const token = whereTokenFromPath(String(startPath || '').split('?')[0]);
  const start_url = token ? `/where/${token}` : '/where/';
  return {
    id: start_url,
    scope: '/where/',
    start_url,
  };
}

function inScope(startUrl, scope) {
  return String(startUrl).startsWith(scope);
}

const root = path.join(__dirname, '..');

function run() {
  const token = helper.newPublicToken();
  assert.equal(helper.isValidPublicToken(token), true);
  assert.equal(whereTokenFromPath(`/where/${token}`), token);
  assert.equal(whereTokenFromPath(`/where/${token}/`), token);
  assert.equal(whereTokenFromPath('/where'), null);
  assert.equal(whereTokenFromPath('/where/'), null);
  assert.equal(whereTokenFromPath('/admin'), null);
  assert.equal(whereTokenFromPath('/technician'), null);
  assert.equal(whereTokenFromPath('/'), null);
  assert.equal(whereTokenFromPath('/where/short'), null);

  const withToken = buildWhereWebManifest(`/where/${token}?utm=1`);
  assert.equal(withToken.start_url, `/where/${token}`);
  assert.equal(withToken.id, `/where/${token}`);
  assert.equal(withToken.scope, '/where/');
  assert.equal(inScope(withToken.start_url, withToken.scope), true);
  assert.ok(!withToken.start_url.includes('/admin'));
  assert.ok(!withToken.start_url.includes('/technician'));
  assert.notEqual(withToken.start_url, '/');

  const noToken = buildWhereWebManifest('/where');
  assert.equal(noToken.start_url, '/where/');
  assert.equal(inScope(noToken.start_url, noToken.scope), true);

  const pwa = fs.readFileSync(path.join(root, 'src/lib/pwa.ts'), 'utf8');
  assert.ok(pwa.includes('buildWhereWebManifest'));
  assert.ok(!pwa.includes("id: '/where'"));
  assert.ok(pwa.includes("swUrl: '/where-sw.js'"));
  assert.ok(pwa.includes("scope: '/where/'"));

  const head = fs.readFileSync(path.join(root, 'public/head-pwa-manifest.js'), 'utf8');
  assert.ok(head.includes('hro_where_pwa_token_v1'));
  assert.ok(head.includes('start_url'));
  assert.ok(head.includes("path === '/where'"));
  assert.ok(!head.includes('/site.webmanifest') || head.indexOf("path.startsWith('/where") < head.indexOf('/site.webmanifest'));
  assert.ok(head.includes("id: startUrl"));
  assert.ok(!/shortcuts/.test(head));

  const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
  assert.ok(app.includes('path="/where/:token"'));
  assert.ok(app.includes('WherePwaLaunchPage'));
  assert.ok(app.indexOf('path="/where/:token"') < app.indexOf('path="*"'));

  const sw = fs.readFileSync(path.join(root, 'public/where-sw.js'), 'utf8');
  assert.ok(sw.includes("request.mode === 'navigate'"));
  assert.ok(sw.includes('fetch(request)'));
  assert.ok(!sw.includes("fetch('/')"));
  assert.ok(!sw.includes("'/index.html'"));

  const launch = fs.readFileSync(path.join(root, 'src/pages/WherePwaLaunchPage.tsx'), 'utf8');
  assert.ok(launch.includes('readWherePwaToken'));
  assert.ok(launch.includes('wherePwaPath'));
  assert.ok(launch.includes('Navigate'));

  const siteManifest = fs.readFileSync(path.join(root, 'public/site.webmanifest'), 'utf8');
  assert.ok(siteManifest.includes('"start_url": "/"'));
  assert.ok(siteManifest.includes('/admin'));

  console.log('where-pwa-launch.test.cjs: all checks passed');
}

run();
