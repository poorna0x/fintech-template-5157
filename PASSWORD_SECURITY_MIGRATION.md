# Password Security Migration Guide

## Overview

This codebase has been updated to use secure password hashing (bcrypt) instead of plaintext password storage. This document explains how to migrate existing passwords and set up new passwords securely.

## What Changed?

### Before (Insecure)
- Passwords stored in plaintext in database
- Direct string comparison: `technician.password === password`

### After (Secure)
- Passwords hashed using bcrypt (10 salt rounds)
- Server-side password verification via Netlify function
- Secure comparison resistant to timing attacks

## Migration Steps

### Option 1: Using Node.js Script (Recommended)

1. **Install dependencies:**
   ```bash
   cd netlify/functions
   npm install
   ```

2. **Set environment variables:**
   ```bash
   export VITE_SUPABASE_URL="https://your-project.supabase.co"
   export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
   ```

3. **Run the migration script:**
   ```bash
   node hash-technician-passwords.js
   ```

   This script will:
   - Find all technicians with plaintext passwords
   - Hash them using bcrypt
   - Update the database
   - Skip passwords that are already hashed

### Option 2: Using SQL Script (Alternative)

If your Supabase project has `pgcrypto` extension enabled:

1. **Enable pgcrypto extension:**
   ```sql
   CREATE EXTENSION IF NOT EXISTS pgcrypto;
   ```

2. **Run the SQL migration:**
   ```sql
   -- See hash-technician-passwords.sql for full script
   ```

⚠️ **Note:** The Node.js script is recommended as it's more reliable and doesn't require pgcrypto extension.

## Setting New Passwords

### For New Technicians

When creating a new technician, hash the password before storing:

**Using Node.js (recommended):**
```javascript
const bcrypt = require('bcryptjs');
const hashedPassword = await bcrypt.hash('new_password', 10);

// Store hashedPassword in database
await supabase
  .from('technicians')
  .insert({
    email: 'tech@example.com',
    password: hashedPassword,
    // ... other fields
  });
```

**Using Supabase Edge Function (if available):**
Create an edge function that hashes passwords server-side before storing.

### For Existing Technicians (Password Reset)

1. Hash the new password using bcrypt
2. Update the technician record with the hashed password

## How It Works

### Authentication Flow

1. **Client-side (`src/lib/auth.ts`):**
   - Fetches technician record from database
   - Checks if password is hashed (starts with `$2a$`, `$2b$`, or `$2y$`)
   - If hashed: sends password + hash to server for verification
   - If plaintext (legacy): falls back to plaintext comparison (with warning)

2. **Server-side (`netlify/functions/verify-technician-password.js`):**
   - Receives plaintext password and hashed password
   - Uses `bcrypt.compare()` for secure comparison
   - Returns verification result

### Security Features

- ✅ **bcrypt hashing** - Industry standard password hashing
- ✅ **Salt rounds** - 10 rounds (2^10 = 1024 iterations)
- ✅ **Server-side verification** - Passwords never compared on client
- ✅ **Timing attack resistant** - bcrypt.compare() is constant-time
- ✅ **Backward compatible** - Still works with plaintext passwords during migration

## Verification

After migration, verify that passwords are hashed:

```sql
SELECT 
    email,
    CASE 
        WHEN password LIKE '$2a$%' OR password LIKE '$2b$%' OR password LIKE '$2y$%' 
        THEN '✅ Hashed' 
        ELSE '❌ Plaintext' 
    END as status
FROM technicians
WHERE password IS NOT NULL;
```

All passwords should show "✅ Hashed".

## Troubleshooting

### "Password verification error" in console

- Check that Netlify function is deployed and accessible
- Verify `verify-technician-password.js` is in `netlify/functions/`
- Check Netlify function logs for errors

### "Password mismatch" even with correct password

- Ensure password was hashed correctly during migration
- Check that bcrypt library is installed: `npm install bcryptjs` in `netlify/functions/`
- Verify the hash format in database (should start with `$2a$`, `$2b$`, or `$2y$`)

### Plaintext passwords still working

- The system supports both hashed and plaintext (for migration period)
- You'll see a warning in console: `⚠️ WARNING: Password stored in plaintext`
- Run the migration script to hash all passwords

## Security Best Practices

1. ✅ **Never store passwords in plaintext**
2. ✅ **Always use bcrypt or similar secure hashing**
3. ✅ **Use server-side verification** (never compare on client)
4. ✅ **Use strong passwords** (minimum 8 characters, mix of letters/numbers)
5. ✅ **Consider password reset flows** instead of password retrieval
6. ✅ **Monitor for suspicious login attempts**

## Files Changed

- ✅ `netlify/functions/package.json` - Added bcryptjs dependency
- ✅ `netlify/functions/verify-technician-password.js` - New secure verification function
- ✅ `src/lib/auth.ts` - Updated to use server-side verification
- ✅ `hash-technician-passwords.js` - Migration script
- ✅ `hash-technician-passwords.sql` - SQL migration script (alternative)
- ✅ `PASSWORD_SECURITY_MIGRATION.md` - This documentation

## Next Steps

1. ✅ Run the migration script to hash existing passwords
2. ✅ Test technician login to ensure it still works
3. ✅ Verify all passwords are hashed in database
4. ✅ Remove plaintext password support (optional, after migration is complete)

---

**Last Updated:** $(date)
**Status:** ✅ Ready for migration

