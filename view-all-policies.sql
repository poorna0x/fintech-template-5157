-- View all current policies on admin_todos
SELECT 
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'admin_todos'
ORDER BY policyname;

