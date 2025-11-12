-- Add EN_ROUTE Status to Jobs Table
-- This migration adds the EN_ROUTE status to the jobs table constraint

-- Update the status constraint to include EN_ROUTE
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check 
CHECK (status IN ('PENDING', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'RESCHEDULED', 'FOLLOW_UP', 'DENIED'));

-- Add comment for documentation
COMMENT ON COLUMN jobs.status IS 'Job status: PENDING, ASSIGNED, EN_ROUTE (technician going to location), IN_PROGRESS (at location working), COMPLETED, CANCELLED, RESCHEDULED, FOLLOW_UP, DENIED';

