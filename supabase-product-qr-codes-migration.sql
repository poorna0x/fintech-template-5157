-- Create product_qr_codes table for product verification QR codes
CREATE TABLE IF NOT EXISTS product_qr_codes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    qr_code_url TEXT NOT NULL,
    product_image_url TEXT,
    product_name VARCHAR(255),
    product_description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for product_qr_codes
CREATE INDEX IF NOT EXISTS idx_product_qr_codes_created_at ON product_qr_codes(created_at);

-- Enable Row Level Security (RLS)
ALTER TABLE product_qr_codes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow all users to read product_qr_codes" ON product_qr_codes;
DROP POLICY IF EXISTS "Allow authenticated users to insert product_qr_codes" ON product_qr_codes;
DROP POLICY IF EXISTS "Allow authenticated users to update product_qr_codes" ON product_qr_codes;
DROP POLICY IF EXISTS "Allow authenticated users to delete product_qr_codes" ON product_qr_codes;

-- Create policy to allow all users to read product QR codes (for public verification)
CREATE POLICY "Allow all users to read product_qr_codes"
ON product_qr_codes FOR SELECT
TO public
USING (true);

-- Create policy to allow all users to insert product QR codes (for authenticated and unauthenticated)
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

