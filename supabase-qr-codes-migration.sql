-- Create common_qr_codes table for shared payment QR codes
CREATE TABLE IF NOT EXISTS common_qr_codes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    qr_code_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add qr_code column to technicians table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'technicians' AND column_name = 'qr_code'
    ) THEN
        ALTER TABLE technicians ADD COLUMN qr_code TEXT;
    END IF;
END $$;

-- Create index for common_qr_codes
CREATE INDEX IF NOT EXISTS idx_common_qr_codes_created_at ON common_qr_codes(created_at);

-- Enable Row Level Security (RLS)
ALTER TABLE common_qr_codes ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users to read all QR codes
CREATE POLICY "Allow authenticated users to read common_qr_codes"
ON common_qr_codes FOR SELECT
TO authenticated
USING (true);

-- Create policy to allow authenticated users to insert QR codes
CREATE POLICY "Allow authenticated users to insert common_qr_codes"
ON common_qr_codes FOR INSERT
TO authenticated
WITH CHECK (true);

-- Create policy to allow authenticated users to update QR codes
CREATE POLICY "Allow authenticated users to update common_qr_codes"
ON common_qr_codes FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Create policy to allow authenticated users to delete QR codes
CREATE POLICY "Allow authenticated users to delete common_qr_codes"
ON common_qr_codes FOR DELETE
TO authenticated
USING (true);

