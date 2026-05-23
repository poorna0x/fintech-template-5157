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

// Fail production build if dev URLs OR known secrets leaked into the bundle.
// We scan EVERY JS chunk under dist/assets, not just index-*.js — Vite splits
// frequently-imported modules (like the Cloudinary helper) into separate chunks.
const assetDir = path.join(distDir, 'assets');
if (fs.existsSync(assetDir)) {
  /** Patterns that must never appear in the public browser bundle. */
  const FORBIDDEN_PATTERNS = [
    // dev URLs
    { name: 'dev localhost URL', re: /localhost:8888|127\.0\.0\.1:8888/ },
    { name: 'localhost in embedded CSP meta', re: /connect-src[^;]*localhost/ },
    // Cloudinary
    {
      name: 'Cloudinary API secret env name',
      re: /VITE_CLOUDINARY(_SECONDARY)?_API_(KEY|SECRET)/,
    },
    {
      name: 'Cloudinary HTTP Basic header literal',
      re: /api\.cloudinary\.com[^"]{0,80}Basic\s+[A-Za-z0-9+/=]{20,}/,
    },
    // Supabase service-role JWT (role: "service_role" embedded in payload)
    {
      name: 'Supabase service-role JWT',
      re: /eyJ[A-Za-z0-9_-]+?\.eyJ[A-Za-z0-9_-]*?(c2VydmljZV9yb2xl|"role":"service_role")/,
    },
    // Hostinger SMTP password env literal — generic pattern
    { name: 'HOSTINGER_EMAIL_PASS env literal', re: /HOSTINGER_EMAIL_PASS/ },
    // Generic API-secret-looking env literal in code
    { name: 'API_SECRET env literal', re: /\bAPI_SECRET\b/ },
  ];

  const jsFiles = fs
    .readdirSync(assetDir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(assetDir, f));

  let failed = false;
  for (const file of jsFiles) {
    const js = fs.readFileSync(file, 'utf8');
    for (const { name, re } of FORBIDDEN_PATTERNS) {
      if (re.test(js)) {
        console.error(
          `[inject-security-headers] FAIL: ${name} found in ${path.basename(file)}`
        );
        failed = true;
      }
    }
  }
  if (failed) {
    console.error(
      '[inject-security-headers] One or more secret/dev-URL patterns leaked into the public bundle. Refusing to publish.'
    );
    process.exit(1);
  }
}
