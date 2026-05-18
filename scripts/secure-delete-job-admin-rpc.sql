-- CRITICAL: Block anon/public from delete_job_admin; fix auth helpers so anon is never treated as admin.
-- Run in Supabase SQL Editor. Safe to re-run.
--
-- Admin dashboard deletes jobs via authenticated JWT + delete_job_admin RPC only.

-- ---------------------------------------------------------------------------
-- Auth helpers (anon must NOT default to admin)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN NULL
    ELSE coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      'admin'
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.technicians t WHERE t.id = auth.uid()
    )
    AND public.auth_user_role() IS DISTINCT FROM 'technician';
$$;

-- ---------------------------------------------------------------------------
-- delete_job_admin: require signed-in admin
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_job_admin(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.jobs WHERE id = p_job_id) THEN
    RAISE EXCEPTION 'job not found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.reminders
  WHERE entity_type = 'job' AND entity_id = p_job_id;

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
REVOKE EXECUTE ON FUNCTION public.delete_job_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_job_admin(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.delete_job_admin(uuid) TO authenticated;
