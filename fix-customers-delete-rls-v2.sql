-- Fix Customers Delete RLS Policy - Version 2
-- Issue: DELETE returns {error: null, data: []} but customer still exists
-- The policy condition auth.role() = 'authenticated' is not matching
-- Solution: Use auth.uid() IS NOT NULL which is more reliable

-- Drop existing DELETE policy
DROP POLICY IF EXISTS "Allow authenticated users to delete customers" ON customers;

-- Create DELETE policy using auth.uid() check (more reliable than auth.role())
-- This checks if user is authenticated by checking if they have a user ID
CREATE POLICY "Allow authenticated users to delete customers" 
ON customers 
FOR DELETE 
USING (auth.uid() IS NOT NULL);

-- Verify the policy was created
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'customers' AND cmd = 'DELETE';

-- If auth.uid() doesn't work, try this alternative:
-- DROP POLICY IF EXISTS "Allow authenticated users to delete customers" ON customers;
-- CREATE POLICY "Allow authenticated users to delete customers" 
-- ON customers 
-- FOR DELETE 
-- USING (true);

