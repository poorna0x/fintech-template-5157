-- Create job_parts_used table
-- This table tracks parts used for completed jobs
-- Run this in Supabase SQL Editor

-- Step 1: Create the job_parts_used table
CREATE TABLE IF NOT EXISTS public.job_parts_used (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    technician_id UUID NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
    inventory_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
    quantity_used INTEGER NOT NULL DEFAULT 1 CHECK (quantity_used > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, -- Admin user who added the parts
    
    -- Ensure a job can only have one entry per inventory item
    UNIQUE(job_id, inventory_id)
);

-- Step 2: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_job_parts_used_job_id ON public.job_parts_used(job_id);
CREATE INDEX IF NOT EXISTS idx_job_parts_used_technician_id ON public.job_parts_used(technician_id);
CREATE INDEX IF NOT EXISTS idx_job_parts_used_inventory_id ON public.job_parts_used(inventory_id);
CREATE INDEX IF NOT EXISTS idx_job_parts_used_created_at ON public.job_parts_used(created_at DESC);

-- Step 3: Enable Row Level Security
ALTER TABLE public.job_parts_used ENABLE ROW LEVEL SECURITY;

-- Step 4: Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow all users to read job_parts_used" ON public.job_parts_used;
DROP POLICY IF EXISTS "Allow authenticated users to insert job_parts_used" ON public.job_parts_used;
DROP POLICY IF EXISTS "Allow authenticated users to update job_parts_used" ON public.job_parts_used;
DROP POLICY IF EXISTS "Allow authenticated users to delete job_parts_used" ON public.job_parts_used;

-- Step 5: Create RLS policies (matching inventory table pattern)
-- SELECT policy: Allow all users to read job_parts_used
CREATE POLICY "Allow all users to read job_parts_used"
ON public.job_parts_used FOR SELECT
TO public
USING (true);

-- INSERT policy: Allow all users to insert job_parts_used
CREATE POLICY "Allow all users to insert job_parts_used"
ON public.job_parts_used FOR INSERT
TO public
WITH CHECK (true);

-- UPDATE policy: Allow all users to update job_parts_used
CREATE POLICY "Allow all users to update job_parts_used"
ON public.job_parts_used FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- DELETE policy: Allow all users to delete job_parts_used
CREATE POLICY "Allow all users to delete job_parts_used"
ON public.job_parts_used FOR DELETE
TO public
USING (true);

-- Step 6: Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_parts_used TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_parts_used TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

-- Verify the table and policies:
-- SELECT tablename, rowsecurity 
-- FROM pg_tables 
-- WHERE schemaname = 'public' AND tablename = 'job_parts_used';

-- SELECT schemaname, tablename, policyname, permissive, roles, cmd
-- FROM pg_policies 
-- WHERE tablename = 'job_parts_used'
-- ORDER BY policyname;
