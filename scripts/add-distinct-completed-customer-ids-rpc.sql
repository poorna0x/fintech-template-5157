-- One row per customer with ≥1 COMPLETED job (replaces scanning every completed job row from the client).
-- Run in Supabase SQL editor. Safe to re-run.

CREATE INDEX IF NOT EXISTS idx_jobs_completed_customer_id
  ON public.jobs (customer_id)
  WHERE status = 'COMPLETED' AND customer_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_distinct_completed_customer_ids()
RETURNS TABLE (customer_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT j.customer_id
  FROM public.jobs j
  WHERE j.status = 'COMPLETED'
    AND j.customer_id IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_distinct_completed_customer_ids() TO anon;
GRANT EXECUTE ON FUNCTION public.get_distinct_completed_customer_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_distinct_completed_customer_ids() TO service_role;
