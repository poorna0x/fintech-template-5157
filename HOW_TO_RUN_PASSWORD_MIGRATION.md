# How to Run Password Migration

## What These Commands Do

The commands you saw are used to **migrate existing plaintext passwords to secure bcrypt hashes** in your database.

### Step-by-Step Explanation

#### 1. `export VITE_SUPABASE_URL="your-url"`
- **What it does**: Sets the Supabase project URL as an environment variable
- **Where to find it**: 
  - Your `.env` file (if you have one)
  - Supabase Dashboard → Settings → API → Project URL
  - Example: `https://abcdefghijklmnop.supabase.co`

#### 2. `export SUPABASE_SERVICE_ROLE_KEY="your-key"`
- **What it does**: Sets the Supabase Service Role Key (admin access)
- **Where to find it**: 
  - Supabase Dashboard → Settings → API → `service_role` key (NOT the `anon` key!)
  - ⚠️ **IMPORTANT**: This is different from `VITE_SUPABASE_ANON_KEY`
  - This key has admin privileges to update passwords in the database
  - Example: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (long string)

#### 3. `node hash-technician-passwords.js`
- **What it does**: 
  - Connects to your Supabase database
  - Finds all technicians with plaintext passwords
  - Hashes them using bcrypt (secure password hashing)
  - Updates the database with hashed passwords
  - Shows a summary of what was done

## Quick Start Guide

### Option 1: Using Your Existing .env File

If you already have a `.env` file with Supabase credentials:

1. **Create a temporary script** (one-time setup):
   ```bash
   # Run this from project root
   source .env  # Load environment variables
   export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key-here"
   node hash-technician-passwords.js
   ```

2. **Or add to your .env file**:
   ```bash
   # Add this line to your .env file
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   
   # Then run (if using dotenv or similar)
   node hash-technician-passwords.js
   ```

### Option 2: Direct Command (Temporary)

Run these commands in your terminal (one-time):

```bash
# Replace with YOUR actual values:
export VITE_SUPABASE_URL="https://your-project-id.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your-actual-key-here"

# Then run the migration
node hash-technician-passwords.js
```

### Option 3: One-Line Command

```bash
VITE_SUPABASE_URL="https://your-project.supabase.co" SUPABASE_SERVICE_ROLE_KEY="your-key" node hash-technician-passwords.js
```

## Where to Find Your Supabase Credentials

### 1. Supabase Project URL
1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to **Settings** → **API**
4. Copy the **Project URL** (looks like: `https://xxxxx.supabase.co`)

### 2. Service Role Key
1. Same page: **Settings** → **API**
2. Look for **Project API keys**
3. Find the **`service_role`** key (NOT the `anon` key!)
4. ⚠️ **Warning**: This key has full admin access - keep it secret!
5. Copy the key (long string starting with `eyJ...`)

## What Happens When You Run It

The script will:
1. ✅ Connect to your Supabase database
2. ✅ Find all technicians
3. ✅ Check which passwords are plaintext (not hashed)
4. ✅ Hash each plaintext password using bcrypt
5. ✅ Update the database
6. ✅ Show you a summary:
   ```
   ✅ Passwords hashed: 5
   ⏭️  Skipped (already hashed): 0
   ❌ Errors: 0
   📋 Total technicians: 5
   ```

## Example Output

```
🔐 Starting password hashing migration...

📋 Found 3 technician(s)

🔒 Hashing password for technician@roservice.com...
✅ Successfully hashed password for technician@roservice.com
🔒 Hashing password for sarah@roservice.com...
✅ Successfully hashed password for sarah@roservice.com
✅ Skipping john@roservice.com: Password already hashed

============================================================
📊 Migration Summary
============================================================
✅ Passwords hashed: 2
⏭️  Skipped (already hashed or no password): 1
❌ Errors: 0
📋 Total technicians: 3

✅ Migration completed successfully!
⚠️  IMPORTANT: Old plaintext passwords are now replaced with hashes.
   Technicians can still login with their original passwords.
```

## Important Notes

1. **Backward Compatible**: Technicians can still login with their original passwords after migration
2. **Safe to Run Multiple Times**: The script skips passwords that are already hashed
3. **No Password Loss**: Original passwords are replaced, but login still works
4. **Service Role Key Required**: This needs admin access to update passwords

## Troubleshooting

### Error: "Please set VITE_SUPABASE_URL"
- Make sure you exported the URL before running the script
- Check that the URL is correct (should start with `https://`)

### Error: "Please set SUPABASE_SERVICE_ROLE_KEY"
- Make sure you're using the **service_role** key, not the **anon** key
- The key should be a long string starting with `eyJ...`

### Error: "Permission denied" or "Unauthorized"
- Check that you're using the **service_role** key (not anon key)
- Make sure the key hasn't expired
- Verify the Supabase URL is correct

### Error: "Cannot find module '@supabase/supabase-js'"
- Run: `npm install` in the project root
- Make sure you're in the correct directory

## Security Reminder

⚠️ **Never commit the Service Role Key to git!**
- Add `SUPABASE_SERVICE_ROLE_KEY` to your `.gitignore`
- Only use it temporarily for this migration
- Delete it from your shell history after use

---

**Need help?** Check `PASSWORD_SECURITY_MIGRATION.md` for more details.

