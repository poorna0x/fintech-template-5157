-- SIMPLE FIX for admin_todos RLS policies
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

-- Step 2: Create the simplest possible policies
-- These should work for any authenticated user

CREATE POLICY "todos_select_policy"
ON admin_todos FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "todos_insert_policy"
ON admin_todos FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "todos_delete_policy"
ON admin_todos FOR DELETE
TO authenticated
USING (true);

-- Step 3: Grant permissions
GRANT ALL ON admin_todos TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

-- Step 4: Verify policies (run this separately to check)
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'admin_todos';

-- If the above still doesn't work, you can temporarily disable RLS:
-- ALTER TABLE admin_todos DISABLE ROW LEVEL SECURITY;
-- (But this is less secure, so only use as a last resort)

