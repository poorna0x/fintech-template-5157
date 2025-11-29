-- Complete Fix for RLS Policies on Technician Payments
-- This fixes SELECT, INSERT, and UPDATE policies

-- 1. Fix SELECT policy (ensure it allows reading)
DROP POLICY IF EXISTS "Allow authenticated users to read technician_payments" ON technician_payments;
CREATE POLICY "Allow authenticated users to read technician_payments" 
    ON technician_payments FOR SELECT 
    USING (auth.role() = 'authenticated');

-- 2. Fix INSERT policy (add WITH CHECK clause)
DROP POLICY IF EXISTS "Allow authenticated users to insert technician_payments" ON technician_payments;
CREATE POLICY "Allow authenticated users to insert technician_payments" 
    ON technician_payments FOR INSERT 
    WITH CHECK (auth.role() = 'authenticated');

-- 3. Fix UPDATE policy (add WITH CHECK clause)
DROP POLICY IF EXISTS "Allow authenticated users to update technician_payments" ON technician_payments;
CREATE POLICY "Allow authenticated users to update technician_payments" 
    ON technician_payments FOR UPDATE 
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- 4. Add DELETE policy if needed (optional, for completeness)
DROP POLICY IF EXISTS "Allow authenticated users to delete technician_payments" ON technician_payments;
CREATE POLICY "Allow authenticated users to delete technician_payments" 
    ON technician_payments FOR DELETE 
    USING (auth.role() = 'authenticated');

