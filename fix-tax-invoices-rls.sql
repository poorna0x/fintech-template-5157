-- Fix RLS policies for tax_invoices table to allow anonymous inserts
-- This allows invoices to be created without authentication

-- Drop existing policies
DROP POLICY IF EXISTS "Allow authenticated users to read tax invoices" ON tax_invoices;
DROP POLICY IF EXISTS "Allow authenticated users to insert tax invoices" ON tax_invoices;
DROP POLICY IF EXISTS "Allow authenticated users to update tax invoices" ON tax_invoices;

-- Create new policies that allow both authenticated and anonymous users
-- Policy for SELECT: Allow all users (authenticated and anonymous) to read
CREATE POLICY "Allow all users to read tax invoices"
ON tax_invoices FOR SELECT
TO public
USING (true);

-- Policy for INSERT: Allow all users (authenticated and anonymous) to insert
CREATE POLICY "Allow all users to insert tax invoices"
ON tax_invoices FOR INSERT
TO public
WITH CHECK (true);

-- Policy for UPDATE: Allow all users (authenticated and anonymous) to update
CREATE POLICY "Allow all users to update tax invoices"
ON tax_invoices FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Policy for DELETE: Only allow authenticated users to delete (optional, for security)
CREATE POLICY "Allow authenticated users to delete tax invoices"
ON tax_invoices FOR DELETE
TO authenticated
USING (true);

