-- Check if DELETE policy exists for customers table
-- Run this first to verify the current state

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
WHERE tablename = 'customers' 
ORDER BY cmd, policyname;

-- Expected output should show:
-- - SELECT policy (for reading)
-- - UPDATE policy (for updating)
-- - DELETE policy (for deleting) - THIS ONE IS MISSING!

