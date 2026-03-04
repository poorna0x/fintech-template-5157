-- Add parts_cost_total to jobs for analytics (denormalized total cost of parts used on the job)
-- Run this in Supabase SQL Editor

-- Step 1: Add column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'parts_cost_total'
  ) THEN
    ALTER TABLE public.jobs
    ADD COLUMN parts_cost_total NUMERIC(12,2) DEFAULT 0 NOT NULL;
    COMMENT ON COLUMN public.jobs.parts_cost_total IS 'Total cost of parts used on this job (denormalized from job_parts_used for fast analytics).';
  END IF;
END $$;

-- Step 2: Backfill from job_parts_used (quantity_used × price_at_time_of_use, fallback to inventory.price)
UPDATE public.jobs j
SET parts_cost_total = COALESCE(agg.total, 0)
FROM (
  SELECT
    jpu.job_id,
    SUM(jpu.quantity_used * COALESCE(jpu.price_at_time_of_use, inv.price, 0)) AS total
  FROM public.job_parts_used jpu
  LEFT JOIN public.inventory inv ON inv.id = jpu.inventory_id
  GROUP BY jpu.job_id
) agg
WHERE j.id = agg.job_id;
