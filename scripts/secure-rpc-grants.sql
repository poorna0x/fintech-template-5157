-- HIGH: Lock down RPCs callable by anon (e.g. generate_customer_id revealing C1168-style counts).
-- Run in Supabase SQL Editor after secure-customers-rls.sql. Safe to re-run.
--
-- Public booking keeps only: get/create/update_customer_for_booking, create_job_for_booking,
-- upsert_website_booking_intent, mark_website_booking_intent_booked, is_technician_email.

-- Requires is_admin_user from secure-customers-rls.sql
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
-- customer_id generation: DB/triggers only — NOT callable via PostgREST anon
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_customer_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_id integer;
  customer_id text;
BEGIN
  SELECT coalesce(max(cast(substring(c.customer_id from 2) as integer)), 0) + 1
  INTO next_id
  FROM public.customers c
  WHERE c.customer_id ~ '^C[0-9]+$';

  customer_id := 'C' || lpad(next_id::text, 4, '0');
  RETURN customer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_customer_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new.customer_id IS NULL OR new.customer_id = '' THEN
    new.customer_id := public.generate_customer_id();
  END IF;
  RETURN new;
END;
$$;

-- Remove REST API access (anon was leaking next id e.g. C1168)
REVOKE ALL ON FUNCTION public.generate_customer_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_customer_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_customer_id() FROM authenticated;

-- Booking RPC: assign customer_id inside definer (no anon RPC needed)
CREATE OR REPLACE FUNCTION public.create_customer_for_booking(p_row jsonb)
RETURNS public.customers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  norm text;
  inserted public.customers;
BEGIN
  norm := public.normalize_indian_phone(p_row ->> 'phone');

  IF EXISTS (
    SELECT 1 FROM public.customers c
    WHERE right(regexp_replace(c.phone, '\D', '', 'g'), 10) = norm
  ) THEN
    RAISE EXCEPTION 'customer already exists for phone';
  END IF;

  INSERT INTO public.customers (
    customer_id,
    full_name, phone, alternate_phone, email, address, location,
    service_type, brand, model, status, customer_since,
    preferred_time_slot, custom_time, preferred_language,
    visible_address, has_prefilter, raw_water_tds, photos
  )
  VALUES (
    public.generate_customer_id(),
    p_row ->> 'full_name',
    coalesce(p_row ->> 'phone', norm),
    nullif(p_row ->> 'alternate_phone', ''),
    coalesce(p_row ->> 'email', ''),
    coalesce(p_row -> 'address', '{}'::jsonb),
    coalesce(p_row -> 'location', '{}'::jsonb),
    p_row ->> 'service_type',
    coalesce(p_row ->> 'brand', 'Not specified'),
    coalesce(p_row ->> 'model', 'Not specified'),
    coalesce(p_row ->> 'status', 'ACTIVE'),
    coalesce((p_row ->> 'customer_since')::timestamptz, now()),
    nullif(p_row ->> 'preferred_time_slot', ''),
    nullif(p_row ->> 'custom_time', ''),
    coalesce(p_row ->> 'preferred_language', 'ENGLISH'),
    nullif(p_row ->> 'visible_address', ''),
    (p_row ->> 'has_prefilter')::boolean,
    (p_row ->> 'raw_water_tds')::integer,
    coalesce(p_row -> 'photos', '[]'::jsonb)
  )
  RETURNING * INTO inserted;

  RETURN inserted;
END;
$$;

-- ---------------------------------------------------------------------------
-- Revoke anon from internal / admin RPCs (keep booking RPCs granted in other scripts)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  fn text;
  anon_only text[] := ARRAY[
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
  FOREACH fn IN ARRAY anon_only
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon', fn);
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;
  END LOOP;
END $$;

-- Admin-only RPCs: authenticated admins only (not technicians, not anon)
DO $$
DECLARE
  r record;
BEGIN
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
        'get_technician_banner_messages'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $$;
