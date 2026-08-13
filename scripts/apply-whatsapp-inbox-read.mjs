/**
 * Apply shared WhatsApp inbox read-watermark SQL.
 *   node scripts/apply-whatsapp-inbox-read.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadEnvLocal() {
  const envPath = path.join(root, '.env.local');
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const i = trimmed.indexOf('=');
    if (i < 0) continue;
    let v = trimmed.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[trimmed.slice(0, i).trim()] = v;
  }
  return out;
}

const env = loadEnvLocal();
const databaseUrl = env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL missing in .env.local');
  process.exit(1);
}

const sqlPath = path.join(root, 'scripts/add-whatsapp-inbox-read.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');
const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM public.whatsapp_inbox_read`
  );
  console.log('OK: whatsapp_inbox_read', rows[0] || null);
} finally {
  await client.end();
}
