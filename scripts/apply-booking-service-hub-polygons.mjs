/**
 * Apply booking hub polygon column.
 *   node scripts/apply-booking-service-hub-polygons.mjs
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

function withPooler(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('pooler.supabase.com')) return url;
    if (parsed.hostname.endsWith('.supabase.co')) {
      const parts = parsed.hostname.split('.');
      const projectRef = parts[0] === 'db' ? parts[1] : parts[0];
      parsed.hostname = 'aws-1-ap-south-1.pooler.supabase.com';
      parsed.port = '5432';
      parsed.username = `postgres.${projectRef}`;
      return parsed.toString();
    }
  } catch {
    /* keep original */
  }
  return url;
}

const env = loadEnvLocal();
const databaseUrl = env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL missing in .env.local');
  process.exit(1);
}

const sqlPath = path.join(root, 'scripts/add-booking-service-hub-polygons.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');
const client = new pg.Client({
  connectionString: withPooler(databaseUrl),
  ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
});
await client.connect();
try {
  await client.query(sql);
  const { rows } = await client.query(`
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'booking_service_hubs'
          AND column_name = 'polygon'
      ) AS has_polygon
  `);
  console.log('OK: applied scripts/add-booking-service-hub-polygons.sql');
  console.log('polygon column:', rows[0]?.has_polygon);
} finally {
  await client.end();
}
