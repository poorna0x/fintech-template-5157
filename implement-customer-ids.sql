-- =====================================================
-- CUSTOMER ID SYSTEM IMPLEMENTATION
-- Format: C0001, C0002, C0003, etc.
-- Capacity: 9,999 customers
-- =====================================================

-- Step 1: Add customer_id column to existing customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_id VARCHAR(10);

-- Step 2: Create function to generate customer IDs
CREATE OR REPLACE FUNCTION generate_customer_id()
RETURNS TEXT AS $$
DECLARE
    next_id INTEGER;
    customer_id TEXT;
BEGIN
    -- Get the next sequential number
    SELECT COALESCE(MAX(CAST(SUBSTRING(customer_id FROM 2) AS INTEGER)), 0) + 1
    INTO next_id
    FROM customers
    WHERE customer_id ~ '^C[0-9]+$';
    
    -- Format as C0001, C0002, etc. (4 digits)
    customer_id := 'C' || LPAD(next_id::TEXT, 4, '0');
    
    RETURN customer_id;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Update existing customers with generated customer IDs
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

-- Step 4: Add unique constraint after populating data
ALTER TABLE customers ADD CONSTRAINT customers_customer_id_unique UNIQUE (customer_id);

-- Step 5: Make customer_id NOT NULL after populating
ALTER TABLE customers ALTER COLUMN customer_id SET NOT NULL;

-- Step 6: Create index for better performance
CREATE INDEX IF NOT EXISTS idx_customers_customer_id ON customers(customer_id);

-- Step 7: Create trigger to auto-generate customer_id on insert
CREATE OR REPLACE FUNCTION set_customer_id()
RETURNS TRIGGER AS $$
BEGIN
    -- Only set if not provided
    IF NEW.customer_id IS NULL THEN
        NEW.customer_id := generate_customer_id();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_customer_id
    BEFORE INSERT ON customers
    FOR EACH ROW
    EXECUTE FUNCTION set_customer_id();

-- Step 8: Verify the implementation
DO $$
DECLARE
    customer_count INTEGER;
    id_count INTEGER;
BEGIN
    -- Count total customers
    SELECT COUNT(*) INTO customer_count FROM customers;
    
    -- Count customers with IDs
    SELECT COUNT(*) INTO id_count FROM customers WHERE customer_id IS NOT NULL;
    
    -- Display results
    RAISE NOTICE 'Total customers: %', customer_count;
    RAISE NOTICE 'Customers with IDs: %', id_count;
    
    IF customer_count = id_count THEN
        RAISE NOTICE 'SUCCESS: All customers have been assigned customer IDs!';
    ELSE
        RAISE NOTICE 'WARNING: Some customers may not have IDs assigned.';
    END IF;
END $$;

-- Step 9: Show sample customer IDs
SELECT 
    customer_id,
    full_name,
    phone,
    created_at
FROM customers 
ORDER BY customer_id 
LIMIT 10;

-- =====================================================
-- IMPLEMENTATION COMPLETE
-- =====================================================
-- Your customer ID system is now ready!
-- 
-- Features:
-- ✅ Automatic ID generation (C0001, C0002, etc.)
-- ✅ Unique constraint to prevent duplicates
-- ✅ Index for fast searching
-- ✅ Trigger for auto-generation on new customers
-- ✅ Existing customers assigned sequential IDs
-- 
-- Usage:
-- - New customers: IDs generated automatically
-- - Search: WHERE customer_id = 'C0001'
-- - Capacity: Up to 9,999 customers
-- =====================================================
