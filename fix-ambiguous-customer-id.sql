-- Fix ambiguous customer_id column reference in generate_customer_id function
-- This script updates the function to use explicit table references

CREATE OR REPLACE FUNCTION generate_customer_id()
RETURNS TEXT AS $$
DECLARE
    next_id INTEGER;
    customer_id TEXT;
BEGIN
    -- Get the next sequential number
    SELECT COALESCE(MAX(CAST(SUBSTRING(customers.customer_id FROM 2) AS INTEGER)), 0) + 1
    INTO next_id
    FROM customers
    WHERE customers.customer_id ~ '^C[0-9]+$';
    
    -- Format as C0001, C0002, etc.
    customer_id := 'C' || LPAD(next_id::TEXT, 4, '0');
    
    RETURN customer_id;
END;
$$ LANGUAGE plpgsql;

-- Test the function to make sure it works
SELECT generate_customer_id() as test_customer_id;
