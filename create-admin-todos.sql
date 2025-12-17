-- Create admin_todos table for storing todo tasks in settings
-- Run this SQL in your Supabase SQL Editor

-- Create the table
CREATE TABLE IF NOT EXISTS admin_todos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE admin_todos ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Allow authenticated users to view todos" ON admin_todos;
DROP POLICY IF EXISTS "Allow authenticated users to insert todos" ON admin_todos;
DROP POLICY IF EXISTS "Allow authenticated users to delete todos" ON admin_todos;

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

-- Create index on created_at for faster sorting
CREATE INDEX IF NOT EXISTS idx_admin_todos_created_at ON admin_todos(created_at DESC);

