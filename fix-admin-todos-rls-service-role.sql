-- Fix admin_todos RLS to allow service_role access
-- This allows admin operations even if user session is not detected
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

-- Step 2: Create policies that allow both authenticated users AND service_role
-- This ensures admin operations work even if session detection has issues

-- SELECT: Allow authenticated users and service_role
CREATE POLICY "todos_select_policy"
ON admin_todos FOR SELECT
TO authenticated, service_role
USING (true);

-- INSERT: Allow authenticated users and service_role
CREATE POLICY "todos_insert_policy"
ON admin_todos FOR INSERT
TO authenticated, service_role
WITH CHECK (true);

-- DELETE: Allow authenticated users and service_role
CREATE POLICY "todos_delete_policy"
ON admin_todos FOR DELETE
TO authenticated, service_role
USING (true);

-- Step 3: Grant permissions to both roles
GRANT ALL ON admin_todos TO authenticated;
GRANT ALL ON admin_todos TO service_role;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

-- Verify policies (run separately to check):
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'admin_todos';

