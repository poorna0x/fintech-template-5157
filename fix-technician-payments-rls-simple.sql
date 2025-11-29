-- Simple Fix for Technician Payments RLS
-- Run this in Supabase SQL Editor

-- Step 1: Drop all existing policies
DROP POLICY IF EXISTS "Allow authenticated users to read technician_payments" ON technician_payments;
DROP POLICY IF EXISTS "Allow authenticated users to insert technician_payments" ON technician_payments;
DROP POLICY IF EXISTS "Allow authenticated users to update technician_payments" ON technician_payments;
DROP POLICY IF EXISTS "Allow authenticated users to delete technician_payments" ON technician_payments;

-- Step 2: Create SELECT policy (read)
CREATE POLICY "technician_payments_select_policy" 
    ON technician_payments 
    FOR SELECT 
    USING (true);

-- Step 3: Create INSERT policy (create)
CREATE POLICY "technician_payments_insert_policy" 
    ON technician_payments 
    FOR INSERT 
    WITH CHECK (true);

-- Step 4: Create UPDATE policy (update)
CREATE POLICY "technician_payments_update_policy" 
    ON technician_payments 
    FOR UPDATE 
    USING (true)
    WITH CHECK (true);

-- Step 5: Create DELETE policy (delete)
CREATE POLICY "technician_payments_delete_policy" 
    ON technician_payments 
    FOR DELETE 
    USING (true);

-- Verify: Check that policies were created
SELECT 
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'technician_payments';

