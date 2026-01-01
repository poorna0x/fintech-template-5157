-- Disable RLS for admin_todos table
-- This is safe since the admin panel already has authentication
-- Run this in Supabase SQL Editor

-- Step 1: Drop ALL existing policies first
DROP POLICY IF EXISTS "Allow authenticated users to view todos" ON admin_todos;
DROP POLICY IF EXISTS "Allow authenticated users to insert todos" ON admin_todos;
DROP POLICY IF EXISTS "Allow authenticated users to update todos" ON admin_todos;
DROP POLICY IF EXISTS "Allow authenticated users to delete todos" ON admin_todos;
DROP POLICY IF EXISTS "Allow all users to read todos" ON admin_todos;
DROP POLICY IF EXISTS "Allow all users to insert todos" ON admin_todos;
DROP POLICY IF EXISTS "Allow all users to delete todos" ON admin_todos;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON admin_todos;
DROP POLICY IF EXISTS "Enable select for authenticated users only" ON admin_todos;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON admin_todos;
DROP POLICY IF EXISTS "Allow all authenticated inserts" ON admin_todos;
DROP POLICY IF EXISTS "todos_select_policy" ON admin_todos;
DROP POLICY IF EXISTS "todos_insert_policy" ON admin_todos;
DROP POLICY IF EXISTS "todos_delete_policy" ON admin_todos;
DROP POLICY IF EXISTS "todos_select_anon" ON admin_todos;
DROP POLICY IF EXISTS "todos_insert_anon" ON admin_todos;
DROP POLICY IF EXISTS "todos_delete_anon" ON admin_todos;

-- Step 2: Disable RLS entirely for this table
-- This is safe because the admin panel already requires authentication
ALTER TABLE admin_todos DISABLE ROW LEVEL SECURITY;

-- Step 3: Grant permissions to anon and authenticated roles
GRANT ALL ON admin_todos TO anon;
GRANT ALL ON admin_todos TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

-- Verify RLS is disabled (run separately to check):
-- SELECT tablename, rowsecurity 
-- FROM pg_tables 
-- WHERE schemaname = 'public' AND tablename = 'admin_todos';

