-- Final Fix for RLS Policies on Technician Payments
-- This ensures authenticated users can read, insert, and update records

-- First, let's check if RLS is enabled (it should be)
-- ALTER TABLE technician_payments ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies to start fresh
DROP POLICY IF EXISTS "Allow authenticated users to read technician_payments" ON technician_payments;
DROP POLICY IF EXISTS "Allow authenticated users to insert technician_payments" ON technician_payments;
DROP POLICY IF EXISTS "Allow authenticated users to update technician_payments" ON technician_payments;
DROP POLICY IF EXISTS "Allow authenticated users to delete technician_payments" ON technician_payments;

-- 1. SELECT policy - Allow authenticated users to read all records
CREATE POLICY "Allow authenticated users to read technician_payments" 
    ON technician_payments FOR SELECT 
    USING (auth.role() = 'authenticated');

-- 2. INSERT policy - Allow authenticated users to insert records
CREATE POLICY "Allow authenticated users to insert technician_payments" 
    ON technician_payments FOR INSERT 
    WITH CHECK (auth.role() = 'authenticated');

-- 3. UPDATE policy - Allow authenticated users to update records
CREATE POLICY "Allow authenticated users to update technician_payments" 
    ON technician_payments FOR UPDATE 
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- 4. DELETE policy - Allow authenticated users to delete records (optional)
CREATE POLICY "Allow authenticated users to delete technician_payments" 
    ON technician_payments FOR DELETE 
    USING (auth.role() = 'authenticated');

-- Verify policies were created
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
WHERE tablename = 'technician_payments'
ORDER BY policyname;

