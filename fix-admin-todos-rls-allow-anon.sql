-- Fix admin_todos RLS to allow anon access (less secure, use only if needed)
-- This allows operations even without authentication
-- WARNING: This is less secure - only use if you have other security measures in place
-- Run this in Supabase SQL Editor

-- Step 1: Drop ALL existing policies
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

-- Step 2: Create policies that allow anon access
-- WARNING: This allows anyone with the anon key to access todos
-- Only use this if your admin panel has other security measures

CREATE POLICY "todos_select_anon"
ON admin_todos FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "todos_insert_anon"
ON admin_todos FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "todos_delete_anon"
ON admin_todos FOR DELETE
TO anon, authenticated
USING (true);

-- Step 3: Grant permissions
GRANT ALL ON admin_todos TO anon;
GRANT ALL ON admin_todos TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

-- Verify policies (run separately to check):
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'admin_todos';

