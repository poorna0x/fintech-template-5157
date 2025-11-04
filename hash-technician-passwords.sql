-- =====================================================
-- PASSWORD HASHING MIGRATION SCRIPT
-- =====================================================
-- 
-- IMPORTANT: This script uses pgcrypto extension which may not be
-- available in all Supabase projects. If pgcrypto is not available,
-- use the Node.js script instead: hash-technician-passwords.js
--
-- Before running:
-- 1. Enable pgcrypto extension: CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- 2. Or use the Node.js script which uses bcryptjs
--
-- =====================================================

-- Step 1: Enable pgcrypto extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Step 2: Check current password status
SELECT 
    id,
    email,
    full_name,
    CASE 
        WHEN password IS NULL THEN 'No Password'
        WHEN password LIKE '$2a$%' OR password LIKE '$2b$%' OR password LIKE '$2y$%' THEN 'Already Hashed'
        ELSE 'Plaintext (needs hashing)'
    END as password_status,
    LENGTH(password) as password_length
FROM technicians
WHERE password IS NOT NULL
ORDER BY email;

-- Step 3: Hash plaintext passwords using bcrypt
-- Note: This uses crypt() function from pgcrypto with bcrypt algorithm
-- Salt rounds = 10 (2^10 = 1024 iterations)
UPDATE technicians
SET password = crypt(password, gen_salt('bf', 10))
WHERE password IS NOT NULL
  AND password NOT LIKE '$2a$%'
  AND password NOT LIKE '$2b$%'
  AND password NOT LIKE '$2y$%';

-- Step 4: Verify migration
SELECT 
    COUNT(*) as total_technicians,
    COUNT(CASE WHEN password IS NULL THEN 1 END) as no_password,
    COUNT(CASE WHEN password LIKE '$2a$%' OR password LIKE '$2b$%' OR password LIKE '$2y$%' THEN 1 END) as hashed_passwords,
    COUNT(CASE WHEN password NOT LIKE '$2a$%' AND password NOT LIKE '$2b$%' AND password NOT LIKE '$2y$%' AND password IS NOT NULL THEN 1 END) as plaintext_passwords
FROM technicians;

-- Step 5: Test password verification (example)
-- This shows how to verify a password after hashing
-- SELECT 
--     email,
--     CASE 
--         WHEN password = crypt('test_password', password) THEN 'Password matches'
--         ELSE 'Password does not match'
--     END as verification_test
-- FROM technicians
-- WHERE email = 'technician@roservice.com';

-- =====================================================
-- NOTES:
-- =====================================================
-- 1. bcrypt hashes start with $2a$, $2b$, or $2y$
-- 2. The crypt() function automatically includes the salt in the hash
-- 3. To verify a password: crypt('input_password', stored_hash) = stored_hash
-- 4. The Node.js script (hash-technician-passwords.js) is recommended
--    as it uses bcryptjs which is more reliable than pgcrypto
-- =====================================================

