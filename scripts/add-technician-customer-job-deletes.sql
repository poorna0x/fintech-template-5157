-- Deleted jobs (with a remark) on the technician customer report.
-- Run in the Supabase SQL Editor. Safe to re-run.
-- Same gate as get_technician_customer_jobs_report: any active technician.

CREATE OR REPLACE FUNCTION public.get_technician_customer_job_deletes(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF public.is_admin_user() THEN
    RAISE EXCEPTION 'Use admin job queries';
  END IF;

  IF NOT public.is_active_technician() THEN
    RAISE EXCEPTION 'Technician access required';
  END IF;

  IF p_customer_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'customer_id', e.customer_id,
        'job_number', e.job_number,
        'job_status', e.job_status,
        'service_type', e.service_type,
        'remark', e.remark,
        'created_at', e.created_at
      )
      ORDER BY e.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT id, customer_id, job_number, job_status, service_type, remark, created_at
    FROM public.customer_job_delete_events
    WHERE customer_id = p_customer_id
      AND remark IS NOT NULL
      AND btrim(remark) <> ''
    ORDER BY created_at DESC
    LIMIT 100
  ) e;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_technician_customer_job_deletes(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_technician_customer_job_deletes(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_technician_customer_job_deletes(uuid) TO authenticated;
