#!/usr/bin/env node
/** Writes dist/_headers with CSP + security headers after `vite build`. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PRODUCTION_CSP } from './csp-config.mjs';
import { PERMISSIONS_POLICY } from './permissions-policy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');
const headersPath = path.join(distDir, '_headers');

const block = `
/*
  Content-Security-Policy: ${PRODUCTION_CSP}
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: ${PERMISSIONS_POLICY}
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
`;

if (!fs.existsSync(distDir)) {
  console.error('[inject-security-headers] dist/ not found — run vite build first');
  process.exit(1);
}

let existing = '';
if (fs.existsSync(headersPath)) {
  existing = fs.readFileSync(headersPath, 'utf8');
}

if (!existing.includes('Content-Security-Policy')) {
  fs.writeFileSync(headersPath, existing.trimEnd() + block);
  console.log('[inject-security-headers] wrote dist/_headers with CSP');
}

// Fail production build if dev URLs leaked into bundle
const assetDir = path.join(distDir, 'assets');
if (fs.existsSync(assetDir)) {
  const indexJs = fs
    .readdirSync(assetDir)
    .filter((f) => /^index-.*\.js$/.test(f))
    .map((f) => path.join(assetDir, f))[0];
  if (indexJs) {
    const js = fs.readFileSync(indexJs, 'utf8');
    if (/localhost:8888|127\.0\.0\.1:8888/.test(js)) {
      console.error('[inject-security-headers] FAIL: dev localhost URLs found in', path.basename(indexJs));
      process.exit(1);
    }
    if (/connect-src[^;]*localhost/.test(js)) {
      console.error('[inject-security-headers] FAIL: localhost in embedded CSP meta — use HTTP header only in prod');
      process.exit(1);
    }
  }
}
