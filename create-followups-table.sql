-- Create follow_ups table for nested follow-ups
CREATE TABLE IF NOT EXISTS follow_ups (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    parent_follow_up_id UUID REFERENCES follow_ups(id) ON DELETE CASCADE,
    follow_up_date DATE NOT NULL,
    follow_up_time VARCHAR(10),
    reason TEXT NOT NULL,
    notes TEXT,
    scheduled_by UUID,
    scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_follow_ups_job_id ON follow_ups(job_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_parent_id ON follow_ups(parent_follow_up_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_date ON follow_ups(follow_up_date);
CREATE INDEX IF NOT EXISTS idx_follow_ups_completed ON follow_ups(completed);

-- Add trigger to automatically update updated_at
CREATE OR REPLACE FUNCTION update_follow_ups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_follow_ups_updated_at
    BEFORE UPDATE ON follow_ups
    FOR EACH ROW
    EXECUTE FUNCTION update_follow_ups_updated_at();

-- Add trigger to automatically remove from follow-up when job is completed
CREATE OR REPLACE FUNCTION remove_follow_ups_on_completion()
RETURNS TRIGGER AS $$
BEGIN
    -- If job status changed to COMPLETED, mark all pending follow-ups as completed
    IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
        UPDATE follow_ups
        SET completed = TRUE,
            completed_at = NOW()
        WHERE job_id = NEW.id 
        AND completed = FALSE;
        
        -- Also update job status if it was FOLLOW_UP
        IF OLD.status = 'FOLLOW_UP' THEN
            -- Keep FOLLOW_UP status but update follow-up tracking
            NEW.follow_up_date = NULL;
            NEW.follow_up_time = NULL;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_remove_follow_ups_on_completion
    AFTER UPDATE ON jobs
    FOR EACH ROW
    WHEN (NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED')
    EXECUTE FUNCTION remove_follow_ups_on_completion();

-- Add comments for documentation
COMMENT ON TABLE follow_ups IS 'Stores nested follow-ups for jobs';
COMMENT ON COLUMN follow_ups.parent_follow_up_id IS 'Reference to parent follow-up for nested follow-ups';
COMMENT ON COLUMN follow_ups.reason IS 'Reason for the follow-up (e.g., need new RO, not picking, not confirmed)';
COMMENT ON COLUMN follow_ups.completed IS 'Whether this follow-up was completed (task done elsewhere)';

