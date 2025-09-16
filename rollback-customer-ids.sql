-- =====================================================
-- ROLLBACK CUSTOMER ID SYSTEM
-- Use this only if you need to remove the customer ID system
-- =====================================================
-- 
-- WARNING: This will remove all customer IDs!
-- Make sure you have a backup before running this script.
-- =====================================================

-- Step 1: Drop the trigger first
DROP TRIGGER IF EXISTS trigger_set_customer_id ON customers;

-- Step 2: Drop the customer ID generation function
DROP FUNCTION IF EXISTS generate_customer_id();

-- Step 3: Drop the unique constraint
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_customer_id_unique;

-- Step 4: Drop the index
DROP INDEX IF EXISTS idx_customers_customer_id;

-- Step 5: Remove the customer_id column
ALTER TABLE customers DROP COLUMN IF EXISTS customer_id;

-- Step 6: Verify rollback
DO $$
DECLARE
    column_exists BOOLEAN;
BEGIN
    -- Check if customer_id column still exists
    SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'customers' 
        AND column_name = 'customer_id'
    ) INTO column_exists;
    
    IF column_exists THEN
        RAISE NOTICE 'WARNING: customer_id column still exists!';
    ELSE
        RAISE NOTICE 'SUCCESS: customer_id column removed successfully!';
    END IF;
END $$;

-- =====================================================
-- ROLLBACK COMPLETE
-- =====================================================
-- The customer ID system has been completely removed.
-- 
-- What was removed:
-- ❌ customer_id column
-- ❌ Unique constraint
-- ❌ Database index
-- ❌ Generation function
-- ❌ Auto-generation trigger
-- 
-- Your customers table is back to its original state.
-- =====================================================
