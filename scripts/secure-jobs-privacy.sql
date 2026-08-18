-- Jobs privacy: block anon REST access + redact GPS / workflow OTP fields when job completes.
-- The in-app "OTP" is a 4-digit workflow checkbox (not SMS 2FA).
-- On complete we strip only otp_code (job-create secret); otp_entered is kept for admin audit.
-- Run in Supabase SQL Editor after secure-customers-rls.sql. Safe to re-run.
--
-- Fixes: GET /rest/v1/jobs exposing requirements + service_location to anon.

-- ---------------------------------------------------------------------------
-- Helpers (match secure-jobs-rls.sql)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role',
    'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.technicians t WHERE t.id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.admin_users a
      WHERE lower(a.email) = lower(coalesce(
              nullif(auth.jwt() ->> 'email', ''),
              ''
            ))
        AND coalesce(a.is_active, true) = true
    );
$$;

CREATE OR REPLACE FUNCTION public.technician_can_access_job(p_job_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = p_job_id
      AND (
        j.assigned_technician_id = auth.uid()
        OR j.assigned_by = auth.uid()
        OR j.completed_by = auth.uid()
        OR (
          j.team_members IS NOT NULL
          AND (
            j.team_members @> to_jsonb(auth.uid()::text)
            OR j.team_members @> jsonb_build_array(auth.uid()::text)
            OR j.team_members @> jsonb_build_array(auth.uid())
          )
        )
      )
  )
  OR EXISTS (
    SELECT 1 FROM public.job_assignment_requests jar
    WHERE jar.job_id = p_job_id AND jar.technician_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- 1) Remove open jobs access (root cause of scanner finding)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS allow_all_jobs ON public.jobs;
DROP POLICY IF EXISTS "Allow public read access" ON public.jobs;
DROP POLICY IF EXISTS "Allow public insert access" ON public.jobs;
DROP POLICY IF EXISTS "Allow public update access" ON public.jobs;
DROP POLICY IF EXISTS "Allow public delete access" ON public.jobs;
DROP POLICY IF EXISTS "Allow anon read access" ON public.jobs;
DROP POLICY IF EXISTS "Allow authenticated read access" ON public.jobs;

REVOKE ALL ON TABLE public.jobs FROM anon;

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jobs_select ON public.jobs;
DROP POLICY IF EXISTS jobs_insert ON public.jobs;
DROP POLICY IF EXISTS jobs_update ON public.jobs;
DROP POLICY IF EXISTS jobs_delete ON public.jobs;

CREATE POLICY jobs_select
  ON public.jobs FOR SELECT TO authenticated
  USING (public.is_admin_user() OR public.technician_can_access_job(id));

CREATE POLICY jobs_insert
  ON public.jobs FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user());

CREATE POLICY jobs_update
  ON public.jobs FOR UPDATE TO authenticated
  USING (public.is_admin_user() OR public.technician_can_access_job(id))
  WITH CHECK (public.is_admin_user() OR public.technician_can_access_job(id));

CREATE POLICY jobs_delete
  ON public.jobs FOR DELETE TO authenticated
  USING (public.is_admin_user());

-- ---------------------------------------------------------------------------
-- 2) Redact precise GPS / maps links from service_location (keep text address fields)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redact_job_service_location(p_loc jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result jsonb;
  fmt text;
BEGIN
  IF p_loc IS NULL OR jsonb_typeof(p_loc) IS DISTINCT FROM 'object' THEN
    RETURN '{}'::jsonb;
  END IF;

  result := p_loc
    - 'latitude'
    - 'longitude'
    - 'lat'
    - 'lng'
    - 'googleLocation'
    - 'google_location';

  IF result ? 'formattedAddress' THEN
    fmt := result ->> 'formattedAddress';
    IF fmt ~* '(google\.com/maps|maps\.app\.goo\.gl|goo\.gl/maps|^\s*-?\d+\.?\d*\s*,\s*-?\d+\.?\d*\s*$)' THEN
      result := result - 'formattedAddress';
    END IF;
  END IF;

  RETURN coalesce(result, '{}'::jsonb);
END;
$$;

-- Strip workflow otp_code from requirements JSON array on complete (generated at job create).
-- Keep otp_entered + otp_verified* so admin can audit what the technician typed.
CREATE OR REPLACE FUNCTION public.redact_job_requirements_workflow(p_req jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  arr jsonb;
  elem jsonb;
  out jsonb := '[]'::jsonb;
  i int;
BEGIN
  IF p_req IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  IF jsonb_typeof(p_req) = 'array' THEN
    arr := p_req;
  ELSIF jsonb_typeof(p_req) = 'object' THEN
    arr := jsonb_build_array(p_req);
  ELSE
    RETURN p_req;
  END IF;

  FOR i IN 0 .. jsonb_array_length(arr) - 1 LOOP
    elem := arr -> i;
    IF jsonb_typeof(elem) = 'object' AND (elem ->> 'require_otp')::boolean IS TRUE THEN
      elem := elem - 'otp_code';
    END IF;
    out := out || jsonb_build_array(elem);
  END LOOP;

  RETURN out;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) On COMPLETED: redact GPS + workflow OTP fields in DB
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jobs_redact_on_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'COMPLETED' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'COMPLETED') THEN
    NEW.service_location := public.redact_job_service_location(NEW.service_location);
    NEW.requirements := public.redact_job_requirements_workflow(NEW.requirements);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jobs_redact_on_complete ON public.jobs;
CREATE TRIGGER trg_jobs_redact_on_complete
  BEFORE INSERT OR UPDATE OF status, service_location, requirements ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.jobs_redact_on_complete();

-- ---------------------------------------------------------------------------
-- 4) One-time backfill: already-completed jobs (run once; safe to re-run)
-- ---------------------------------------------------------------------------
UPDATE public.jobs
SET
  service_location = public.redact_job_service_location(service_location),
  requirements = public.redact_job_requirements_workflow(requirements)
WHERE status = 'COMPLETED';
