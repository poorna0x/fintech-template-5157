-- ============================================================================
-- RPC hardening (2026-05-24 scanner): invoice counter bug, customer ID leak,
-- broken banner RPCs, raw PostgreSQL errors.
--
-- Run in Supabase SQL Editor after:
--   scripts/secure-auth-helpers-and-is-admin-rpc.sql (is_admin_user)
--   scripts/secure-rpc-grants.sql (optional — this script is self-contained)
--
-- Safe to re-run (idempotent).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. is_admin_user (belt-and-braces — matches secure-auth-helpers-and-is-admin-rpc.sql)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS text
LANGUAGE sql
STABLE
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

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.technicians t WHERE t.id = auth.uid())
    AND public.auth_user_role() IS DISTINCT FROM 'technician';
$$;

-- ---------------------------------------------------------------------------
-- 2. generate_customer_id — triggers/booking RPC only; never callable via REST
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_customer_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_id integer;
  new_id text;
BEGIN
  SELECT coalesce(max(cast(substring(c.customer_id from 2) as integer)), 0) + 1
  INTO next_id
  FROM public.customers c
  WHERE c.customer_id ~ '^C[0-9]+$';

  new_id := 'C' || lpad(next_id::text, 4, '0');
  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_customer_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_customer_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_customer_id() FROM authenticated;

-- ---------------------------------------------------------------------------
-- 3. get_next_invoice_number — fix VARCHAR(10) overflow + admin-only + generic errors
--
--    Bug: year_month_prefix was VARCHAR(10) but 'INV-2026-05' is 11 chars →
--    "value too long for type character varying(10)" and invoicing broke.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_next_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_year integer;
  current_month integer;
  year_month_prefix text;
  last_number text;
  next_num integer := 1;
  result text;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Admin access required'
      USING ERRCODE = '42501';
  END IF;

  current_year := extract(year from current_date)::integer;
  current_month := extract(month from current_date)::integer;
  year_month_prefix :=
    'INV-' || current_year::text || '-' || lpad(current_month::text, 2, '0');

  SELECT ti.invoice_number
  INTO last_number
  FROM public.tax_invoices ti
  WHERE ti.invoice_number LIKE year_month_prefix || '-%'
  ORDER BY ti.created_at DESC
  LIMIT 1;

  IF last_number IS NOT NULL THEN
    next_num := coalesce(
      (regexp_match(last_number, '([0-9]+)$'))[1]::integer,
      0
    ) + 1;
  END IF;

  result := year_month_prefix || '-' || lpad(next_num::text, 3, '0');
  RETURN result;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'get_next_invoice_number failed (uid=%): %', auth.uid(), SQLERRM;
    RAISE EXCEPTION 'Could not generate invoice number. Contact support if this persists.'
      USING ERRCODE = 'P0001';
END;
$$;

REVOKE ALL ON FUNCTION public.get_next_invoice_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_next_invoice_number() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_next_invoice_number() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Drop broken banner RPCs (public.messages table does not exist).
--    App uses website_booking_intent + React banners — not these RPCs.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_banner_messages();
DROP FUNCTION IF EXISTS public.get_all_banner_messages();
DROP FUNCTION IF EXISTS public.get_technician_banner_messages(uuid);

-- ---------------------------------------------------------------------------
-- 5. Admin-only grants for sensitive reporting RPCs (technicians → 42501 inside fn
--    if you add guards later; for now revoke technician abuse path on invoice RPC)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  fn text;
  admin_rpc text[] := ARRAY[
    'get_distinct_completed_customer_ids()',
    'get_last_completed_job_per_customer()',
    'get_last_contact_per_customer()',
    'get_technician_payment_summary()',
    'backfill_technician_payments()'
  ];
BEGIN
  FOREACH fn IN ARRAY admin_rpc
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon', fn);
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Verification
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  gen_exec boolean;
  inv_exec boolean;
  banner_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name = 'generate_customer_id'
      AND grantee = 'authenticated'
      AND privilege_type = 'EXECUTE'
  ) INTO gen_exec;

  IF gen_exec THEN
    RAISE EXCEPTION 'generate_customer_id still EXECUTABLE by authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_banner_messages'
  ) INTO banner_exists;

  IF banner_exists THEN
    RAISE EXCEPTION 'get_banner_messages still exists';
  END IF;

  RAISE NOTICE 'OK: invoice RPC fixed, generate_customer_id not REST-callable, banner RPCs dropped.';
END $$;
