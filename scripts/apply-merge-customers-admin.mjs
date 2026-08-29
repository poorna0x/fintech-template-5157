/**
 * Apply customer merge RPC (location choice + FK remap).
 *   node scripts/apply-merge-customers-admin.mjs
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

const sqlPath = path.join(root, 'scripts/merge-customers-admin-rpc.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');
const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
});
await client.connect();
try {
  const fks = await client.query(`
    SELECT tc.table_name, kcu.column_name, rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_schema = 'public'
      AND ccu.table_name = 'customers'
      AND ccu.column_name = 'id'
    ORDER BY tc.table_name
  `);
  console.log('FKs → customers(id):');
  for (const r of fks.rows) {
    console.log(`  ${r.table_name}.${r.column_name}  ON DELETE ${r.delete_rule}`);
  }

  await client.query(sql);

  const procs = await client.query(`
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'merge_customers_admin',
        'preview_merge_customers_admin',
        '_customer_has_map_pin'
      )
    ORDER BY 1, 2
  `);
  console.log('\nFunctions:');
  for (const r of procs.rows) console.log(`  ${r.proname}(${r.args})`);

  const pins = await client.query(`
    SELECT
      public._customer_has_map_pin('{"latitude":12.97,"longitude":77.59}'::jsonb) AS real_pin,
      public._customer_has_map_pin('{"latitude":0,"longitude":0}'::jsonb) AS zero_pin,
      public._customer_has_map_pin('{"latitude":12.97}'::jsonb) AS lat_only,
      public._customer_has_map_pin('{}'::jsonb) AS empty_obj,
      public._customer_has_map_pin(NULL) AS nil
  `);
  const p = pins.rows[0];
  const pinOk =
    p.real_pin === true &&
    p.zero_pin === false &&
    p.lat_only === false &&
    p.empty_obj === false &&
    p.nil === false;
  console.log('\nPin helper:', p, pinOk ? 'OK' : 'FAIL');
  if (!pinOk) process.exit(1);

  const mergeArgs = procs.rows.filter((r) => r.proname === 'merge_customers_admin').map((r) => r.args);
  if (!mergeArgs.some((a) => a.includes('p_location_from'))) {
    console.error('merge_customers_admin missing p_location_from');
    process.exit(1);
  }

  console.log('\nOK: applied scripts/merge-customers-admin-rpc.sql');
} finally {
  await client.end();
}
