-- Admin job delete (avoids 409 from RLS-blocked direct DELETE and cleans reminders).
-- Run in Supabase SQL Editor after secure-jobs-rls.sql. Safe to re-run.

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
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.reminders
  WHERE entity_type = 'job' AND entity_id = p_job_id;

  DELETE FROM public.jobs WHERE id = p_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'job not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_job_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_job_admin(uuid) TO authenticated;
