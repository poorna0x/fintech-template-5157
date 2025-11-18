-- Add denial fields to jobs table
-- This migration adds fields to track job denials with technician name and reason

-- Add denial_reason column
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS denial_reason TEXT;

-- Handle denied_by column - check if it exists and what type it is
DO $$
BEGIN
    -- Check if denied_by column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'jobs' 
        AND column_name = 'denied_by'
        AND table_schema = 'public'
    ) THEN
        -- Check if it's UUID type
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'jobs' 
            AND column_name = 'denied_by'
            AND data_type = 'uuid'
            AND table_schema = 'public'
        ) THEN
            -- Drop any foreign key constraints first
            ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_denied_by_fkey;
            
            -- Drop the UUID column and recreate as VARCHAR (CASCADE handles dependencies)
            ALTER TABLE jobs DROP COLUMN denied_by CASCADE;
            ALTER TABLE jobs ADD COLUMN denied_by VARCHAR(255);
        END IF;
    ELSE
        -- Column doesn't exist, create it as VARCHAR
        ALTER TABLE jobs ADD COLUMN denied_by VARCHAR(255);
    END IF;
END $$;

-- Add denied_at column
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS denied_at TIMESTAMP WITH TIME ZONE;

-- Add DENIED to status check constraint if it doesn't exist
-- Note: This might fail if DENIED is already in the constraint, which is fine
DO $$
BEGIN
    -- Check if DENIED status is already allowed
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name LIKE '%status%' 
        AND constraint_schema = 'public'
        AND check_clause LIKE '%DENIED%'
    ) THEN
        -- Drop existing constraint if it exists
        ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
        
        -- Add new constraint with DENIED
        ALTER TABLE jobs ADD CONSTRAINT jobs_status_check 
        CHECK (status IN ('PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'RESCHEDULED', 'FOLLOW_UP', 'DENIED'));
    END IF;
END $$;

-- Create index for efficient queries on denied jobs
CREATE INDEX IF NOT EXISTS idx_jobs_denied_at ON jobs(denied_at) WHERE status = 'DENIED';
CREATE INDEX IF NOT EXISTS idx_jobs_denied_by ON jobs(denied_by) WHERE status = 'DENIED';

