-- Fix RLS policies for admin_todos table
-- IMPORTANT: Make sure you're running this as a database admin/superuser

-- First, ensure the table exists (run admin-todos-schema.sql first if needed)
-- CREATE TABLE IF NOT EXISTS admin_todos (
--     id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--     text TEXT NOT NULL,
--     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
-- );

-- Enable RLS
ALTER TABLE admin_todos ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies (catch any variations)
DROP POLICY IF EXISTS "Allow authenticated users to view todos" ON admin_todos;
DROP POLICY IF EXISTS "Allow authenticated users to insert todos" ON admin_todos;
DROP POLICY IF EXISTS "Allow authenticated users to update todos" ON admin_todos;
DROP POLICY IF EXISTS "Allow authenticated users to delete todos" ON admin_todos;
DROP POLICY IF EXISTS "Allow all users to read todos" ON admin_todos;
DROP POLICY IF EXISTS "Allow all users to insert todos" ON admin_todos;
DROP POLICY IF EXISTS "Allow all users to delete todos" ON admin_todos;

-- Create policies that allow authenticated users
-- Using USING (true) pattern for authenticated role (most permissive)
-- Allow authenticated users to view all todos
CREATE POLICY "Allow authenticated users to view todos"
ON admin_todos FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated users to insert todos
CREATE POLICY "Allow authenticated users to insert todos"
ON admin_todos FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to delete todos
CREATE POLICY "Allow authenticated users to delete todos"
ON admin_todos FOR DELETE
TO authenticated
USING (true);

-- Grant necessary permissions
GRANT SELECT, INSERT, DELETE ON admin_todos TO authenticated;
