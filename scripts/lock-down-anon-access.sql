-- HOTFIX: Anon key in client JS is expected — tables must NOT be readable without RLS + grants.
-- Run in Supabase SQL Editor when scanners report "anon key grants access to 22+ tables".
-- Safe to re-run.
--
-- === RUN SCRIPTS IN THIS ORDER (skip any already applied) ===
--  1. scripts/secure-customers-rls.sql
--  2. scripts/secure-technicians-rls.sql
--  3. scripts/secure-jobs-rls.sql          (or secure-all-rls.sql which includes jobs)
--  4. scripts/secure-all-rls.sql           (main table policies)
--  5. scripts/secure-financial-rls.sql     (if separate)
--  6. scripts/secure-rpc-grants.sql      (revoke anon on internal RPCs)
--  7. scripts/patch-legacy-anon-policies.sql
--  8. scripts/lock-down-anon-access.sql    (this file — defense in depth)
--  9. scripts/add-auth-login-attempts.sql  (login lockout table)
-- 10. scripts/migrate-auth-login-escalating-lockout.sql (if lockout already exists)
-- 11. scripts/verify-all-rls.sql          (review output — should be empty / minimal)
--
-- App requirements: admin + technician login via Supabase Auth; booking via RPCs only.

-- Helpers (idempotent)
CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role',
    'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.auth_user_role() IS DISTINCT FROM 'technician';
$$;

-- ---------------------------------------------------------------------------
-- 1) Enable RLS on every public table (no exceptions)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

-- Login lockout: service role only (no anon/authenticated policies)
ALTER TABLE IF EXISTS public.auth_login_attempts ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2) Revoke blanket anon GRANTs on all public tables
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', r.tablename);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Re-allow only public ID-card columns on technicians (RLS policy still required)
-- ---------------------------------------------------------------------------
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

-- Ensure ID-card policy exists
DROP POLICY IF EXISTS technicians_public_id_card ON public.technicians;
CREATE POLICY technicians_public_id_card
  ON public.technicians FOR SELECT TO anon
  USING (account_status = 'ACTIVE');

-- ---------------------------------------------------------------------------
-- 4) Drop anon RLS policies except technicians_public_id_card
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND roles::text ILIKE '%anon%'
      AND NOT (
        tablename = 'technicians'
        AND policyname IN ('technicians_public_id_card')
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5) Drop known legacy wide-open policy names (all roles)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        policyname LIKE 'allow_all_%'
        OR policyname LIKE 'Allow %'
        OR policyname LIKE 'Allow anon%'
        OR policyname LIKE 'Allow public%'
        OR policyname LIKE 'Allow authenticated%'
        OR policyname LIKE 'todos_%_anon'
        OR policyname = 'allow_all_technicians'
        OR policyname = 'allow_all_jobs'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 6) Revoke anon execute on sensitive RPCs (booking RPCs keep grants from other scripts)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  fn text;
  block_list text[] := ARRAY[
    'generate_customer_id()',
    'get_distinct_completed_customer_ids()',
    'get_last_completed_job_per_customer()',
    'get_last_contact_per_customer()',
    'get_next_invoice_number()',
    'get_technician_payment_summary()',
    'backfill_technician_payments()',
    'get_all_banner_messages()',
    'get_banner_messages()',
    'get_technician_banner_messages(uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY block_list
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon', fn);
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_distinct_completed_customer_ids',
        'get_last_completed_job_per_customer',
        'get_last_contact_per_customer',
        'get_next_invoice_number',
        'get_technician_payment_summary',
        'backfill_technician_payments',
        'get_all_banner_messages',
        'get_banner_messages',
        'get_technician_banner_messages',
        'generate_customer_id'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $$;

-- Anon may only call booking / login-routing RPCs (re-grant idempotently)
GRANT EXECUTE ON FUNCTION public.is_technician_email(text) TO anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_customer_by_phone_for_booking') THEN
    GRANT EXECUTE ON FUNCTION public.get_customer_by_phone_for_booking(text) TO anon, authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_customer_for_booking') THEN
    GRANT EXECUTE ON FUNCTION public.create_customer_for_booking(jsonb) TO anon, authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_customer_for_booking') THEN
    GRANT EXECUTE ON FUNCTION public.update_customer_for_booking(uuid, text, jsonb) TO anon, authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_job_for_booking') THEN
    GRANT EXECUTE ON FUNCTION public.create_job_for_booking(text, jsonb) TO anon, authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'upsert_website_booking_intent') THEN
    GRANT EXECUTE ON FUNCTION public.upsert_website_booking_intent(text, text, text, smallint, text) TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'mark_website_booking_intent_booked') THEN
    GRANT EXECUTE ON FUNCTION public.mark_website_booking_intent_booked(text, text, text) TO anon;
  END IF;
END $$;
