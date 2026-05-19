-- Technicians: read ALL jobs for customers they are actively serving (reports + photo gallery).
-- Without this, getByCustomerId* only returns jobs where technician_can_access_job(id),
-- so returning customers show empty reports/history when prior jobs were done by others.
--
-- Prerequisites: secure-jobs-rls.sql, patch-technician-customer-access.sql (is_technician_assigned_to_customer).
-- Safe to re-run.

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
