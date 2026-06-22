#!/usr/bin/env node
/** Keeps netlify.toml + public/_redirects in sync with scripts/sensitive-public-paths.mjs */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  netlifySensitivePathRedirectsToml,
  publicRedirectsFileContent,
} from './sensitive-public-paths.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tomlPath = path.join(root, 'netlify.toml');
const redirectsPath = path.join(root, 'public', '_redirects');
const START = '# Block sensitive / probe paths with real 404 (before SPA catch-all)';
const END = '[build.environment]';

let toml = fs.readFileSync(tomlPath, 'utf8');
const block = netlifySensitivePathRedirectsToml();

const startIdx = toml.indexOf(START);
const endIdx = toml.indexOf(END);

if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
  console.error('[sync-sensitive-path-redirects] markers missing in netlify.toml');
  process.exit(1);
}

toml = `${toml.slice(0, startIdx)}${block}\n\n${toml.slice(endIdx)}`;
fs.writeFileSync(tomlPath, toml);

fs.writeFileSync(redirectsPath, publicRedirectsFileContent());
console.log('[sync-sensitive-path-redirects] updated netlify.toml and public/_redirects');
