-- ============================================================================
-- HIGH (CVSS 7.5) — delete_job_admin callable by any authenticated user.
-- Scanner finding 2026-05-24:
--   JWT with role='authenticated' and app_metadata={provider:'email'} (no
--   `role` claim) passes is_admin_user() because auth_user_role() defaults to
--   'admin' when no role is present. Today this is contained because signups
--   are disabled, but it is the wrong shape — admin must be a POSITIVE check
--   against admin_users, not "anyone who isn't a technician".
--
-- This script:
--   1. Pre-flight: abort if NO admin auth.users row maps to an active
--      admin_users row by email (prevents accidental lockout).
--   2. Adds public.is_admin_account() — strict positive check against
--      admin_users (by lowercased email + is_active).
--   3. Recreates delete_job_admin to gate on is_admin_account() AND
--      is_admin_user() (defense-in-depth: scanner JWT must fail BOTH).
--   4. Re-applies tight grants (anon/service_role revoked, authenticated
--      granted — RLS/JWT do the rest).
--   5. Verifies the new guard is present in pg_proc.prosrc.
--
-- Run in Supabase SQL Editor. Safe to re-run.
-- Prereqs (already applied): scripts/secure-delete-job-admin-rpc.sql
--                            scripts/secure-auth-helpers-and-is-admin-rpc.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Pre-flight — refuse to install if no admin auth user is matchable.
--    Without this, hardening delete_job_admin would lock every admin out.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  matched_admins integer;
  total_admin_rows integer;
  sample text;
BEGIN
  SELECT count(*) INTO total_admin_rows
  FROM public.admin_users
  WHERE coalesce(is_active, true) = true;

  IF total_admin_rows = 0 THEN
    RAISE EXCEPTION
      'Refusing to harden delete_job_admin: public.admin_users has 0 active rows. '
      'Insert your admin email(s) into admin_users (is_active=true) first, then re-run.';
  END IF;

  SELECT count(*) INTO matched_admins
  FROM auth.users u
  JOIN public.admin_users a
    ON lower(a.email) = lower(u.email)
   AND coalesce(a.is_active, true) = true
  WHERE NOT EXISTS (SELECT 1 FROM public.technicians t WHERE t.id = u.id);

  IF matched_admins = 0 THEN
    SELECT string_agg(email, ', ') INTO sample
    FROM (
      SELECT email FROM public.admin_users
      WHERE coalesce(is_active, true) = true
      ORDER BY email LIMIT 3
    ) s;

    RAISE EXCEPTION
      'Refusing to harden delete_job_admin: no auth.users row matches an active admin_users email '
      '(sample admin_users emails: %). Create the Supabase Auth user(s) for these emails first, '
      'or correct the admin_users.email casing, then re-run.', coalesce(sample, '(none)');
  END IF;

  RAISE NOTICE 'Pre-flight OK: % active admin_users row(s), % matched to auth.users.',
    total_admin_rows, matched_admins;
END $$;

-- ---------------------------------------------------------------------------
-- 1. is_admin_account() — STRICT positive check against admin_users.
--    Unlike is_admin_user() (which is "not a technician"), this REQUIRES
--    the caller's JWT email to exist in admin_users with is_active=true.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin_account()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.admin_users a
      WHERE lower(a.email) = lower(coalesce(
              nullif(auth.jwt() ->> 'email', ''),
              ''
            ))
        AND coalesce(a.is_active, true) = true
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.technicians t WHERE t.id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.is_admin_account() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin_account() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. delete_job_admin — gate on is_admin_account() (positive) AND
--    is_admin_user() (legacy, kept for belt-and-braces).
--
--    Scanner JWT (role='authenticated', no email in admin_users) fails
--    is_admin_account() → 42501. Even if a future JWT spoofs metadata,
--    is_admin_user() still requires NOT-IN-technicians.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_job_admin(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin_account() THEN
    RAISE LOG 'delete_job_admin: rejected non-admin caller (uid=%, email=%)',
      auth.uid(), coalesce(auth.jwt() ->> 'email', '(none)');
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.jobs WHERE id = p_job_id) THEN
    RAISE EXCEPTION 'job not found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.reminders
  WHERE entity_type = 'job' AND entity_id = p_job_id;

  DELETE FROM public.technician_payments WHERE job_id = p_job_id;
  DELETE FROM public.job_parts_used WHERE job_id = p_job_id;
  DELETE FROM public.job_assignment_requests WHERE job_id = p_job_id;
  DELETE FROM public.follow_ups WHERE job_id = p_job_id;

  BEGIN
    DELETE FROM public.technician_job_sync WHERE job_id = p_job_id;
  EXCEPTION
    WHEN undefined_table THEN NULL;
  END;

  DELETE FROM public.jobs WHERE id = p_job_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count = 0 THEN
    RAISE EXCEPTION 'job could not be deleted' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_job_admin(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_job_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_job_admin(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.delete_job_admin(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Verification — fail loudly if the new guard is missing or grants drifted.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  has_new_guard boolean;
  anon_can_exec boolean;
  service_can_exec boolean;
  auth_can_exec boolean;
  admin_check_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'is_admin_account'
  ) INTO admin_check_exists;

  IF NOT admin_check_exists THEN
    RAISE EXCEPTION 'is_admin_account() was not created';
  END IF;

  SELECT (p.prosrc LIKE '%is_admin_account()%')
  INTO has_new_guard
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'delete_job_admin';

  IF NOT coalesce(has_new_guard, false) THEN
    RAISE EXCEPTION 'delete_job_admin is missing the is_admin_account() guard';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name = 'delete_job_admin'
      AND grantee = 'anon'
      AND privilege_type = 'EXECUTE'
  ) INTO anon_can_exec;

  IF anon_can_exec THEN
    RAISE EXCEPTION 'anon still has EXECUTE on delete_job_admin';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name = 'delete_job_admin'
      AND grantee = 'service_role'
      AND privilege_type = 'EXECUTE'
  ) INTO service_can_exec;

  IF service_can_exec THEN
    RAISE EXCEPTION 'service_role still has EXECUTE on delete_job_admin (should use bypassrls path instead)';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name = 'delete_job_admin'
      AND grantee = 'authenticated'
      AND privilege_type = 'EXECUTE'
  ) INTO auth_can_exec;

  IF NOT auth_can_exec THEN
    RAISE EXCEPTION 'authenticated lost EXECUTE on delete_job_admin (admin UI will break)';
  END IF;

  RAISE NOTICE 'OK: delete_job_admin hardened — is_admin_account() guard installed, grants tight.';
END $$;
