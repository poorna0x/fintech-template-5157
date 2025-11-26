-- Fix RLS policies for product_qr_codes to allow unauthenticated access
-- Run this if you're getting RLS policy errors

-- Drop existing policies
DROP POLICY IF EXISTS "Allow all users to read product_qr_codes" ON product_qr_codes;
DROP POLICY IF EXISTS "Allow authenticated users to insert product_qr_codes" ON product_qr_codes;
DROP POLICY IF EXISTS "Allow authenticated users to update product_qr_codes" ON product_qr_codes;
DROP POLICY IF EXISTS "Allow authenticated users to delete product_qr_codes" ON product_qr_codes;
DROP POLICY IF EXISTS "Allow all users to insert product_qr_codes" ON product_qr_codes;
DROP POLICY IF EXISTS "Allow all users to update product_qr_codes" ON product_qr_codes;
DROP POLICY IF EXISTS "Allow all users to delete product_qr_codes" ON product_qr_codes;

-- Create policy to allow all users to read product QR codes (for public verification)
CREATE POLICY "Allow all users to read product_qr_codes"
ON product_qr_codes FOR SELECT
TO public
USING (true);

-- Create policy to allow all users to insert product QR codes
CREATE POLICY "Allow all users to insert product_qr_codes"
ON product_qr_codes FOR INSERT
TO public
WITH CHECK (true);

-- Create policy to allow all users to update product QR codes
CREATE POLICY "Allow all users to update product_qr_codes"
ON product_qr_codes FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Create policy to allow all users to delete product QR codes
CREATE POLICY "Allow all users to delete product_qr_codes"
ON product_qr_codes FOR DELETE
TO public
USING (true);

-- Add product_image_url column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'product_qr_codes' AND column_name = 'product_image_url'
    ) THEN
        ALTER TABLE product_qr_codes ADD COLUMN product_image_url TEXT;
    END IF;
END $$;

-- Add product_mrp column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'product_qr_codes' AND column_name = 'product_mrp'
    ) THEN
        ALTER TABLE product_qr_codes ADD COLUMN product_mrp VARCHAR(50);
    END IF;
END $$;

