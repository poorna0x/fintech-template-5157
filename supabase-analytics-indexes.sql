-- Indexes for fast analytics queries and lower egress (DB-side date filtering)
-- Run in Supabase SQL Editor

-- Completed jobs by completion date (used by getForAnalyticsInRange)
CREATE INDEX IF NOT EXISTS idx_jobs_completed_end_time
  ON public.jobs (end_time)
  WHERE status = 'COMPLETED';

CREATE INDEX IF NOT EXISTS idx_jobs_completed_at
  ON public.jobs (completed_at)
  WHERE status = 'COMPLETED';

-- Non-completed jobs by created_at (used by getForAnalyticsInRange)
CREATE INDEX IF NOT EXISTS idx_jobs_created_at
  ON public.jobs (created_at);

-- Status for quick filter (optional; often covered by partial indexes above)
CREATE INDEX IF NOT EXISTS idx_jobs_status
  ON public.jobs (status);
