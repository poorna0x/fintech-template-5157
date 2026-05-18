#!/usr/bin/env node
/** Keeps netlify.toml security headers in sync with scripts/*.mjs */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PRODUCTION_CSP } from './csp-config.mjs';
import { PERMISSIONS_POLICY } from './permissions-policy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tomlPath = path.join(__dirname, '..', 'netlify.toml');
let toml = fs.readFileSync(tomlPath, 'utf8');

const replacements = [
  [/    Content-Security-Policy = "[^"]*"/, `    Content-Security-Policy = "${PRODUCTION_CSP}"`],
  [/    Permissions-Policy = "[^"]*"/, `    Permissions-Policy = "${PERMISSIONS_POLICY}"`],
];

for (const [pattern, line] of replacements) {
  if (!pattern.test(toml)) {
    console.error('[sync-csp-to-netlify] missing line for', line.slice(0, 40));
    process.exit(1);
  }
  toml = toml.replace(pattern, line);
}

fs.writeFileSync(tomlPath, toml);
console.log('[sync-csp-to-netlify] updated netlify.toml (CSP + Permissions-Policy)');
