-- Expand visible_address column from VARCHAR(20) to VARCHAR(100)
-- This allows for longer location identifiers while still maintaining reasonable limits

ALTER TABLE customers 
ALTER COLUMN visible_address TYPE VARCHAR(100);

-- Update comment to reflect new size
COMMENT ON COLUMN customers.visible_address IS 'Location identifier for quick address recognition (e.g., Home, Office, Shop, Main Branch) - max 100 characters';

