#!/usr/bin/env node
/**
 * One-time: create Supabase Auth users for technicians (auth.users.id = technicians.id).
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/provision-technician-auth-users.mjs
 *
 * Technicians must reset password in Supabase Dashboard or via Settings after this
 * (or pass TEMP_PASSWORD env to set the same temp password for all).
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const tempPassword = process.env.TEMP_PASSWORD || `HydrogenTech-${Date.now().toString(36)}!`;

if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: technicians, error } = await admin
  .from('technicians')
  .select('id, email, full_name, account_status')
  .eq('account_status', 'ACTIVE');

if (error) {
  console.error('Failed to load technicians:', error.message);
  process.exit(1);
}

console.log(`Found ${technicians?.length ?? 0} active technicians`);
console.log(`Temp password for new users: ${tempPassword}`);
console.log('Share individually and ask each technician to change it in Settings.\n');

for (const tech of technicians || []) {
  const email = (tech.email || '').toLowerCase().trim();
  if (!email) {
    console.warn(`Skip ${tech.id}: no email`);
    continue;
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    id: tech.id,
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      role: 'technician',
      full_name: tech.full_name,
    },
    app_metadata: { role: 'technician' },
  });

  if (!createError) {
    console.log(`Created auth user: ${email} (${tech.id})`);
    continue;
  }

  if (createError.message?.includes('already') || createError.status === 422) {
    const { error: updateError } = await admin.auth.admin.updateUserById(tech.id, {
      email,
      password: tempPassword,
      user_metadata: { role: 'technician', full_name: tech.full_name },
      app_metadata: { role: 'technician' },
    });
    if (updateError) {
      console.error(`Update failed ${email}:`, updateError.message);
    } else {
      console.log(`Updated auth user: ${email} (${tech.id})`);
    }
    continue;
  }

  console.error(`Failed ${email}:`, createError.message);
}

console.log('\nDone. Deploy secure-customers-rls.sql and app updates, then have technicians log in with the temp password.');
