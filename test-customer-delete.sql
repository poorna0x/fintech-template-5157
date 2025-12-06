-- Test Customer Delete
-- Run this to test if deletion works directly in SQL

-- First, check current auth status
SELECT auth.role() as current_role, auth.uid() as current_user_id;

-- Try deleting a customer directly (replace with actual customer ID)
-- Uncomment and replace the ID:
-- DELETE FROM customers WHERE id = 'd7fbc526-0a3b-4fcf-83c4-8a2942a5619d' RETURNING *;

-- Check if customer still exists
-- SELECT * FROM customers WHERE id = 'd7fbc526-0a3b-4fcf-83c4-8a2942a5619d';

