-- CRITICAL: Lock down public.technicians (bcrypt hashes + open PATCH via anon key).
-- Run once in Supabase SQL Editor after secure-customers-rls.sql.
--
-- BEFORE running:
--   1. All technicians can log in via Supabase Auth (provision script or Settings sync).
--   2. SUPABASE_SERVICE_ROLE_KEY set on Netlify (sync + provision functions).
--   3. Deploy latest app (password hash written only via sync function, not client INSERT).
--
-- AFTER running:
--   - anon cannot SELECT/UPDATE/DELETE technicians (including password hashes).
--   - authenticated cannot read/write password column (service role + Netlify only).
--   - Public ID card: anon may SELECT non-sensitive columns for ACTIVE technicians only.

-- Reuse helpers from secure-customers-rls.sql (safe to re-run)
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
-- Drop open policy (anon + authenticated full access)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS allow_all_technicians ON public.technicians;

-- ---------------------------------------------------------------------------
-- Row policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS technicians_admin_select ON public.technicians;
DROP POLICY IF EXISTS technicians_admin_insert ON public.technicians;
DROP POLICY IF EXISTS technicians_admin_update ON public.technicians;
DROP POLICY IF EXISTS technicians_admin_delete ON public.technicians;
DROP POLICY IF EXISTS technicians_self_select ON public.technicians;
DROP POLICY IF EXISTS technicians_self_update ON public.technicians;
DROP POLICY IF EXISTS technicians_public_id_card ON public.technicians;

ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;

-- Admin: full row access (password column blocked separately below)
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

-- Technician: own profile (location, status, etc.) — not other technicians
CREATE POLICY technicians_self_select
  ON public.technicians FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY technicians_self_update
  ON public.technicians FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Public ID card page (/technician-id/:id): name, photo, contact only — never password
CREATE POLICY technicians_public_id_card
  ON public.technicians FOR SELECT TO anon
  USING (account_status = 'ACTIVE');

-- ---------------------------------------------------------------------------
-- Column-level: password hash only via service role (Netlify functions)
-- ---------------------------------------------------------------------------

REVOKE SELECT (password) ON public.technicians FROM anon, authenticated;
REVOKE INSERT (password) ON public.technicians FROM anon, authenticated;
REVOKE UPDATE (password) ON public.technicians FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Login routing helper (no password exposure)
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
GRANT EXECUTE ON FUNCTION public.is_technician_email(text) TO anon, authenticated;
