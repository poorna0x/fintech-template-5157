-- Add visible_address column to customers table
-- This column stores a one-word identifier for quick address recognition

ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS visible_address VARCHAR(20);

-- Update the address JSONB column structure to include visible_address
-- Note: If you're storing address as JSONB, you may need to update existing records
-- For now, we'll add it as a separate column for easier querying

-- Add comment for documentation
COMMENT ON COLUMN customers.visible_address IS 'One-word identifier for quick address recognition (e.g., Home, Office, Shop)';

-- Create index for faster searches if needed
CREATE INDEX IF NOT EXISTS idx_customers_visible_address ON customers(visible_address) WHERE visible_address IS NOT NULL;

