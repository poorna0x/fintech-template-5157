-- Migration script to add customer_id field to existing customers
-- Run this after updating the schema

-- Add customer_id column to existing customers table (if not already added)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_id VARCHAR(10);

-- Update existing customers with generated customer IDs
DO $$
DECLARE
    customer_record RECORD;
    next_id INTEGER := 1;
BEGIN
    -- Get all existing customers ordered by creation date
    FOR customer_record IN 
        SELECT id FROM customers 
        WHERE customer_id IS NULL 
        ORDER BY created_at ASC
    LOOP
        -- Update with generated customer ID
        UPDATE customers 
        SET customer_id = 'C' || LPAD(next_id::TEXT, 4, '0')
        WHERE id = customer_record.id;
        
        next_id := next_id + 1;
    END LOOP;
END $$;

-- Add unique constraint after populating data
ALTER TABLE customers ADD CONSTRAINT customers_customer_id_unique UNIQUE (customer_id);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_customers_customer_id ON customers(customer_id);
