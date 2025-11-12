-- Check if realtime is enabled for jobs table
-- Run this in Supabase SQL Editor

-- Method 1: Check if jobs table is in realtime publication
SELECT 
  schemaname,
  tablename,
  pubname
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
  AND tablename = 'jobs';

-- If this returns a row, realtime is enabled!
-- If it returns nothing, realtime is NOT enabled

-- Method 2: List all tables in realtime publication
SELECT 
  schemaname,
  tablename
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- Enable realtime for jobs table (if not already enabled)
ALTER PUBLICATION supabase_realtime ADD TABLE jobs;

-- Verify it was added
SELECT 
  schemaname,
  tablename,
  pubname
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
  AND tablename = 'jobs';

