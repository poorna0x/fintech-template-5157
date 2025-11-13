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

