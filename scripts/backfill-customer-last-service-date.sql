-- Backfill customers.last_service_date from the latest COMPLETED job.
-- Safe to re-run. Only fills NULL last_service_date.

UPDATE public.customers c
SET last_service_date = sub.svc_day
FROM (
  SELECT
    j.customer_id,
    (MAX(COALESCE(j.completed_at, j.end_time)) AT TIME ZONE 'Asia/Kolkata')::date AS svc_day
  FROM public.jobs j
  WHERE j.status = 'COMPLETED'
    AND j.customer_id IS NOT NULL
    AND COALESCE(j.completed_at, j.end_time) IS NOT NULL
  GROUP BY j.customer_id
) sub
WHERE c.id = sub.customer_id
  AND c.last_service_date IS NULL;
