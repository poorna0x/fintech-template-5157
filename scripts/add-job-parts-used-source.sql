-- Track WHERE a job's part came from: the technician's own stock or main
-- inventory (warehouse) taken directly. This lets the admin add a part that was
-- pulled straight from the warehouse on a technician job, and ensures removing
-- such a part returns stock ONLY to main inventory (never to the technician's bag).
--
-- A single item can now appear once PER source on a job (e.g. 2 from the tech +
-- 1 from main), so the uniqueness key includes source.
--
-- Safe to re-run.

ALTER TABLE public.job_parts_used
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'technician';

-- Backfill any legacy NULLs (in case the column pre-existed without a default).
UPDATE public.job_parts_used
  SET source = 'technician'
  WHERE source IS NULL;

-- Replace the old (job_id, inventory_id) uniqueness with one that includes
-- source. Existing rows are all 'technician', so no duplicates can arise.
ALTER TABLE public.job_parts_used
  DROP CONSTRAINT IF EXISTS job_parts_used_job_id_inventory_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_parts_used_job_inv_source_key'
  ) THEN
    ALTER TABLE public.job_parts_used
      ADD CONSTRAINT job_parts_used_job_inv_source_key UNIQUE (job_id, inventory_id, source);
  END IF;
END $$;
