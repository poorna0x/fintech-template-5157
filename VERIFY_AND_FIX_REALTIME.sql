-- VERIFY AND FIX REALTIME - Run this to check and fix everything

-- ============================================
-- STEP 1: Check if Realtime Publication Exists
-- ============================================
SELECT 
  'Realtime Publication' as check_type,
  pubname,
  puballtables,
  pubinsert,
  pubupdate,
  pubdelete,
  pubtruncate
FROM pg_publication 
WHERE pubname = 'supabase_realtime';

-- ============================================
-- STEP 2: Verify Realtime is Enabled for Jobs Table
-- ============================================
SELECT 
  'Realtime Status for Jobs' as check_type,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ ENABLED'
    ELSE '❌ NOT ENABLED'
  END as status,
  COUNT(*) as count
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
  AND tablename = 'jobs';

-- Also show the details
SELECT 
  'Realtime Details' as check_type,
  schemaname,
  tablename,
  pubname
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
  AND tablename = 'jobs';

-- ============================================
-- STEP 2: Check Current RLS Policies for Jobs
-- ============================================
SELECT 
  'Current RLS Policies' as check_type,
  policyname,
  roles,
  cmd,
  CASE 
    WHEN roles::text LIKE '%anon%' THEN '✅ Has anon policy'
    ELSE '❌ No anon policy'
  END as anon_status
FROM pg_policies 
WHERE tablename = 'jobs'
ORDER BY policyname;

-- ============================================
-- STEP 3: Check if RLS is Enabled on Jobs Table
-- ============================================
SELECT 
  'RLS Status' as check_type,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename = 'jobs';

-- ============================================
-- STEP 4: CREATE THE MISSING POLICY
-- ============================================
-- Drop if exists (safe to run multiple times)
DROP POLICY IF EXISTS "Allow anon to read jobs for realtime" ON jobs;

-- Create the policy
CREATE POLICY "Allow anon to read jobs for realtime" 
ON jobs 
FOR SELECT 
TO anon
USING (true);

-- ============================================
-- STEP 5: Verify Policy Was Created
-- ============================================
SELECT 
  'Policy Verification' as check_type,
  policyname,
  roles,
  cmd,
  '✅ POLICY EXISTS' as status
FROM pg_policies 
WHERE tablename = 'jobs' 
  AND policyname = 'Allow anon to read jobs for realtime';

-- ============================================
-- STEP 6: Check All Tables in Realtime Publication
-- ============================================
SELECT 
  'All Realtime Tables' as check_type,
  schemaname,
  tablename,
  pubname
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- ============================================
-- STEP 7: Check Realtime Extension Status
-- ============================================
SELECT 
  'Realtime Extension' as check_type,
  extname,
  extversion,
  CASE 
    WHEN extname = 'pg_cron' OR extname LIKE '%realtime%' THEN '✅ Extension installed'
    ELSE '❌ Extension not found'
  END as status
FROM pg_extension 
WHERE extname LIKE '%realtime%' OR extname = 'pg_cron';

-- ============================================
-- FINAL CHECK: All Requirements
-- ============================================
SELECT 
  'FINAL CHECK' as check_type,
  (SELECT COUNT(*) FROM pg_publication WHERE pubname = 'supabase_realtime') as publication_exists,
  (SELECT COUNT(*) FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'jobs') as jobs_in_realtime,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'jobs' AND policyname = 'Allow anon to read jobs for realtime') as anon_policy_exists,
  CASE 
    WHEN (SELECT COUNT(*) FROM pg_publication WHERE pubname = 'supabase_realtime') > 0
     AND (SELECT COUNT(*) FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'jobs') > 0
     AND (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'jobs' AND policyname = 'Allow anon to read jobs for realtime') > 0
    THEN '✅ ALL GOOD - Realtime should work!'
    ELSE '❌ Something is missing - check the results above'
  END as final_status;

