-- Add Follow-up Status and Tracking Fields
-- This migration adds new job statuses and follow-up tracking capabilities

-- First, update the status constraint to include new statuses
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check 
CHECK (status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'RESCHEDULED', 'FOLLOW_UP', 'DENIED'));

-- Add follow-up tracking fields
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS follow_up_date DATE,
ADD COLUMN IF NOT EXISTS follow_up_time VARCHAR(10),
ADD COLUMN IF NOT EXISTS follow_up_notes TEXT,
ADD COLUMN IF NOT EXISTS follow_up_scheduled_by UUID,
ADD COLUMN IF NOT EXISTS follow_up_scheduled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS denial_reason TEXT,
ADD COLUMN IF NOT EXISTS denied_by UUID,
ADD COLUMN IF NOT EXISTS denied_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS completion_notes TEXT,
ADD COLUMN IF NOT EXISTS completed_by UUID,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_jobs_follow_up_date ON jobs(follow_up_date);
CREATE INDEX IF NOT EXISTS idx_jobs_status_follow_up ON jobs(status) WHERE status = 'FOLLOW_UP';
CREATE INDEX IF NOT EXISTS idx_jobs_status_denied ON jobs(status) WHERE status = 'DENIED';

-- Update the completed_at trigger to set completion fields
CREATE OR REPLACE FUNCTION update_job_completion_fields()
RETURNS TRIGGER AS $$
BEGIN
    -- If status changed to COMPLETED, set completion fields
    IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
        NEW.completed_at = NOW();
        NEW.end_time = NOW();
    END IF;
    
    -- If status changed to DENIED, set denial fields
    IF NEW.status = 'DENIED' AND OLD.status != 'DENIED' THEN
        NEW.denied_at = NOW();
    END IF;
    
    -- If status changed to FOLLOW_UP, set follow-up fields
    IF NEW.status = 'FOLLOW_UP' AND OLD.status != 'FOLLOW_UP' THEN
        NEW.follow_up_scheduled_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for job completion tracking
DROP TRIGGER IF EXISTS trigger_update_job_completion ON jobs;
CREATE TRIGGER trigger_update_job_completion
    BEFORE UPDATE ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_job_completion_fields();

-- Add comments for documentation
COMMENT ON COLUMN jobs.follow_up_date IS 'Scheduled follow-up date';
COMMENT ON COLUMN jobs.follow_up_time IS 'Scheduled follow-up time (HH:MM format)';
COMMENT ON COLUMN jobs.follow_up_notes IS 'Notes for the follow-up appointment';
COMMENT ON COLUMN jobs.follow_up_scheduled_by IS 'User ID who scheduled the follow-up';
COMMENT ON COLUMN jobs.follow_up_scheduled_at IS 'When the follow-up was scheduled';
COMMENT ON COLUMN jobs.denial_reason IS 'Reason for job denial';
COMMENT ON COLUMN jobs.denied_by IS 'User ID who denied the job';
COMMENT ON COLUMN jobs.denied_at IS 'When the job was denied';
COMMENT ON COLUMN jobs.completion_notes IS 'Notes about job completion';
COMMENT ON COLUMN jobs.completed_by IS 'User ID who marked job as completed';
COMMENT ON COLUMN jobs.completed_at IS 'When the job was marked as completed';
