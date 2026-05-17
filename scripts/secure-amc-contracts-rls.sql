-- HIGH: Lock down public.amc_contracts (pricing, dates, customer links, agreement text).
-- Run in Supabase SQL Editor after secure-customers-rls.sql. Safe to re-run.
--
-- Admin: full CRUD.
-- Technician: SELECT only for customers on their jobs (or AMC they created).
-- Anon: no access.
--
-- If you previously ran scripts/allow-amc-without-auth.sql, this removes those open policies.

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

-- ---------------------------------------------------------------------------
-- Drop all permissive AMC policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Allow all users to read amc_contracts" ON public.amc_contracts;
DROP POLICY IF EXISTS "Allow all users to update amc_contracts" ON public.amc_contracts;
DROP POLICY IF EXISTS "Allow all to delete amc_contracts" ON public.amc_contracts;
DROP POLICY IF EXISTS "Allow all to insert amc_contracts" ON public.amc_contracts;
DROP POLICY IF EXISTS "Allow all to insert amc_contracts" ON public.amc_contracts;
DROP POLICY IF EXISTS "Allow authenticated users to insert amc_contracts" ON public.amc_contracts;
DROP POLICY IF EXISTS "Allow anon to insert amc_contracts" ON public.amc_contracts;
DROP POLICY IF EXISTS "Allow authenticated users to delete amc_contracts" ON public.amc_contracts;
DROP POLICY IF EXISTS "Allow anon to delete amc_contracts" ON public.amc_contracts;

DROP POLICY IF EXISTS amc_contracts_select ON public.amc_contracts;
DROP POLICY IF EXISTS amc_contracts_insert ON public.amc_contracts;
DROP POLICY IF EXISTS amc_contracts_update ON public.amc_contracts;
DROP POLICY IF EXISTS amc_contracts_delete ON public.amc_contracts;

ALTER TABLE public.amc_contracts ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

CREATE POLICY amc_contracts_select
  ON public.amc_contracts
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin_user()
    OR given_by_technician_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.jobs j
      WHERE j.customer_id = amc_contracts.customer_id
        AND public.technician_can_access_job(j.id)
    )
  );

CREATE POLICY amc_contracts_insert
  ON public.amc_contracts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_user());

CREATE POLICY amc_contracts_update
  ON public.amc_contracts
  FOR UPDATE
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE POLICY amc_contracts_delete
  ON public.amc_contracts
  FOR DELETE
  TO authenticated
  USING (public.is_admin_user());
