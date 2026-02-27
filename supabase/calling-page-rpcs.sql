-- Calling page: one row per customer for last completed job and last contact.
-- Reduces egress by avoiding full jobs and call_history scans.

-- Last completed job per customer (for last service date, type, sub_type)
CREATE OR REPLACE FUNCTION public.get_last_completed_job_per_customer()
RETURNS TABLE(
  customer_id uuid,
  completed_at timestamptz,
  service_type character varying,
  service_sub_type character varying
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (j.customer_id)
    j.customer_id,
    j.completed_at,
    j.service_type,
    j.service_sub_type
  FROM jobs j
  WHERE j.status = 'COMPLETED'
    AND j.completed_at IS NOT NULL
    AND j.customer_id IS NOT NULL
  ORDER BY j.customer_id, j.completed_at DESC;
$$;

-- Last contact per customer (for last contacted date and status)
CREATE OR REPLACE FUNCTION public.get_last_contact_per_customer()
RETURNS TABLE(
  customer_id uuid,
  contacted_at timestamptz,
  status character varying
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (customer_id)
    customer_id,
    contacted_at,
    status
  FROM call_history
  ORDER BY customer_id, contacted_at DESC;
$$;

-- Grant execute to authenticated (and anon if your app uses it)
GRANT EXECUTE ON FUNCTION public.get_last_completed_job_per_customer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_last_completed_job_per_customer() TO anon;
GRANT EXECUTE ON FUNCTION public.get_last_contact_per_customer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_last_contact_per_customer() TO anon;
