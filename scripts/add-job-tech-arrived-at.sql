-- First GPS near (~600m) after Start Job → stamp for one-shot admin arrival push.
-- Run in Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS tech_arrived_at timestamptz;

COMMENT ON COLUMN public.jobs.tech_arrived_at IS
  'First time the technician app reported GPS near this job after Start Job; used once for admin arrival push.';

CREATE INDEX IF NOT EXISTS jobs_tech_arrived_at_idx
  ON public.jobs (tech_arrived_at)
  WHERE tech_arrived_at IS NOT NULL;
