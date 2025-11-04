// Script to hash existing plaintext technician passwords
// Run this script to migrate plaintext passwords to bcrypt hashes
// Usage: node hash-technician-passwords.js

import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || 'YOUR_SERVICE_ROLE_KEY';

if (supabaseUrl === 'YOUR_SUPABASE_URL' || supabaseServiceKey === 'YOUR_SERVICE_ROLE_KEY') {
  console.error('❌ Error: Please set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables');
  console.error('   Example:');
  console.error('   export VITE_SUPABASE_URL="https://your-project.supabase.co"');
  console.error('   export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"');
  console.error('   node hash-technician-passwords.js');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function hashTechnicianPasswords() {
  console.log('🔐 Starting password hashing migration...');
  console.log('');

  try {
    // Fetch all technicians with plaintext passwords
    const { data: technicians, error: fetchError } = await supabase
      .from('technicians')
      .select('id, email, full_name, password, account_status');

    if (fetchError) {
      console.error('❌ Error fetching technicians:', fetchError);
      return;
    }

    if (!technicians || technicians.length === 0) {
      console.log('ℹ️  No technicians found in database');
      return;
    }

    console.log(`📋 Found ${technicians.length} technician(s)`);
    console.log('');

    let hashedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const tech of technicians) {
      // Skip if no password
      if (!tech.password) {
        console.log(`⏭️  Skipping ${tech.email || tech.full_name}: No password set`);
        skippedCount++;
        continue;
      }

      // Check if already hashed (bcrypt hashes start with $2a$, $2b$, or $2y$)
      const isHashed = tech.password.startsWith('$2a$') || 
                       tech.password.startsWith('$2b$') || 
                       tech.password.startsWith('$2y$');

      if (isHashed) {
        console.log(`✅ Skipping ${tech.email || tech.full_name}: Password already hashed`);
        skippedCount++;
        continue;
      }

      // Hash the plaintext password
      console.log(`🔒 Hashing password for ${tech.email || tech.full_name}...`);
      const saltRounds = 10; // bcrypt cost factor (10 = 2^10 iterations)
      const hashedPassword = await bcrypt.hash(tech.password, saltRounds);

      // Update the technician's password in database
      const { error: updateError } = await supabase
        .from('technicians')
        .update({ password: hashedPassword })
        .eq('id', tech.id);

      if (updateError) {
        console.error(`❌ Error updating ${tech.email || tech.full_name}:`, updateError.message);
        errorCount++;
      } else {
        console.log(`✅ Successfully hashed password for ${tech.email || tech.full_name}`);
        hashedCount++;
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('📊 Migration Summary');
    console.log('='.repeat(60));
    console.log(`✅ Passwords hashed: ${hashedCount}`);
    console.log(`⏭️  Skipped (already hashed or no password): ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📋 Total technicians: ${technicians.length}`);
    console.log('');

    if (hashedCount > 0) {
      console.log('✅ Migration completed successfully!');
      console.log('⚠️  IMPORTANT: Old plaintext passwords are now replaced with hashes.');
      console.log('   Technicians can still login with their original passwords.');
    } else {
      console.log('ℹ️  No passwords needed to be hashed.');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
hashTechnicianPasswords();

