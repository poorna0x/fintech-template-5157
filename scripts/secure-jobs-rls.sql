-- CRITICAL: Lock down public.jobs (payment receipt URLs, bills, job PII in requirements/photos).
-- Run in Supabase SQL Editor. Safe to re-run.
--
-- BEFORE running:
--   1. scripts/secure-customers-rls.sql applied.
--   2. Latest app deployed (create_job_for_booking RPC — db.jobs.create with booking phone).
--
-- AFTER running:
--   - anon cannot SELECT/INSERT/UPDATE/DELETE jobs (no mass Cloudinary URL scrape via REST).
--   - Public /book still works via create_job_for_booking RPC.
--   - Admins: full job access; Technicians: assigned jobs only.
--
-- Cloudinary URLs already leaked remain on CDN until you use signed delivery (app) or
-- change Cloudinary upload presets to authenticated/private for new uploads.

-- Requires normalize_indian_phone from secure-customers-rls.sql
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

DROP POLICY IF EXISTS allow_all_jobs ON public.jobs;

CREATE OR REPLACE FUNCTION public.create_job_for_booking(p_phone text, p_row jsonb)
RETURNS public.jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  norm text;
  cust_id uuid;
  inserted public.jobs;
BEGIN
  norm := public.normalize_indian_phone(p_phone);
  cust_id := (p_row ->> 'customer_id')::uuid;
  IF cust_id IS NULL THEN RAISE EXCEPTION 'customer_id required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = cust_id
      AND (
        right(regexp_replace(c.phone, '\D', '', 'g'), 10) = norm
        OR right(regexp_replace(coalesce(c.alternate_phone, ''), '\D', '', 'g'), 10) = norm
      )
  ) THEN
    RAISE EXCEPTION 'customer not found or phone mismatch';
  END IF;
  IF coalesce(p_row ->> 'job_number', '') = '' THEN RAISE EXCEPTION 'job_number required'; END IF;

  INSERT INTO public.jobs (
    job_number, customer_id, service_type, service_sub_type, brand, model,
    scheduled_date, scheduled_time_slot, estimated_duration,
    service_address, service_location, status, priority, description,
    requirements, estimated_cost, payment_status, before_photos, images
  ) VALUES (
    p_row ->> 'job_number', cust_id,
    p_row ->> 'service_type', p_row ->> 'service_sub_type',
    coalesce(p_row ->> 'brand', 'Not specified'), coalesce(p_row ->> 'model', 'Not specified'),
    (p_row ->> 'scheduled_date')::date, p_row ->> 'scheduled_time_slot',
    coalesce((p_row ->> 'estimated_duration')::integer, 120),
    coalesce(p_row -> 'service_address', '{}'::jsonb),
    coalesce(p_row -> 'service_location', '{}'::jsonb),
    'PENDING', coalesce(p_row ->> 'priority', 'MEDIUM'),
    coalesce(p_row ->> 'description', ''),
    coalesce(p_row -> 'requirements', '[]'::jsonb),
    coalesce((p_row ->> 'estimated_cost')::numeric, 0),
    coalesce(p_row ->> 'payment_status', 'PENDING'),
    coalesce(p_row -> 'before_photos', '[]'::jsonb),
    coalesce(p_row -> 'images', coalesce(p_row -> 'before_photos', '[]'::jsonb))
  ) RETURNING * INTO inserted;
  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.create_job_for_booking(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_job_for_booking(text, jsonb) TO anon, authenticated;

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
