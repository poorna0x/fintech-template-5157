/**
 * Apply job_reviews table + RPCs.
 *   node scripts/apply-job-reviews.mjs
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

const sqlPath = path.join(root, 'scripts/add-job-reviews.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');
const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
});
await client.connect();
try {
  await client.query(sql);
  const { rows } = await client.query(`
    SELECT
      to_regclass('public.job_reviews') AS table_name,
      (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname IN (
          'create_job_review_invite',
          'get_job_review_invite',
          'submit_job_review',
          'job_review_technician_stats'
        )) AS rpc_count
  `);
  console.log('OK: applied scripts/add-job-reviews.sql');
  console.log('table:', rows[0]?.table_name);
  console.log('rpcs:', rows[0]?.rpc_count);
} finally {
  await client.end();
}
