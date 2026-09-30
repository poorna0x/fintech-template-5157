/**
 * Apply last_service_date trigger on jobs.
 *   node scripts/apply-customer-last-service-date-trigger.mjs
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
if (!env.DATABASE_URL) {
  console.error('DATABASE_URL missing in .env.local');
  process.exit(1);
}

const sql = fs.readFileSync(
  path.join(root, 'scripts/add-customer-last-service-date-trigger.sql'),
  'utf8'
);
const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
try {
  await client.query(sql);
  const { rows } = await client.query(`
    SELECT tgname
    FROM pg_trigger
    WHERE tgrelid = 'public.jobs'::regclass
      AND tgname = 'trg_sync_customer_last_service_date'
  `);
  console.log('OK: trigger', rows[0]?.tgname || 'MISSING');
} finally {
  await client.end();
}
