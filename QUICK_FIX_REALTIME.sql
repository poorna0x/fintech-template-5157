-- QUICK FIX for Realtime CHANNEL_ERROR
-- Run these commands in Supabase SQL Editor

-- Step 1: Verify realtime is enabled (should return a row)
SELECT 
  schemaname,
  tablename,
  pubname
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
  AND tablename = 'jobs';

-- Step 2: Create RLS policy for anon role (this is what's missing!)
DROP POLICY IF EXISTS "Allow anon to read jobs for realtime" ON jobs;

CREATE POLICY "Allow anon to read jobs for realtime" 
ON jobs 
FOR SELECT 
TO anon
USING (true);

-- Step 3: Verify the policy was created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies 
WHERE tablename = 'jobs' 
  AND policyname = 'Allow anon to read jobs for realtime';

-- After running this, refresh your technician page and check the console
-- You should see: ✅ Realtime subscription status: SUBSCRIBED

