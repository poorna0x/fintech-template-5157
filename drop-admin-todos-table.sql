-- Drop admin_todos table and all related objects
-- Run this in Supabase SQL Editor to completely remove the admin_todos table

-- Drop all policies first (must be done before dropping the table)
DROP POLICY IF EXISTS "Allow authenticated users to view todos" ON admin_todos;
DROP POLICY IF EXISTS "Allow authenticated users to insert todos" ON admin_todos;
DROP POLICY IF EXISTS "Allow authenticated users to update todos" ON admin_todos;
DROP POLICY IF EXISTS "Allow authenticated users to delete todos" ON admin_todos;
DROP POLICY IF EXISTS "Allow all users to read todos" ON admin_todos;
DROP POLICY IF EXISTS "Allow all users to insert todos" ON admin_todos;
DROP POLICY IF EXISTS "Allow all users to delete todos" ON admin_todos;

-- Drop the index
DROP INDEX IF EXISTS idx_admin_todos_created_at;

-- Drop the table (this will also remove all associated constraints)
DROP TABLE IF EXISTS admin_todos CASCADE;

-- Verify the table is dropped (should return 0 rows)
SELECT tablename 
FROM pg_tables 
WHERE tablename = 'admin_todos';







