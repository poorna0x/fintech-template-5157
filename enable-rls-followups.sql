-- Enable Row Level Security on follow_ups table
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read all follow-ups
-- (In a real app, you might want to restrict this based on job ownership or user role)
CREATE POLICY "Allow authenticated users to read follow-ups"
ON follow_ups
FOR SELECT
TO authenticated
USING (true);

-- Policy: Allow authenticated users to insert their own follow-ups
CREATE POLICY "Allow authenticated users to create follow-ups"
ON follow_ups
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy: Allow users to update follow-ups they scheduled
CREATE POLICY "Allow users to update their own follow-ups"
ON follow_ups
FOR UPDATE
TO authenticated
USING (
  scheduled_by = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM jobs 
    WHERE jobs.id = follow_ups.job_id 
    AND (jobs.assigned_technician_id = auth.uid() OR jobs.assigned_by = auth.uid())
  )
);

-- Policy: Allow users to delete follow-ups they scheduled (or if job is assigned to them)
CREATE POLICY "Allow users to delete their own follow-ups"
ON follow_ups
FOR DELETE
TO authenticated
USING (
  scheduled_by = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM jobs 
    WHERE jobs.id = follow_ups.job_id 
    AND (jobs.assigned_technician_id = auth.uid() OR jobs.assigned_by = auth.uid())
  )
);

-- Alternative: If you want more restrictive policies, uncomment these instead:

-- Policy: Allow users to read follow-ups for jobs they're assigned to or created
-- CREATE POLICY "Allow users to read relevant follow-ups"
-- ON follow_ups
-- FOR SELECT
-- TO authenticated
-- USING (
--   scheduled_by = auth.uid() OR
--   EXISTS (
--     SELECT 1 FROM jobs 
--     WHERE jobs.id = follow_ups.job_id 
--     AND (
--       jobs.assigned_technician_id = auth.uid() 
--       OR jobs.assigned_by = auth.uid()
--       OR jobs.customer_id IN (
--         SELECT customer_id FROM customers 
--         WHERE created_by = auth.uid()
--       )
--     )
--   )
-- );

-- Policy: Allow users to create follow-ups for jobs they have access to
-- CREATE POLICY "Allow users to create follow-ups for accessible jobs"
-- ON follow_ups
-- FOR INSERT
-- TO authenticated
-- WITH CHECK (
--   EXISTS (
--     SELECT 1 FROM jobs 
--     WHERE jobs.id = follow_ups.job_id 
--     AND (
--       jobs.assigned_technician_id = auth.uid() 
--       OR jobs.assigned_by = auth.uid()
--       OR jobs.customer_id IN (
--         SELECT customer_id FROM customers 
--         WHERE created_by = auth.uid()
--       )
--     )
--   )
-- );

