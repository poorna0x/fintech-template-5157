-- ============================================================================
-- CRITICAL — repatch public.is_admin_user() and public.auth_user_role().
--
-- Diagnostic (2026-05-24) revealed the deployed versions are MUCH older than
-- the files in scripts/, and missing every safety check:
--
--   auth_user_role()  → coalesce(jwt.role, 'admin')   -- defaults to admin
--   is_admin_user()   → (auth_user_role() != 'technician')  -- TRUE for ANYONE
--
-- Blast radius: 80+ RLS policies across jobs, customers, tax_invoices,
-- technicians, technician_payments, business_expenses, amc_contracts, etc.
-- ALL gate on is_admin_user(). Today, any authenticated non-technician JWT can
-- read/write/delete those tables via direct PostgREST calls, not just via
-- delete_job_admin.
--
-- This script restores the SAFE shape and goes one step further:
--   - auth_user_role(): NULL when auth.uid() IS NULL (used by jobs_select etc.)
--   - is_admin_user():  POSITIVE check — caller's JWT email must be in
--                       admin_users with is_active=true AND not in technicians.
--                       This matches the scanner's recommended pattern and
--                       closes the "no role metadata → defaults to admin" hole.
--   - Both SECURITY DEFINER with locked search_path.
--   - anon revoked, authenticated granted (RLS needs EXECUTE).
--
-- Pre-flight aborts if any active admin in auth.users lacks an admin_users row
-- (would otherwise lock that admin out of the dashboard).
--
-- Safe to re-run. Run in Supabase SQL Editor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Pre-flight — every active admin auth user must have an admin_users row.
--    Anyone missing would lose ALL admin access immediately after patching.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  unmatched_admins integer;
  sample text;
BEGIN
  -- "Admin auth user" = signed in, not a technician, not a technician role.
  -- We do NOT count technician auth users (they're already correctly excluded).
  SELECT count(*), string_agg(u.email, ', ' ORDER BY u.email)
  INTO unmatched_admins, sample
  FROM auth.users u
  WHERE NOT EXISTS (SELECT 1 FROM public.technicians t WHERE t.id = u.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.admin_users a
      WHERE lower(a.email) = lower(u.email)
        AND coalesce(a.is_active, true) = true
    );

  IF unmatched_admins > 0 THEN
    RAISE EXCEPTION
      'Refusing to patch is_admin_user(): % auth.users admin row(s) lack an active admin_users entry (%). '
      'Either insert those emails into public.admin_users (is_active=true), or confirm they should not be admins and disable/delete those auth users first.',
      unmatched_admins, sample;
  END IF;

  RAISE NOTICE 'Pre-flight OK: every non-technician auth user maps to admin_users.';
END $$;

-- ---------------------------------------------------------------------------
-- 1. auth_user_role() — NULL when unauthenticated; otherwise JWT role or 'admin'
--    Still used by jobs_select / technicians_roster_peers_select to detect
--    'technician' role; defaulting to 'admin' is fine because those policies
--    only ever compare against 'technician'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN NULL
    ELSE coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      'admin'
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.auth_user_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auth_user_role() FROM anon;
GRANT EXECUTE ON FUNCTION public.auth_user_role() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. is_admin_user() — STRICT positive check.
--    Must be (a) signed in, (b) not in technicians, (c) email present in
--    admin_users with is_active=true. Closes the "anyone authenticated is
--    admin" hole that affects every admin RLS policy.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.technicians t WHERE t.id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.admin_users a
      WHERE lower(a.email) = lower(coalesce(
              nullif(auth.jwt() ->> 'email', ''),
              ''
            ))
        AND coalesce(a.is_active, true) = true
    );
$$;

REVOKE ALL ON FUNCTION public.is_admin_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin_user() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Keep is_admin_account() in sync (added 2026-05-24 — same semantics).
--    Belt-and-braces: delete_job_admin and any future code can call either.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin_account()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin_user();
$$;

REVOKE ALL ON FUNCTION public.is_admin_account() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin_account() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Verification — fail loudly if the patch didn't take, or if an
--    unauthenticated session is still treated as admin.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  body_role text;
  body_admin text;
  unauth_role text;
  unauth_admin boolean;
  unauth_account boolean;
BEGIN
  SELECT p.prosrc INTO body_role
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'auth_user_role';

  IF body_role NOT LIKE '%auth.uid() IS NULL THEN NULL%' THEN
    RAISE EXCEPTION 'auth_user_role() body did not pick up the patch';
  END IF;

  SELECT p.prosrc INTO body_admin
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'is_admin_user';

  IF body_admin NOT LIKE '%public.admin_users%'
     OR body_admin NOT LIKE '%public.technicians%' THEN
    RAISE EXCEPTION 'is_admin_user() body did not pick up the positive-check patch';
  END IF;

  -- SQL Editor session has no JWT → all three must be safe.
  SELECT public.auth_user_role() INTO unauth_role;
  SELECT public.is_admin_user()  INTO unauth_admin;
  SELECT public.is_admin_account() INTO unauth_account;

  IF unauth_role IS NOT NULL THEN
    RAISE EXCEPTION 'auth_user_role() returned % for unauthenticated session (must be NULL)', unauth_role;
  END IF;

  IF unauth_admin THEN
    RAISE EXCEPTION 'is_admin_user() returned TRUE for unauthenticated session (must be FALSE)';
  END IF;

  IF unauth_account THEN
    RAISE EXCEPTION 'is_admin_account() returned TRUE for unauthenticated session (must be FALSE)';
  END IF;

  RAISE NOTICE 'OK: auth_user_role()=NULL, is_admin_user()=FALSE, is_admin_account()=FALSE for unauthenticated session.';
END $$;
