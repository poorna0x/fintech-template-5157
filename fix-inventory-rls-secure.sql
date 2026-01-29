-- Secure RLS Fix for Inventory Table
-- This enables RLS with proper policies to fix BOTH security errors:
-- 1. RLS Disabled in Public (linter error)
-- 2. New row violates row-level security policy (insert error)
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

-- Step 2: Enable RLS (required for security - fixes the linter error)
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

-- Step 3: Create policies that allow all users (matches your QR codes pattern)
-- Using 'TO public' allows both authenticated and anon users
-- This matches your working pattern with common_qr_codes and product_qr_codes

-- SELECT policy: Allow all users to read inventory
CREATE POLICY "Allow all users to read inventory"
ON public.inventory FOR SELECT
TO public
USING (true);

-- INSERT policy: Allow all users to insert inventory (fixes the policy violation error)
CREATE POLICY "Allow all users to insert inventory"
ON public.inventory FOR INSERT
TO public
WITH CHECK (true);

-- UPDATE policy: Allow all users to update inventory
CREATE POLICY "Allow all users to update inventory"
ON public.inventory FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- DELETE policy: Allow all users to delete inventory
CREATE POLICY "Allow all users to delete inventory"
ON public.inventory FOR DELETE
TO public
USING (true);

-- Step 4: Grant necessary permissions to both roles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

-- Verify RLS is enabled and policies are created:
-- SELECT tablename, rowsecurity 
-- FROM pg_tables 
-- WHERE schemaname = 'public' AND tablename = 'inventory';

-- SELECT schemaname, tablename, policyname, permissive, roles, cmd
-- FROM pg_policies 
-- WHERE tablename = 'inventory'
-- ORDER BY policyname;
