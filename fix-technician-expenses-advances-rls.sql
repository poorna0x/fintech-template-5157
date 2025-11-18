-- Fix RLS policies for technician_expenses and technician_advances
-- This allows all authenticated users to perform all operations

-- Drop existing policies
DROP POLICY IF EXISTS "Allow authenticated users to read technician_expenses" ON technician_expenses;
DROP POLICY IF EXISTS "Allow authenticated users to insert technician_expenses" ON technician_expenses;
DROP POLICY IF EXISTS "Allow authenticated users to update technician_expenses" ON technician_expenses;
DROP POLICY IF EXISTS "Allow authenticated users to delete technician_expenses" ON technician_expenses;

DROP POLICY IF EXISTS "Allow authenticated users to read technician_advances" ON technician_advances;
DROP POLICY IF EXISTS "Allow authenticated users to insert technician_advances" ON technician_advances;
DROP POLICY IF EXISTS "Allow authenticated users to update technician_advances" ON technician_advances;
DROP POLICY IF EXISTS "Allow authenticated users to delete technician_advances" ON technician_advances;

-- Create new policies that allow all operations
CREATE POLICY "Allow all operations on technician_expenses" 
    ON technician_expenses FOR ALL 
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow all operations on technician_advances" 
    ON technician_advances FOR ALL 
    USING (true)
    WITH CHECK (true);

