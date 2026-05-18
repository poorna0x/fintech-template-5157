#!/usr/bin/env node
/** Writes dist/_headers with CSP + security headers after `vite build`. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PRODUCTION_CSP } from './csp-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');
const headersPath = path.join(distDir, '_headers');

const block = `
/*
  Content-Security-Policy: ${PRODUCTION_CSP}
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), bluetooth=(), camera=(self), clipboard-read=(), clipboard-write=(self), compute-pressure=(), display-capture=(), encrypted-media=(), fullscreen=(self), gamepad=(), geolocation=(self), gyroscope=(), hid=(), identity-credentials-get=(), idle-detection=(), local-fonts=(), magnetometer=(), microphone=(), midi=(), otp-credentials=(), payment=(), picture-in-picture=(), publickey-credentials-create=(), publickey-credentials-get=(), screen-wake-lock=(), serial=(), speaker-selection=(), sync-xhr=(), usb=(), web-share=(), window-management=(), xr-spatial-tracking=()
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
