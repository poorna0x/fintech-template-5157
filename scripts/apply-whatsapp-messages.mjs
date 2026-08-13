/**
 * Apply WhatsApp Phase 1 SQL + upsert Cloud API secrets into app_secrets.
 * Local only — reads .env.local. Does not print secret values.
 *
 *   node scripts/apply-whatsapp-messages.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

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
const supabaseUrl = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').trim();
const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!databaseUrl) {
  console.error('Missing DATABASE_URL in .env.local');
  process.exit(1);
}

const sqlPath = path.join(root, 'scripts/add-whatsapp-messages.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query(sql);
  console.log('OK: applied scripts/add-whatsapp-messages.sql');
} finally {
  await client.end();
}

if (!supabaseUrl || !serviceKey) {
  console.warn('Skip app_secrets upsert (missing Supabase URL or service role key)');
  process.exit(0);
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const pairs = [
  ['whatsapp_access_token', env.WHATSAPP_ACCESS_TOKEN],
  ['whatsapp_phone_number_id', env.PHONE_NUMBER_ID],
  ['whatsapp_verify_token', env.VERIFY_TOKEN],
  ['whatsapp_waba_id', env.WHATSAPP_WABA_ID],
].filter(([, v]) => v && String(v).trim());

for (const [key, value] of pairs) {
  const { error } = await admin.from('app_secrets').upsert(
    { key, value: String(value).trim() },
    { onConflict: 'key' }
  );
  if (error) {
    console.error(`app_secrets upsert failed for ${key}:`, error.message);
    process.exit(1);
  }
  console.log(`OK: app_secrets.${key} upserted (len=${String(value).trim().length})`);
}

const { count, error: countErr } = await admin
  .from('whatsapp_messages')
  .select('id', { count: 'exact', head: true });
if (countErr) {
  console.error('whatsapp_messages check failed:', countErr.message);
  process.exit(1);
}
console.log(`OK: whatsapp_messages readable (count=${count ?? 0})`);
