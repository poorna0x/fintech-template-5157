-- Fix RLS policies for common_qr_codes to allow unauthenticated access
-- This is needed because Settings page allows unauthenticated access

-- Drop existing policies
DROP POLICY IF EXISTS "Allow authenticated users to read common_qr_codes" ON common_qr_codes;
DROP POLICY IF EXISTS "Allow authenticated users to insert common_qr_codes" ON common_qr_codes;
DROP POLICY IF EXISTS "Allow authenticated users to update common_qr_codes" ON common_qr_codes;
DROP POLICY IF EXISTS "Allow authenticated users to delete common_qr_codes" ON common_qr_codes;

-- Create new policies that allow both authenticated and anonymous users
-- Note: For production, you may want to restrict this to authenticated users only

-- Allow anyone to read QR codes
CREATE POLICY "Allow all users to read common_qr_codes"
ON common_qr_codes FOR SELECT
TO public
USING (true);

-- Allow anyone to insert QR codes
CREATE POLICY "Allow all users to insert common_qr_codes"
ON common_qr_codes FOR INSERT
TO public
WITH CHECK (true);

-- Allow anyone to update QR codes
CREATE POLICY "Allow all users to update common_qr_codes"
ON common_qr_codes FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Allow anyone to delete QR codes
CREATE POLICY "Allow all users to delete common_qr_codes"
ON common_qr_codes FOR DELETE
TO public
USING (true);

