-- Quick Check: Is Realtime Enabled?
-- Run this to see the current realtime status

-- Check 1: Does the realtime publication exist?
SELECT 
  'Publication Exists' as check,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ YES'
    ELSE '❌ NO - Realtime publication does not exist!'
  END as status
FROM pg_publication 
WHERE pubname = 'supabase_realtime';

-- Check 2: Is jobs table in realtime publication?
SELECT 
  'Jobs in Realtime' as check,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ YES'
    ELSE '❌ NO - Jobs table not in realtime publication!'
  END as status
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
  AND tablename = 'jobs';

-- Check 2b: Show details if it exists
SELECT 
  'Jobs Realtime Details' as check,
  schemaname,
  tablename,
  pubname
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
  AND tablename = 'jobs';

-- Check 3: Does anon policy exist?
SELECT 
  'Anon RLS Policy' as check,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ YES'
    ELSE '❌ NO - Anon policy missing!'
  END as status
FROM pg_policies 
WHERE tablename = 'jobs' 
  AND policyname = 'Allow anon to read jobs for realtime';

-- Summary
SELECT 
  'SUMMARY' as check,
  (SELECT COUNT(*) FROM pg_publication WHERE pubname = 'supabase_realtime') as publication_exists,
  (SELECT COUNT(*) FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'jobs') as jobs_in_realtime,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'jobs' AND policyname = 'Allow anon to read jobs for realtime') as anon_policy_exists,
  CASE 
    WHEN (SELECT COUNT(*) FROM pg_publication WHERE pubname = 'supabase_realtime') > 0
     AND (SELECT COUNT(*) FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'jobs') > 0
     AND (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'jobs' AND policyname = 'Allow anon to read jobs for realtime') > 0
    THEN '✅ ALL CHECKS PASSED - Realtime should work!'
    ELSE '❌ SOME CHECKS FAILED - See details above'
  END as overall_status;

