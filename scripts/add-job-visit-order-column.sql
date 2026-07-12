-- Visit order for technician route sequencing (admin-controlled).
-- Lower number = go earlier. Null = unordered (fallback to schedule).
-- Run in Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS visit_order integer;

COMMENT ON COLUMN public.jobs.visit_order IS
  'Admin-set visit sequence for the assigned technician. Lower = earlier. Display renumbers among remaining open jobs.';

CREATE INDEX IF NOT EXISTS idx_jobs_assigned_tech_visit_order
  ON public.jobs (assigned_technician_id, visit_order)
  WHERE assigned_technician_id IS NOT NULL AND visit_order IS NOT NULL;
