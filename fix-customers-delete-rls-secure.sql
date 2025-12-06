-- Secure Customers Delete RLS Policy
-- Current: USING (true) - allows all authenticated users (too permissive)
-- Better: Check if user is authenticated AND restrict to admins only

-- Option 1: Check if user exists in admin_users table (MOST SECURE)
-- This ensures only admin users can delete customers
DROP POLICY IF EXISTS "Allow authenticated users to delete customers" ON customers;

CREATE POLICY "Allow admin users to delete customers" 
ON customers 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE admin_users.id = auth.uid() 
    AND admin_users.is_active = true
  )
);

-- Option 2: If admin_users table doesn't have user IDs linked to auth.uid(),
-- use this simpler check (still better than USING (true))
-- DROP POLICY IF EXISTS "Allow admin users to delete customers" ON customers;
-- CREATE POLICY "Allow authenticated users to delete customers" 
-- ON customers 
-- FOR DELETE 
-- USING (auth.uid() IS NOT NULL);

-- Option 3: If both above don't work, keep USING (true) but add application-level checks
-- (Already implemented in AdminDashboard - only admins can access delete function)

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

