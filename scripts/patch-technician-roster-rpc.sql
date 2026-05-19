-- Technician PWA: roster for QR picker + "Completed by" names in reports (no GPS/salary).
-- Fixes: POST .../rpc/get_technician_roster_for_app 404
-- Run in Supabase SQL Editor after secure-technicians-rls.sql (needs auth_user_role).
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.get_technician_roster_for_app()
RETURNS TABLE (
  id uuid,
  full_name character varying,
  phone character varying,
  email character varying,
  employee_id character varying,
  skills jsonb,
  service_areas jsonb,
  status character varying,
  work_schedule jsonb,
  performance jsonb,
  vehicle jsonb,
  qr_code text,
  photo text,
  visible_qr_codes jsonb,
  common_qr_code_ids jsonb,
  account_status character varying,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.full_name,
    t.phone,
    t.email,
    t.employee_id,
    t.skills,
    t.service_areas,
    t.status,
    t.work_schedule,
    t.performance,
    t.vehicle,
    t.qr_code,
    t.photo,
    t.visible_qr_codes,
    t.common_qr_code_ids,
    t.account_status,
    t.created_at,
    t.updated_at
  FROM public.technicians t
  WHERE auth.uid() IS NOT NULL
    AND public.auth_user_role() = 'technician'
    AND (
      t.account_status IS NULL
      OR t.account_status IN ('ACTIVE', 'SUSPENDED')
    )
  ORDER BY t.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_technician_roster_for_app() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_technician_roster_for_app() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_technician_roster_for_app() TO authenticated;
