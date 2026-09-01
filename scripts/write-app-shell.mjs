import { copyFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `dist/index.html` becomes the prerendered homepage, so it cannot also serve as
 * the SPA fallback: /admin and other client-only routes would paint the marketing
 * page before React routes. Keep an unprerendered copy for the fallback instead.
 * `public/_redirects` must send `/*` to `/app.html` (not `/index.html`).
 */
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const source = path.join(dist, 'index.html');
const target = path.join(dist, 'app.html');

try {
  await access(source);
} catch {
  console.error('[write-app-shell] dist/index.html not found — run vite build first');
  process.exit(1);
}

await copyFile(source, target);
console.log('[write-app-shell] wrote dist/app.html (SPA fallback shell)');
