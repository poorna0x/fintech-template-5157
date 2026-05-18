-- HIGH: Block anon from reading technician GPS, salary, and password hashes.
-- Safe to re-run (idempotent).
--
-- Run in Supabase SQL Editor (after secure-customers-rls.sql; can replace re-running secure-technicians-rls.sql).
--
-- Fixes:
--   - Drops allow_all_technicians and legacy USING (true) policies
--   - Anon: only ID-card columns (no current_location, salary, password)
--   - Authenticated: password never readable/writable from client
--   - Technician peer lists: RPC get_technician_roster_for_app() (no GPS/salary)
--   - Admin: full row via is_admin_user() policies (unchanged)

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
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
AS $$
  SELECT public.auth_user_role() IS DISTINCT FROM 'technician';
$$;

-- ---------------------------------------------------------------------------
-- Drop open / legacy policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS allow_all_technicians ON public.technicians;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'technicians'
      AND (
        policyname LIKE 'Allow %'
        OR policyname LIKE 'allow_all_%'
        OR policyname LIKE '%_policy'
        OR qual = 'true'
        OR with_check = 'true'
      )
      AND policyname NOT LIKE 'technicians_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.technicians', r.policyname);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Row policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS technicians_admin_select ON public.technicians;
DROP POLICY IF EXISTS technicians_admin_insert ON public.technicians;
DROP POLICY IF EXISTS technicians_admin_update ON public.technicians;
DROP POLICY IF EXISTS technicians_admin_delete ON public.technicians;
DROP POLICY IF EXISTS technicians_self_select ON public.technicians;
DROP POLICY IF EXISTS technicians_self_update ON public.technicians;
DROP POLICY IF EXISTS technicians_roster_peers_select ON public.technicians;
DROP POLICY IF EXISTS technicians_public_id_card ON public.technicians;

ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;

CREATE POLICY technicians_admin_select
  ON public.technicians FOR SELECT TO authenticated
  USING (public.is_admin_user());

CREATE POLICY technicians_admin_insert
  ON public.technicians FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user());

CREATE POLICY technicians_admin_update
  ON public.technicians FOR UPDATE TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE POLICY technicians_admin_delete
  ON public.technicians FOR DELETE TO authenticated
  USING (public.is_admin_user());

CREATE POLICY technicians_self_select
  ON public.technicians FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY technicians_self_update
  ON public.technicians FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY technicians_public_id_card
  ON public.technicians FOR SELECT TO anon
  USING (account_status = 'ACTIVE');

-- ---------------------------------------------------------------------------
-- Column privileges: anon ID card only; no client password access
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.technicians FROM anon;
GRANT SELECT (
  id,
  full_name,
  employee_id,
  phone,
  email,
  photo,
  status
) ON TABLE public.technicians TO anon;

REVOKE SELECT (password) ON TABLE public.technicians FROM authenticated;
REVOKE INSERT (password) ON TABLE public.technicians FROM authenticated;
REVOKE UPDATE (password) ON TABLE public.technicians FROM authenticated;

-- ---------------------------------------------------------------------------
-- Technician roster RPC (QR picker / reports) — excludes GPS + salary
-- ---------------------------------------------------------------------------

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
GRANT EXECUTE ON FUNCTION public.get_technician_roster_for_app() TO authenticated;

-- ---------------------------------------------------------------------------
-- Login routing (no password exposure)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_technician_email(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.technicians t
    WHERE lower(trim(t.email)) = lower(trim(p_email))
      AND t.account_status = 'ACTIVE'
  );
$$;

REVOKE ALL ON FUNCTION public.is_technician_email(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_technician_email(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_technician_email(text) TO service_role;
