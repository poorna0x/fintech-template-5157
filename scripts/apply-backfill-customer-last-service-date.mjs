/**
 * Apply last_service_date backfill from completed jobs.
 *   node scripts/apply-backfill-customer-last-service-date.mjs
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

const sql = fs.readFileSync(path.join(root, 'scripts/backfill-customer-last-service-date.sql'), 'utf8');
const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const result = await client.query(sql);
  const check = await client.query(`
    SELECT customer_id, last_service_date
    FROM public.customers
    WHERE customer_id = 'C1917'
  `);
  const missing = await client.query(`
    SELECT COUNT(*)::int AS n
    FROM public.customers c
    WHERE EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.customer_id = c.id AND j.status = 'COMPLETED'
    )
    AND c.last_service_date IS NULL
  `);
  console.log('OK: backfill rowCount', result.rowCount);
  console.log('C1917', check.rows[0]);
  console.log('still_missing_last_service_date', missing.rows[0]);
} finally {
  await client.end();
}
