/**
 * Download the live portal shell (app.html + the JS/CSS it reaches) into both
 * APK asset folders. Cold start serves these from disk. Run before an APK build:
 *   node scripts/pack-appshell.mjs
 *
 * Generated files are gitignored. A later cold start refreshes them in the
 * background from hydrogenro.com, so a web deploy does not need a new APK.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ORIGIN = 'https://hydrogenro.com';
const UA =
  'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const ASSET_REF = /(?:^|[^A-Za-z0-9_])(assets\/[A-Za-z0-9._~-]+)/g;
const REL_REF =
  /(?:^|[^A-Za-z0-9_])(\.\/[A-Za-z0-9._~-]+\.(?:js|mjs|css|woff2|woff|ttf|svg|png|webp|json|wasm))/g;
const HEAD_REF = /\/head-[a-z0-9-]+\.js/g;
const MAX_FILES = 500;
const MAX_BYTES = 60 * 1024 * 1024;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destinations = [
  path.join(root, 'android/app/src/main/assets/appshell'),
  path.join(root, 'android-admin/app/src/main/assets/appshell'),
];

function isShellFile(rel) {
  if (rel === 'app.html') return true;
  if (rel.startsWith('assets/') && /^assets\/[A-Za-z0-9._~-]+$/.test(rel) && !rel.endsWith('.map')) {
    return true;
  }
  return /^head-[a-z0-9-]+\.js$/.test(rel);
}

function resolveRel(fromRel, spec) {
  if (!spec.startsWith('./') || spec.includes('..')) return null;
  const slash = fromRel.lastIndexOf('/');
  const dir = slash >= 0 ? fromRel.slice(0, slash + 1) : '';
  return dir + spec.slice(2);
}

function collectRefs(fromRel, text, into) {
  for (const match of text.matchAll(ASSET_REF)) {
    const rel = match[1];
    if (isShellFile(rel)) into.add(rel);
  }
  for (const match of text.matchAll(REL_REF)) {
    const rel = resolveRel(fromRel, match[1]);
    if (rel && isShellFile(rel)) into.add(rel);
  }
  for (const match of text.matchAll(HEAD_REF)) {
    const rel = match[0].slice(1);
    if (isShellFile(rel)) into.add(rel);
  }
}

function isText(rel) {
  return /\.(html|js|mjs|css|json|svg)$/.test(rel);
}

async function download(rel) {
  const res = await fetch(`${ORIGIN}/${rel}`, {
    headers: { 'User-Agent': UA, Accept: '*/*' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for /${rel}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}

const html = await download('app.html');
const htmlText = html.toString('utf8');
if (!htmlText.includes('/assets/') || !htmlText.includes('id="root"')) {
  throw new Error('/app.html did not look like the portal shell');
}

const files = new Map([['app.html', html]]);
const queue = [];
const seen = new Set(['app.html']);
collectRefs('app.html', htmlText, seen);
for (const rel of seen) {
  if (rel !== 'app.html') queue.push(rel);
}

let total = html.length;
const CONCURRENCY = 8;
while (queue.length) {
  if (files.size > MAX_FILES || total > MAX_BYTES) {
    throw new Error(`appshell exceeded cap (${files.size} files, ${total} bytes)`);
  }
  const batch = queue.splice(0, CONCURRENCY);
  const downloaded = await Promise.all(batch.map(async (rel) => [rel, await download(rel)]));
  for (const [rel, buf] of downloaded) {
    total += buf.length;
    files.set(rel, buf);
    if (!isText(rel)) continue;
    const more = new Set();
    collectRefs(rel, buf.toString('utf8'), more);
    for (const next of more) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
}

for (const dest of destinations) {
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  for (const [rel, buf] of files) {
    const out = path.join(dest, rel);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, buf);
  }
}

const mb = (total / (1024 * 1024)).toFixed(1);
console.log(`[pack-appshell] ${files.size} files, ${mb} MB → both APK asset folders`);
