-- Fix Customers Delete RLS Policy
-- The issue: DELETE returns {error: null, data: []} but customer still exists
-- This means the DELETE policy exists but the USING clause isn't matching
-- Solution: Use the same pattern as the working UPDATE policy

-- Drop existing DELETE policy
DROP POLICY IF EXISTS "Allow authenticated users to delete customers" ON customers;

-- Create DELETE policy matching the UPDATE policy pattern that works
-- The UPDATE policy uses: roles={anon,authenticated}, qual=true
-- For DELETE, we'll use authenticated only but with simpler condition
CREATE POLICY "Allow authenticated users to delete customers" 
ON customers 
FOR DELETE 
TO authenticated
USING (true);

-- If the above doesn't work, try this alternative that matches UPDATE exactly:
-- DROP POLICY IF EXISTS "Allow authenticated users to delete customers" ON customers;
-- CREATE POLICY "Allow authenticated users to delete customers" 
-- ON customers 
-- FOR DELETE 
-- USING (true);

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

