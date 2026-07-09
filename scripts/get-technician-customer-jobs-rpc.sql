-- Technician customer history: reports + photo gallery.
-- Bypasses jobs RLS via SECURITY DEFINER while enforcing is_technician_assigned_to_customer.
-- Also updates is_technician_assigned_to_customer + jobs_select (same as patch-technician-customer-jobs-read.sql).
-- Run in Supabase SQL Editor. Safe to re-run.

CREATE OR REPLACE FUNCTION public.is_technician_assigned_to_customer(p_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.jobs j
    WHERE j.customer_id = p_customer_id
      AND (
        j.assigned_technician_id = auth.uid()
        OR j.completed_by = auth.uid()
        OR j.assigned_by = auth.uid()
        OR (
          j.team_members IS NOT NULL
          AND j.team_members @> jsonb_build_array(auth.uid()::text)
        )
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.job_assignment_requests jar
    INNER JOIN public.jobs j ON j.id = jar.job_id
    WHERE j.customer_id = p_customer_id
      AND jar.technician_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS jobs_select ON public.jobs;

CREATE POLICY jobs_select
  ON public.jobs
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin_user()
    OR public.technician_can_access_job(id)
    OR (
      public.auth_user_role() = 'technician'
      AND public.is_technician_assigned_to_customer(customer_id)
    )
  );

-- Completed jobs for technician Customer Report (includes after_photos for bill/payment fallback).
CREATE OR REPLACE FUNCTION public.get_technician_customer_jobs_report(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
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

  IF NOT public.is_technician_assigned_to_customer(p_customer_id) THEN
    RAISE EXCEPTION 'Not assigned to this customer';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', j.id,
        'job_number', j.job_number,
        'customer_id', j.customer_id,
        'status', j.status,
        'priority', j.priority,
        'service_type', j.service_type,
        'service_sub_type', j.service_sub_type,
        'service_brand', j.service_brand,
        'scheduled_date', j.scheduled_date,
        'scheduled_time_slot', j.scheduled_time_slot,
        'created_at', j.created_at,
        'updated_at', j.updated_at,
        'completed_at', j.completed_at,
        'end_time', j.end_time,
        'denied_at', j.denied_at,
        'denial_reason', j.denial_reason,
        'assigned_technician_id', j.assigned_technician_id,
        'completed_by', j.completed_by,
        'payment_amount', j.payment_amount,
        'actual_cost', j.actual_cost,
        'estimated_cost', j.estimated_cost,
        'payment_method', j.payment_method,
        'lead_cost', j.lead_cost,
        'parts_cost_total', j.parts_cost_total,
        'requirements', j.requirements,
        'brand', j.brand,
        'model', j.model,
        'completion_notes', j.completion_notes,
        'description', j.description,
        'after_photos', j.after_photos
      )
      ORDER BY j.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.jobs j
  WHERE j.customer_id = p_customer_id
    AND j.status = 'COMPLETED';

  RETURN v_result;
END;
$$;

-- All jobs for technician customer photo gallery.
CREATE OR REPLACE FUNCTION public.get_technician_customer_jobs_photos(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
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

  IF NOT public.is_technician_assigned_to_customer(p_customer_id) THEN
    RAISE EXCEPTION 'Not assigned to this customer';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', j.id,
        'created_at', j.created_at,
        'updated_at', j.updated_at,
        'completed_at', j.completed_at,
        'end_time', j.end_time,
        'before_photos', j.before_photos,
        'after_photos', j.after_photos,
        'images', j.images,
        'requirements', j.requirements
      )
      ORDER BY j.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.jobs j
  WHERE j.customer_id = p_customer_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_technician_customer_jobs_report(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_technician_customer_jobs_photos(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_technician_customer_jobs_report(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_technician_customer_jobs_photos(uuid) TO authenticated;
