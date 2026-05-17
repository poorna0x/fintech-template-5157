#!/usr/bin/env node
/**
 * Compare technicians table vs Supabase Auth users (role = technician, id match).
 * Usage: node scripts/check-technician-auth-coverage.mjs
 * Loads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env.local');

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: technicians, error: techErr } = await admin
  .from('technicians')
  .select('id, full_name, email, account_status')
  .order('full_name');

if (techErr) {
  console.error('Failed to load technicians:', techErr.message);
  process.exit(1);
}

const authUsers = [];
let page = 1;
const perPage = 1000;
while (true) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
  if (error) {
    console.error('Failed to list auth users:', error.message);
    process.exit(1);
  }
  authUsers.push(...(data.users || []));
  if (!data.users?.length || data.users.length < perPage) break;
  page += 1;
}

const authById = new Map(authUsers.map((u) => [u.id, u]));
const authByEmail = new Map(
  authUsers.map((u) => [u.email?.toLowerCase(), u])
);

const active = technicians.filter((t) => t.account_status === 'ACTIVE');
const inactive = technicians.filter((t) => t.account_status !== 'ACTIVE');

function checkTech(t) {
  const byId = authById.get(t.id);
  const byEmail = authByEmail.get(t.email?.toLowerCase());
  const role =
    byId?.app_metadata?.role || byId?.user_metadata?.role || byEmail?.app_metadata?.role || byEmail?.user_metadata?.role;

  if (byId && role === 'technician') {
    return { status: 'ok', detail: 'Auth user id matches technicians.id' };
  }
  if (byId && role !== 'technician') {
    return { status: 'wrong_role', detail: `Auth role is "${role || 'unknown'}", not technician` };
  }
  if (byEmail && byEmail.id !== t.id) {
    return {
      status: 'id_mismatch',
      detail: `Auth exists for email but id=${byEmail.id} (expected ${t.id})`,
    };
  }
  return { status: 'missing', detail: 'No Auth user — needs login once or provision script' };
}

console.log('\n=== Technician Supabase Auth coverage ===\n');
console.log(`Active technicians:   ${active.length}`);
console.log(`Inactive/other:       ${inactive.length}`);
console.log(`Total Auth users:     ${authUsers.length}`);
console.log(`Technician-role Auth: ${authUsers.filter((u) => (u.app_metadata?.role || u.user_metadata?.role) === 'technician').length}\n`);

const missing = [];
const problems = [];
const ok = [];

for (const t of technicians) {
  const r = checkTech(t);
  const row = { name: t.full_name, email: t.email, status: t.account_status, ...r };
  if (r.status === 'ok') ok.push(row);
  else if (r.status === 'missing') missing.push(row);
  else problems.push(row);
}

if (ok.length) {
  console.log(`✅ Linked (${ok.length}):`);
  for (const r of ok) {
    console.log(`   ${r.name} <${r.email}> [${r.status}]`);
  }
}

if (missing.length) {
  console.log(`\n❌ Missing Auth (${missing.length}):`);
  for (const r of missing) {
    console.log(`   ${r.name} <${r.email}> [${r.status}] — ${r.detail}`);
  }
}

if (problems.length) {
  console.log(`\n⚠️  Needs fix (${problems.length}):`);
  for (const r of problems) {
    console.log(`   ${r.name} <${r.email}> — ${r.detail}`);
  }
}

const activeMissing = missing.filter((r) => r.status === 'ACTIVE' || r.status?.includes('ACTIVE'));
const activeOk = ok.filter((r) => r.status === 'ACTIVE');

console.log('\n--- Summary (ACTIVE only) ---');
const activeCount = active.length;
const activeLinked = active.filter((t) => checkTech(t).status === 'ok').length;
console.log(`Active with Auth: ${activeLinked} / ${activeCount}`);

if (activeLinked === activeCount && problems.length === 0) {
  console.log('\n✅ All active technicians have matching Supabase Auth users.\n');
  process.exit(0);
}

console.log('\n➡️  Ask missing ACTIVE techs to log in once, or run:');
console.log('   node scripts/provision-technician-auth-users.mjs\n');
process.exit(missing.some((m) => m.status === 'ACTIVE') || problems.length ? 1 : 0);
