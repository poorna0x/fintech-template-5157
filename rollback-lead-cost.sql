-- Remove the backup table if you ran the old backfill that created it.
-- Run this once in Supabase SQL Editor to fix the "RLS Disabled in Public" linter error
-- (table job_lead_cost_backup is no longer used).

DROP TABLE IF EXISTS public.job_lead_cost_backup;
