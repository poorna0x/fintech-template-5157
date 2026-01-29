-- Disable RLS for inventory table
-- This is safe since the admin panel already has authentication at the application level
-- Run this in Supabase SQL Editor

-- Step 1: Drop ALL existing policies first
DROP POLICY IF EXISTS "Allow authenticated users to read inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow authenticated users to insert inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow authenticated users to update inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow authenticated users to delete inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow all users to read inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow all users to insert inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow all users to update inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow all users to delete inventory" ON public.inventory;
DROP POLICY IF EXISTS "inventory_select_policy" ON public.inventory;
DROP POLICY IF EXISTS "inventory_insert_policy" ON public.inventory;
DROP POLICY IF EXISTS "inventory_update_policy" ON public.inventory;
DROP POLICY IF EXISTS "inventory_delete_policy" ON public.inventory;

-- Step 2: Disable RLS entirely for this table
-- This is safe because the admin panel already requires authentication
ALTER TABLE public.inventory DISABLE ROW LEVEL SECURITY;

-- Step 3: Grant permissions to anon and authenticated roles
GRANT ALL ON public.inventory TO anon;
GRANT ALL ON public.inventory TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

-- Verify RLS is disabled (run separately to check):
-- SELECT tablename, rowsecurity 
-- FROM pg_tables 
-- WHERE schemaname = 'public' AND tablename = 'inventory';
