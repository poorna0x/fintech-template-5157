-- Fix RLS Policy for Technician Payments UPDATE
-- Add WITH CHECK clause to allow updates

-- Drop existing update policy
DROP POLICY IF EXISTS "Allow authenticated users to update technician_payments" ON technician_payments;

-- Create new update policy with both USING and WITH CHECK
CREATE POLICY "Allow authenticated users to update technician_payments" 
    ON technician_payments FOR UPDATE 
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

