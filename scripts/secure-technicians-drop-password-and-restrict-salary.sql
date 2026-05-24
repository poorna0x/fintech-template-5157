-- ============================================================================
-- Half B (POST-DEPLOY, DESTRUCTIVE): Drop technicians.password + restrict
-- salary reads. Addresses scanner finding 2026-05-24: "Technician Salary Data
-- and Password Hashes Exposed to Any Authenticated User" (CVSS 7.5).
--
-- ORDER OF OPERATIONS:
--   1. Run scripts/secure-technicians-add-admin-rpcs.sql (Half A — additive).
--   2. Deploy the new app build (uses the new RPCs, no longer reads salary or
--      password from technicians directly).
--   3. Run THIS script (Half B). It pre-flights, then drops password, then
--      revokes column grants.
--
-- After this migration:
--   - public.technicians no longer has a `password` column (Supabase Auth is
--     the sole source of truth for technician credentials).
--   - SELECT on `salary`, `push_subscription` is revoked from anon AND
--     authenticated. Admins read salary via the SECURITY DEFINER RPCs
--     created in Half A.
--   - UPDATE on `salary` is restricted to admins through the existing
--     `technicians_admin_update` row policy (column GRANT remains so admins
--     can still write via PostgREST after column REVOKE on SELECT).
--
-- PREREQUISITES (must hold before running):
--   1. All ACTIVE technicians have a matching `auth.users` row (run
--      `node scripts/provision-technician-auth-users.mjs` first if not).
--      The pre-flight DO block below will RAISE EXCEPTION if any are missing.
--   2. App build with the following changes is already LIVE in production:
--        - `db.technicians.getAll/getAllForDashboard/...` route through the
--          admin RPCs created in Half A.
--        - `authenticateUser`, `hash-technician-password`,
--          `verify-technician-password`, `provision-technician-auth-on-login`
--          dead paths removed.
--   3. `scripts/secure-technicians-rls.sql` (or `secure-technicians-privacy.sql`)
--      has already been applied (RLS enabled, role helpers exist).
--
-- Safe to re-run (idempotent). The CREATE OR REPLACE for the RPCs is included
-- as belt-and-braces in case Half A was skipped.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Pre-flight: abort if any ACTIVE technician is missing from auth.users.
--    Dropping `technicians.password` removes the last credential fallback;
--    any tech without a Supabase Auth row would be locked out.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  missing_count integer;
  sample text;
BEGIN
  SELECT COUNT(*),
         string_agg(t.email, ', ' ORDER BY t.email)
  INTO missing_count, sample
  FROM public.technicians t
  WHERE coalesce(t.account_status, 'ACTIVE') = 'ACTIVE'
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.id);

  IF missing_count > 0 THEN
    RAISE EXCEPTION
      'Refusing to drop technicians.password: % active technician(s) have no auth.users row yet (%). Run scripts/provision-technician-auth-users.mjs first.',
      missing_count, sample;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Drop the password column (idempotent).
-- ---------------------------------------------------------------------------

ALTER TABLE public.technicians DROP COLUMN IF EXISTS password;

-- ---------------------------------------------------------------------------
-- 2. Lock down SELECT to specific columns only (no `salary`, no
--    `push_subscription`). Postgres requires REVOKE on the table-level GRANT
--    first, then GRANT only the columns we want readable. Column-level REVOKE
--    alone has no effect while a table-level GRANT exists.
--
--    Anon was already restricted in secure-technicians-rls.sql (ID-card cols
--    only) so we only need to fix `authenticated` here.
--
--    INSERT/UPDATE/DELETE table-level grants stay intact (RLS row policies
--    enforce admin-only writes via `technicians_admin_*`).
-- ---------------------------------------------------------------------------

REVOKE SELECT ON TABLE public.technicians FROM authenticated;

GRANT SELECT (
  id,
  full_name,
  phone,
  email,
  employee_id,
  skills,
  service_areas,
  status,
  current_location,
  work_schedule,
  performance,
  vehicle,
  qr_code,
  photo,
  visible_qr_codes,
  common_qr_code_ids,
  account_status,
  created_at,
  updated_at
) ON TABLE public.technicians TO authenticated;

-- Belt-and-braces: also revoke `salary` / `push_subscription` from anon
-- (anon should already have only ID-card columns granted, but this is
-- harmless if it's already revoked).
DO $$
BEGIN
  EXECUTE 'REVOKE SELECT (salary) ON TABLE public.technicians FROM anon';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'salary SELECT revoke (anon) skipped: %', SQLERRM;
END $$;

DO $$
BEGIN
  EXECUTE 'REVOKE SELECT (push_subscription) ON TABLE public.technicians FROM anon';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'push_subscription SELECT revoke (anon) skipped: %', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Admin-only RPC: full row including salary + current_location.
--    Returns SETOF technicians, so callers in the app can keep treating the
--    result as a normal technicians row (no shape change in TypeScript).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_technicians_for_admin()
RETURNS SETOF public.technicians
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Admin access required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT t.*
  FROM public.technicians t
  ORDER BY t.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_technicians_for_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_technicians_for_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_technicians_for_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_technician_for_admin(p_id uuid)
RETURNS SETOF public.technicians
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Admin access required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT t.*
  FROM public.technicians t
  WHERE t.id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_technician_for_admin(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_technician_for_admin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_technician_for_admin(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Sanity verification — run after applying. These should all be empty /
--    expected. Wrap in SELECTs the operator can copy-paste.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  has_password boolean;
  has_table_select boolean;
  salary_col_grants integer;
BEGIN
  -- 4a. password column must be gone
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'technicians'
      AND column_name = 'password'
  ) INTO has_password;

  IF has_password THEN
    RAISE EXCEPTION 'technicians.password still exists — DROP did not apply.';
  END IF;

  -- 4b. authenticated must NOT hold a table-level SELECT (only column grants).
  -- Note: information_schema.column_privileges reports a row for EVERY column
  -- when a table-level GRANT exists, so we check table_privileges directly.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name = 'technicians'
      AND privilege_type = 'SELECT'
      AND grantee = 'authenticated'
  ) INTO has_table_select;

  IF has_table_select THEN
    RAISE EXCEPTION 'authenticated still has table-level SELECT on technicians — column lockdown is bypassed.';
  END IF;

  -- 4c. salary must NOT appear in the column SELECT grants for authenticated.
  SELECT COUNT(*) INTO salary_col_grants
  FROM information_schema.column_privileges
  WHERE table_schema = 'public'
    AND table_name = 'technicians'
    AND column_name = 'salary'
    AND privilege_type = 'SELECT'
    AND grantee IN ('anon', 'authenticated');

  IF salary_col_grants > 0 THEN
    RAISE EXCEPTION 'salary SELECT is still granted to anon/authenticated at the column level.';
  END IF;

  RAISE NOTICE 'OK: password column dropped, salary SELECT locked down to admins via RPC.';
END $$;
