-- Add team_members field to jobs table
-- This allows a job to be shared with multiple technicians as teammates
-- The primary assigned technician is still in assigned_technician_id
-- Team members are stored as an array of technician IDs in team_members JSONB field

ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS team_members JSONB DEFAULT '[]'::jsonb;

-- Add index for efficient queries on team_members
CREATE INDEX IF NOT EXISTS idx_jobs_team_members ON jobs USING GIN (team_members);

-- Add comment
COMMENT ON COLUMN jobs.team_members IS 'Array of technician IDs who are teammates for this job. Primary assigned technician is in assigned_technician_id.';

