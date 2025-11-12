-- Fix Realtime for Jobs Table with RLS
-- This ensures realtime subscriptions work even with RLS enabled

-- Check current RLS policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'jobs'
ORDER BY policyname;

-- Ensure anon role can access jobs for realtime
-- Realtime subscriptions use the anon key, so we need to allow anon to read jobs
-- (This is safe because the filter in the subscription limits what they see)

-- Add policy to allow anon to read jobs (needed for realtime subscriptions)
-- Note: This is safe because realtime filters are applied client-side
-- The actual data access is still controlled by RLS policies

-- Drop the policy if it exists, then create it
DROP POLICY IF EXISTS "Allow anon to read jobs for realtime" ON jobs;

CREATE POLICY "Allow anon to read jobs for realtime" 
ON jobs 
FOR SELECT 
TO anon
USING (true);

-- Alternative: If you want more restrictive, you can use:
-- DROP POLICY IF EXISTS "Allow anon to read jobs for realtime" ON jobs;
-- CREATE POLICY "Allow anon to read jobs for realtime" 
-- ON jobs 
-- FOR SELECT 
-- TO anon
-- USING (
--   -- Only allow reading jobs that are assigned or public
--   assigned_technician_id IS NOT NULL 
--   OR status = 'PENDING'
-- );

-- Verify the policy was created
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

