-- Delete completed reminders older than 7 days, on a daily schedule.
-- Run once in Supabase SQL Editor. Requires pg_cron extension (available on Supabase).

-- 1. Enable pg_cron (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Schedule daily cleanup at 4:00 AM UTC
--    Deletes rows where completed_at is set and older than 7 days
SELECT cron.schedule(
  'reminders-delete-old-completed',
  '0 4 * * *',  -- every day at 04:00 UTC
  $$ DELETE FROM public.reminders
     WHERE completed_at IS NOT NULL
       AND completed_at < (now() - interval '7 days') $$
);

-- To remove the job later (optional):
-- SELECT cron.unschedule('reminders-delete-old-completed');

-- To list scheduled jobs:
-- SELECT * FROM cron.job;
