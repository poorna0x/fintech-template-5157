-- Admin job delete (completed jobs have technician_payments etc.).
-- Run in Supabase SQL Editor. Safe to re-run.
--
-- Also run scripts/technician-job-sync-realtime.sql (DELETE fix) if job delete still 409s.

CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role',
    'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.auth_user_role() IS DISTINCT FROM 'technician';
$$;

CREATE OR REPLACE FUNCTION public.delete_job_admin(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.jobs WHERE id = p_job_id) THEN
    RAISE EXCEPTION 'job not found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.reminders
  WHERE entity_type = 'job' AND entity_id = p_job_id;

  -- Completed jobs: clear payment/parts rows before job (CASCADE should handle; explicit for safety).
  DELETE FROM public.technician_payments WHERE job_id = p_job_id;
  DELETE FROM public.job_parts_used WHERE job_id = p_job_id;
  DELETE FROM public.job_assignment_requests WHERE job_id = p_job_id;
  DELETE FROM public.follow_ups WHERE job_id = p_job_id;

  BEGIN
    DELETE FROM public.technician_job_sync WHERE job_id = p_job_id;
  EXCEPTION
    WHEN undefined_table THEN NULL;
  END;

  DELETE FROM public.jobs WHERE id = p_job_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count = 0 THEN
    RAISE EXCEPTION 'job could not be deleted' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_job_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_job_admin(uuid) TO authenticated;
