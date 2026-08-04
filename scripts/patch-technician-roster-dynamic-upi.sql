-- Include technician Dynamic UPI fields on the app roster RPC.
-- Run AFTER scripts/add-technician-dynamic-upi.sql
-- Must DROP first: Postgres won't change OUT/return columns via CREATE OR REPLACE.

DROP FUNCTION IF EXISTS public.get_technician_roster_for_app();

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
  updated_at timestamptz,
  upi_id text,
  payee_name text,
  upi_phone text,
  dynamic_upi_enabled boolean
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
    t.updated_at,
    coalesce(t.upi_id, ''),
    coalesce(t.payee_name, ''),
    coalesce(t.upi_phone, ''),
    coalesce(t.dynamic_upi_enabled, false)
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
