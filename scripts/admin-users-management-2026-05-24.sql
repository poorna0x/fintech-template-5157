-- ============================================================================
-- Admin Users management — SUPER_ADMIN-only writes, audit log, RLS lockdown.
--
-- Companion to scripts/secure-auth-helpers-repatch-2026-05-24.sql (which
-- introduced is_admin_user() as a positive admin_users check). That gives
-- every active admin_users row equal RLS power across 80+ policies.
--
-- This script adds the next layer:
--   - Only SUPER_ADMIN can INSERT/UPDATE/DELETE in admin_users
--     (so a regular ADMIN cannot self-promote via PostgREST)
--   - All admin lifecycle changes (invite/deactivate/role-change/hard-delete)
--     write to admin_audit_log via log_admin_audit() (SECURITY DEFINER)
--   - admin_audit_log is readable by any admin, writeable only via the function
--
-- Pre-flight aborts if no active SUPER_ADMIN exists (otherwise nobody could
-- manage admins after locking down the table).
--
-- Run in Supabase SQL Editor. Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Pre-flight — at least one active SUPER_ADMIN must exist + matched in auth
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  super_count integer;
  super_matched integer;
BEGIN
  SELECT count(*) INTO super_count
  FROM public.admin_users
  WHERE role = 'SUPER_ADMIN'
    AND coalesce(is_active, true) = true;

  IF super_count = 0 THEN
    RAISE EXCEPTION
      'Refusing to lock down admin_users writes: no active SUPER_ADMIN row in admin_users. '
      'Promote at least one row first (UPDATE public.admin_users SET role = ''SUPER_ADMIN'', is_active = true WHERE lower(email) = lower(''you@example.com'')), then re-run.';
  END IF;

  SELECT count(*) INTO super_matched
  FROM public.admin_users a
  JOIN auth.users u ON lower(u.email) = lower(a.email)
  WHERE a.role = 'SUPER_ADMIN'
    AND coalesce(a.is_active, true) = true;

  IF super_matched = 0 THEN
    RAISE EXCEPTION
      'Refusing to lock down admin_users writes: no SUPER_ADMIN admin_users row matches an auth.users row. '
      'Create the Supabase Auth user(s) for those emails, then re-run.';
  END IF;

  RAISE NOTICE 'Pre-flight OK: % active SUPER_ADMIN row(s), % matched to auth.users.', super_count, super_matched;
END $$;

-- ---------------------------------------------------------------------------
-- 1. is_super_admin() — positive check, SUPER_ADMIN only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin()
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
        AND a.role = 'SUPER_ADMIN'
        AND coalesce(a.is_active, true) = true
    );
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. admin_audit_log table — who did what, when, with before/after snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  actor_auth_id uuid,
  actor_email text NOT NULL,
  action text NOT NULL,                 -- 'invite' | 'update' | 'deactivate' | 'reactivate' | 'role_change' | 'hard_delete'
  target_email text NOT NULL,
  target_admin_user_id uuid,
  before jsonb,
  after jsonb,
  reason text,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_target_email_idx
  ON public.admin_audit_log (lower(target_email));
CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx
  ON public.admin_audit_log (created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. log_admin_audit() — SECURITY DEFINER writer. Only callable by admins.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_admin_audit(
  p_action text,
  p_target_email text,
  p_target_admin_user_id uuid,
  p_before jsonb,
  p_after jsonb,
  p_reason text DEFAULT NULL,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_email_v text;
  new_id uuid;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN ('invite', 'update', 'deactivate', 'reactivate', 'role_change', 'hard_delete') THEN
    RAISE EXCEPTION 'invalid action: %', p_action USING ERRCODE = '22023';
  END IF;

  actor_email_v := coalesce(nullif(auth.jwt() ->> 'email', ''), 'unknown');

  INSERT INTO public.admin_audit_log (
    actor_auth_id, actor_email, action,
    target_email, target_admin_user_id,
    before, after, reason, ip, user_agent
  )
  VALUES (
    auth.uid(), actor_email_v, p_action,
    lower(p_target_email), p_target_admin_user_id,
    p_before, p_after, p_reason, p_ip, p_user_agent
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_admin_audit(text, text, uuid, jsonb, jsonb, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_admin_audit(text, text, uuid, jsonb, jsonb, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.log_admin_audit(text, text, uuid, jsonb, jsonb, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. RLS — admin_audit_log: any admin can SELECT, no one INSERT/UPDATE/DELETE
--    via REST (function is the only writer).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS admin_audit_log_select ON public.admin_audit_log;
DROP POLICY IF EXISTS admin_audit_log_no_insert ON public.admin_audit_log;
DROP POLICY IF EXISTS admin_audit_log_no_update ON public.admin_audit_log;
DROP POLICY IF EXISTS admin_audit_log_no_delete ON public.admin_audit_log;

CREATE POLICY admin_audit_log_select
  ON public.admin_audit_log
  FOR SELECT
  TO authenticated
  USING (public.is_admin_user());

-- Intentionally no INSERT/UPDATE/DELETE policies → all blocked by RLS.
-- log_admin_audit() is SECURITY DEFINER so it bypasses these.

-- ---------------------------------------------------------------------------
-- 5. Tighten RLS on admin_users — SELECT for admins; mutations SUPER_ADMIN only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS admin_users_admin_select ON public.admin_users;
DROP POLICY IF EXISTS admin_users_admin_insert ON public.admin_users;
DROP POLICY IF EXISTS admin_users_admin_update ON public.admin_users;
DROP POLICY IF EXISTS admin_users_admin_delete ON public.admin_users;
DROP POLICY IF EXISTS admin_users_super_admin_insert ON public.admin_users;
DROP POLICY IF EXISTS admin_users_super_admin_update ON public.admin_users;
DROP POLICY IF EXISTS admin_users_super_admin_delete ON public.admin_users;

CREATE POLICY admin_users_admin_select
  ON public.admin_users
  FOR SELECT
  TO authenticated
  USING (public.is_admin_user());

CREATE POLICY admin_users_super_admin_insert
  ON public.admin_users
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY admin_users_super_admin_update
  ON public.admin_users
  FOR UPDATE
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY admin_users_super_admin_delete
  ON public.admin_users
  FOR DELETE
  TO authenticated
  USING (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- 6. Verification — fail loudly if anything didn't land
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  has_super_fn boolean;
  has_log_fn boolean;
  has_audit_tbl boolean;
  audit_rls boolean;
  audit_select_pol boolean;
  audit_insert_pol boolean;
  admin_super_insert boolean;
  admin_super_update boolean;
  admin_super_delete boolean;
  unauth_super boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_super_admin'
  ) INTO has_super_fn;
  IF NOT has_super_fn THEN RAISE EXCEPTION 'is_super_admin() missing'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'log_admin_audit'
  ) INTO has_log_fn;
  IF NOT has_log_fn THEN RAISE EXCEPTION 'log_admin_audit() missing'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'admin_audit_log'
  ) INTO has_audit_tbl;
  IF NOT has_audit_tbl THEN RAISE EXCEPTION 'admin_audit_log table missing'; END IF;

  SELECT c.relrowsecurity INTO audit_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'admin_audit_log';
  IF NOT coalesce(audit_rls, false) THEN RAISE EXCEPTION 'admin_audit_log RLS not enabled'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'admin_audit_log'
      AND policyname = 'admin_audit_log_select'
  ) INTO audit_select_pol;
  IF NOT audit_select_pol THEN RAISE EXCEPTION 'admin_audit_log_select policy missing'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'admin_audit_log'
      AND cmd = 'INSERT'
  ) INTO audit_insert_pol;
  IF audit_insert_pol THEN
    RAISE EXCEPTION 'admin_audit_log must NOT have an INSERT policy (function-only writer)';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'admin_users'
      AND policyname = 'admin_users_super_admin_insert'
  ) INTO admin_super_insert;
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'admin_users'
      AND policyname = 'admin_users_super_admin_update'
  ) INTO admin_super_update;
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'admin_users'
      AND policyname = 'admin_users_super_admin_delete'
  ) INTO admin_super_delete;

  IF NOT (admin_super_insert AND admin_super_update AND admin_super_delete) THEN
    RAISE EXCEPTION 'admin_users SUPER_ADMIN INSERT/UPDATE/DELETE policies missing';
  END IF;

  -- Postgres role / no JWT must NOT be super admin
  SELECT public.is_super_admin() INTO unauth_super;
  IF unauth_super THEN
    RAISE EXCEPTION 'is_super_admin() returned TRUE for unauthenticated session (must be FALSE)';
  END IF;

  RAISE NOTICE 'OK: is_super_admin() installed, admin_audit_log + log_admin_audit() ready, admin_users writes locked to SUPER_ADMIN.';
END $$;
