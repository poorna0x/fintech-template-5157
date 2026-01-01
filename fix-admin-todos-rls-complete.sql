-- Complete fix for admin_todos RLS policies
-- Run this in Supabase SQL Editor to fix the "new row violates row-level security policy" error

-- Step 1: Ensure the table exists
CREATE TABLE IF NOT EXISTS admin_todos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 2: Enable RLS
ALTER TABLE admin_todos ENABLE ROW LEVEL SECURITY;

-- Step 3: Drop ALL existing policies (to avoid conflicts)
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

-- Step 4: Create new policies with proper authentication checks
-- SELECT policy: Allow authenticated users to view all todos
CREATE POLICY "Enable select for authenticated users only"
ON admin_todos FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- INSERT policy: Allow authenticated users to insert todos
-- This is the critical one that was failing
-- Check that user is authenticated (has a valid auth.uid())
CREATE POLICY "Enable insert for authenticated users only"
ON admin_todos FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Alternative: If the above doesn't work, try this even more permissive policy
-- (Uncomment if the above still fails)
-- CREATE POLICY "Allow all authenticated inserts"
-- ON admin_todos FOR INSERT
-- TO authenticated
-- WITH CHECK (true);

-- DELETE policy: Allow authenticated users to delete todos
CREATE POLICY "Enable delete for authenticated users only"
ON admin_todos FOR DELETE
TO authenticated
USING (auth.uid() IS NOT NULL);

-- Step 5: Grant necessary permissions
GRANT SELECT, INSERT, DELETE ON admin_todos TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

-- Step 6: Verify the policies were created
-- You can run this query to check:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'admin_todos';

