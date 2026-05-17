-- Allow technicians to update customers on completed jobs they finished (RLS only).
-- Run after secure-customers-rls.sql. Safe to re-run.

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
  );
$$;
