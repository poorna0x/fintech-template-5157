-- Complete Fix for Inventory RLS Policies
-- This file provides multiple solutions - try them in order

-- ============================================
-- SOLUTION 1: Most Permissive Policies (Try this first)
-- ============================================

-- Drop ALL existing policies
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

-- Create very permissive policies using auth.uid() check
CREATE POLICY "inventory_select_policy"
ON public.inventory FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "inventory_insert_policy"
ON public.inventory FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "inventory_update_policy"
ON public.inventory FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "inventory_delete_policy"
ON public.inventory FOR DELETE
TO authenticated
USING (auth.uid() IS NOT NULL);

-- Grant all permissions
GRANT ALL ON public.inventory TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

-- ============================================
-- SOLUTION 2: If Solution 1 doesn't work, try this (even more permissive)
-- ============================================
-- Uncomment the section below if Solution 1 fails:

/*
-- Drop policies from Solution 1
DROP POLICY IF EXISTS "inventory_select_policy" ON public.inventory;
DROP POLICY IF EXISTS "inventory_insert_policy" ON public.inventory;
DROP POLICY IF EXISTS "inventory_update_policy" ON public.inventory;
DROP POLICY IF EXISTS "inventory_delete_policy" ON public.inventory;

-- Create policies that allow ANY authenticated user (most permissive)
CREATE POLICY "inventory_select_policy"
ON public.inventory FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "inventory_insert_policy"
ON public.inventory FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "inventory_update_policy"
ON public.inventory FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "inventory_delete_policy"
ON public.inventory FOR DELETE
TO authenticated
USING (true);
*/

-- ============================================
-- SOLUTION 3: Last Resort - Temporarily Disable RLS (Less Secure)
-- ============================================
-- Only use this if Solutions 1 and 2 don't work:
-- Uncomment the line below:

-- ALTER TABLE public.inventory DISABLE ROW LEVEL SECURITY;

-- ============================================
-- Verification Query
-- ============================================
-- Run this to check your policies:
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'inventory'
ORDER BY policyname;

-- Check if RLS is enabled:
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'inventory';
