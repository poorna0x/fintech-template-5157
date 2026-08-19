-- Fix: technician_common_qr has no technician_id (shared QR catalog).
-- Run if secure-all-rls.sql failed with ERROR 42703 on technician_id.
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role',
    'admin'
  ) IS DISTINCT FROM 'technician';
$$;

ALTER TABLE public.technician_common_qr ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS technician_common_qr_select ON public.technician_common_qr;
DROP POLICY IF EXISTS technician_common_qr_insert ON public.technician_common_qr;
DROP POLICY IF EXISTS technician_common_qr_update ON public.technician_common_qr;
DROP POLICY IF EXISTS technician_common_qr_delete ON public.technician_common_qr;

CREATE POLICY technician_common_qr_select
  ON public.technician_common_qr FOR SELECT TO authenticated
  USING (true);

CREATE POLICY technician_common_qr_insert
  ON public.technician_common_qr FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user());

CREATE POLICY technician_common_qr_update
  ON public.technician_common_qr FOR UPDATE TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE POLICY technician_common_qr_delete
  ON public.technician_common_qr FOR DELETE TO authenticated
  USING (public.is_admin_user());
