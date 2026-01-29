-- Fix RLS for technician_inventory table
-- This ensures RLS is enabled with proper policies matching the inventory table pattern
-- Run this in Supabase SQL Editor

-- Step 1: Drop ALL existing policies first
DROP POLICY IF EXISTS "Allow all users to read technician_inventory" ON public.technician_inventory;
DROP POLICY IF EXISTS "Allow authenticated users to insert technician_inventory" ON public.technician_inventory;
DROP POLICY IF EXISTS "Allow authenticated users to update technician_inventory" ON public.technician_inventory;
DROP POLICY IF EXISTS "Allow authenticated users to delete technician_inventory" ON public.technician_inventory;
DROP POLICY IF EXISTS "Allow all users to insert technician_inventory" ON public.technician_inventory;
DROP POLICY IF EXISTS "Allow all users to update technician_inventory" ON public.technician_inventory;
DROP POLICY IF EXISTS "Allow all users to delete technician_inventory" ON public.technician_inventory;

-- Step 2: Enable RLS (required for security)
ALTER TABLE public.technician_inventory ENABLE ROW LEVEL SECURITY;

-- Step 3: Create policies that allow all users (matches inventory table pattern)
-- SELECT policy: Allow all users to read technician inventory
CREATE POLICY "Allow all users to read technician_inventory"
ON public.technician_inventory FOR SELECT
TO public
USING (true);

-- INSERT policy: Allow all users to insert technician inventory
CREATE POLICY "Allow all users to insert technician_inventory"
ON public.technician_inventory FOR INSERT
TO public
WITH CHECK (true);

-- UPDATE policy: Allow all users to update technician inventory
CREATE POLICY "Allow all users to update technician_inventory"
ON public.technician_inventory FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- DELETE policy: Allow all users to delete technician inventory
CREATE POLICY "Allow all users to delete technician_inventory"
ON public.technician_inventory FOR DELETE
TO public
USING (true);

-- Step 4: Grant necessary permissions to both roles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.technician_inventory TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.technician_inventory TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

-- Verify RLS is enabled and policies are created:
-- SELECT tablename, rowsecurity 
-- FROM pg_tables 
-- WHERE schemaname = 'public' AND tablename = 'technician_inventory';

-- SELECT schemaname, tablename, policyname, permissive, roles, cmd
-- FROM pg_policies 
-- WHERE tablename = 'technician_inventory'
-- ORDER BY policyname;
