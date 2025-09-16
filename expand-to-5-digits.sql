-- =====================================================
-- EXPAND CUSTOMER ID SYSTEM TO 5 DIGITS
-- Format: C00001, C00002, C00003, etc.
-- Capacity: 99,999 customers
-- =====================================================
-- 
-- Run this when you approach 8,000+ customers
-- This script safely migrates from 4-digit to 5-digit format
-- =====================================================

-- Step 1: Update the customer ID generation function to use 5 digits
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
    
    -- Format as C00001, C00002, etc. (5 digits)
    customer_id := 'C' || LPAD(next_id::TEXT, 5, '0');
    
    RETURN customer_id;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Update existing 4-digit customer IDs to 5-digit format
UPDATE customers 
SET customer_id = 'C' || LPAD(SUBSTRING(customer_id FROM 2)::TEXT, 5, '0')
WHERE customer_id ~ '^C[0-9]{4}$';

-- Step 3: Increase field size to accommodate 5 digits (if needed)
-- Note: VARCHAR(10) should already be sufficient, but this ensures compatibility
ALTER TABLE customers ALTER COLUMN customer_id TYPE VARCHAR(10);

-- Step 4: Verify the migration
DO $$
DECLARE
    old_format_count INTEGER;
    new_format_count INTEGER;
    total_count INTEGER;
BEGIN
    -- Count customers with old 4-digit format
    SELECT COUNT(*) INTO old_format_count 
    FROM customers 
    WHERE customer_id ~ '^C[0-9]{4}$';
    
    -- Count customers with new 5-digit format
    SELECT COUNT(*) INTO new_format_count 
    FROM customers 
    WHERE customer_id ~ '^C[0-9]{5}$';
    
    -- Total customers
    SELECT COUNT(*) INTO total_count FROM customers;
    
    -- Display results
    RAISE NOTICE 'Total customers: %', total_count;
    RAISE NOTICE 'Old format (4 digits): %', old_format_count;
    RAISE NOTICE 'New format (5 digits): %', new_format_count;
    
    IF old_format_count = 0 AND new_format_count = total_count THEN
        RAISE NOTICE 'SUCCESS: All customer IDs migrated to 5-digit format!';
    ELSE
        RAISE NOTICE 'WARNING: Migration may not be complete.';
    END IF;
END $$;

-- Step 5: Show sample of migrated customer IDs
SELECT 
    customer_id,
    full_name,
    phone,
    created_at
FROM customers 
ORDER BY customer_id 
LIMIT 10;

-- Step 6: Test the new generation function
SELECT generate_customer_id() as next_customer_id;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Your customer ID system now supports 5-digit format!
-- 
-- Changes:
-- ✅ Generation function updated to 5 digits
-- ✅ Existing IDs migrated from C0001 → C00001
-- ✅ New customers get 5-digit IDs automatically
-- ✅ Capacity increased to 99,999 customers
-- 
-- Examples:
-- - Old: C0001, C0002, C0003
-- - New: C00001, C00002, C00003
-- 
-- Next customer will get: C00004 (or next available number)
-- =====================================================
