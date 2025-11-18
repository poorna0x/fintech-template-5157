-- Job Assignment Requests Table
-- This table tracks job assignment requests sent to multiple technicians
-- First technician to accept gets the job, others are automatically cancelled

CREATE TABLE IF NOT EXISTS job_assignment_requests (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    technician_id UUID NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
    
    -- Request Status
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED')),
    
    -- Assignment Details
    assigned_by UUID, -- Admin who sent the request
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Response Details
    responded_at TIMESTAMP WITH TIME ZONE,
    response_notes TEXT, -- Optional notes from technician
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one pending request per job-technician pair
    UNIQUE(job_id, technician_id)
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_job_assignment_requests_job_id ON job_assignment_requests(job_id);
CREATE INDEX IF NOT EXISTS idx_job_assignment_requests_technician_id ON job_assignment_requests(technician_id);
CREATE INDEX IF NOT EXISTS idx_job_assignment_requests_status ON job_assignment_requests(status);

-- Function to automatically cancel other requests when one is accepted
CREATE OR REPLACE FUNCTION cancel_other_assignment_requests()
RETURNS TRIGGER AS $$
BEGIN
    -- Only proceed if the new status is 'ACCEPTED'
    IF NEW.status = 'ACCEPTED' AND OLD.status != 'ACCEPTED' THEN
        -- Cancel all other pending requests for the same job
        UPDATE job_assignment_requests 
        SET 
            status = 'CANCELLED',
            updated_at = NOW()
        WHERE 
            job_id = NEW.job_id 
            AND technician_id != NEW.technician_id 
            AND status = 'PENDING';
            
        -- Update the job to assign it to the accepting technician
        UPDATE jobs 
        SET 
            assigned_technician_id = NEW.technician_id,
            assigned_date = NOW(),
            status = 'ASSIGNED',
            updated_at = NOW()
        WHERE id = NEW.job_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically cancel other requests when one is accepted
DROP TRIGGER IF EXISTS trigger_cancel_other_requests ON job_assignment_requests;
CREATE TRIGGER trigger_cancel_other_requests
    AFTER UPDATE ON job_assignment_requests
    FOR EACH ROW
    EXECUTE FUNCTION cancel_other_assignment_requests();

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_job_assignment_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at timestamp
DROP TRIGGER IF EXISTS trigger_update_job_assignment_requests_updated_at ON job_assignment_requests;
CREATE TRIGGER trigger_update_job_assignment_requests_updated_at
    BEFORE UPDATE ON job_assignment_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_job_assignment_requests_updated_at();
