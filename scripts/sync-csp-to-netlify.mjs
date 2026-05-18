#!/usr/bin/env node
/** Keeps netlify.toml Content-Security-Policy in sync with scripts/csp-config.mjs */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PRODUCTION_CSP } from './csp-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tomlPath = path.join(__dirname, '..', 'netlify.toml');
let toml = fs.readFileSync(tomlPath, 'utf8');

const line = `    Content-Security-Policy = "${PRODUCTION_CSP}"`;
const pattern = /    Content-Security-Policy = "[^"]*"/;

if (!pattern.test(toml)) {
  console.error('[sync-csp-to-netlify] Content-Security-Policy line not found in netlify.toml');
  process.exit(1);
}

toml = toml.replace(pattern, line);
fs.writeFileSync(tomlPath, toml);
console.log('[sync-csp-to-netlify] updated netlify.toml');
