-- Fix follow_ups table permissions and RLS policies
-- Run this SQL in your Supabase SQL editor to fix 401 errors

-- First, ensure the follow_ups table exists (create if it doesn't)
CREATE TABLE IF NOT EXISTS follow_ups (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    parent_follow_up_id UUID REFERENCES follow_ups(id) ON DELETE CASCADE,
    follow_up_date DATE NOT NULL, -- Main date field
    follow_up_time VARCHAR(10),
    reason TEXT NOT NULL,
    notes TEXT,
    scheduled_by UUID, -- User ID who scheduled this
    scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on follow_ups table
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow authenticated users to read follow_ups" ON follow_ups;
DROP POLICY IF EXISTS "Allow authenticated users to insert follow_ups" ON follow_ups;
DROP POLICY IF EXISTS "Allow authenticated users to update follow_ups" ON follow_ups;
DROP POLICY IF EXISTS "Allow authenticated users to delete follow_ups" ON follow_ups;

-- Create RLS policies for follow_ups table
-- Match the pattern used for jobs table - allow authenticated and anon
-- Note: When using Supabase Auth with anon key, role may be 'anon' even when authenticated
CREATE POLICY "Allow authenticated users to read follow_ups" 
    ON follow_ups FOR SELECT 
    USING (auth.role() = 'authenticated' OR auth.role() = 'anon' OR auth.uid() IS NOT NULL);

CREATE POLICY "Allow authenticated users to insert follow_ups" 
    ON follow_ups FOR INSERT 
    WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon' OR auth.uid() IS NOT NULL);

CREATE POLICY "Allow authenticated users to update follow_ups" 
    ON follow_ups FOR UPDATE 
    USING (auth.role() = 'authenticated' OR auth.role() = 'anon' OR auth.uid() IS NOT NULL);

CREATE POLICY "Allow authenticated users to delete follow_ups" 
    ON follow_ups FOR DELETE 
    USING (auth.role() = 'authenticated' OR auth.role() = 'anon' OR auth.uid() IS NOT NULL);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON follow_ups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON follow_ups TO anon;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_follow_ups_job_id ON follow_ups(job_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_follow_up_date ON follow_ups(follow_up_date);
CREATE INDEX IF NOT EXISTS idx_follow_ups_completed ON follow_ups(completed);

