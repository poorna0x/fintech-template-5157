-- Safe additive migration: run before deploying the matching web build.
-- AMC Service jobs remain hidden by default. Admins can explicitly include
-- an individual AMC job when scheduling a customer reminder.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS include_amc_follow_up boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.jobs.include_amc_follow_up IS
  'When true, show this AMC Service job in normal follow-up lists and counts.';

CREATE INDEX IF NOT EXISTS idx_jobs_amc_follow_up_override
  ON public.jobs (follow_up_date)
  WHERE include_amc_follow_up = true
    AND status IN ('FOLLOW_UP', 'RESCHEDULED');
