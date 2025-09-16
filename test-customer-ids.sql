-- =====================================================
-- TEST CUSTOMER ID SYSTEM
-- Use this to test the customer ID system after implementation
-- =====================================================

-- Test 1: Check if customer_id column exists
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'customers' 
AND column_name = 'customer_id';

-- Test 2: Check if unique constraint exists
SELECT 
    constraint_name,
    constraint_type
FROM information_schema.table_constraints 
WHERE table_name = 'customers' 
AND constraint_name LIKE '%customer_id%';

-- Test 3: Check if index exists
SELECT 
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'customers' 
AND indexname LIKE '%customer_id%';

-- Test 4: Check if generation function exists
SELECT 
    routine_name,
    routine_type,
    data_type
FROM information_schema.routines 
WHERE routine_name = 'generate_customer_id';

-- Test 5: Test the generation function
SELECT generate_customer_id() as test_customer_id;

-- Test 6: Check existing customer IDs
SELECT 
    customer_id,
    full_name,
    phone,
    created_at
FROM customers 
WHERE customer_id IS NOT NULL
ORDER BY customer_id 
LIMIT 10;

-- Test 7: Count customers with and without IDs
SELECT 
    COUNT(*) as total_customers,
    COUNT(customer_id) as customers_with_ids,
    COUNT(*) - COUNT(customer_id) as customers_without_ids
FROM customers;

-- Test 8: Check for duplicate customer IDs
SELECT 
    customer_id,
    COUNT(*) as duplicate_count
FROM customers 
WHERE customer_id IS NOT NULL
GROUP BY customer_id
HAVING COUNT(*) > 1;

-- Test 9: Test search functionality
SELECT 
    customer_id,
    full_name,
    phone
FROM customers 
WHERE customer_id = 'C0001'
LIMIT 1;

-- Test 10: Test pattern matching
SELECT 
    customer_id,
    full_name
FROM customers 
WHERE customer_id ~ '^C[0-9]+$'
ORDER BY customer_id
LIMIT 5;

-- =====================================================
-- TEST RESULTS INTERPRETATION
-- =====================================================
-- 
-- Expected Results:
-- ✅ Test 1: Should show customer_id column with VARCHAR(10) type
-- ✅ Test 2: Should show unique constraint on customer_id
-- ✅ Test 3: Should show index on customer_id
-- ✅ Test 4: Should show generate_customer_id function
-- ✅ Test 5: Should return a new customer ID (e.g., C0001)
-- ✅ Test 6: Should show existing customers with IDs
-- ✅ Test 7: customers_with_ids should equal total_customers
-- ✅ Test 8: Should return no rows (no duplicates)
-- ✅ Test 9: Should find customer with ID C0001
-- ✅ Test 10: Should show customers with valid ID format
-- 
-- If any test fails, check the implementation script.
-- =====================================================
