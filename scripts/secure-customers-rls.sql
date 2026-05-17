-- CRITICAL: Lock down public.customers PII (mass exfiltration via anon REST API).
-- Run once in Supabase SQL Editor. Safe to re-run.
--
-- BEFORE running:
--   1. Deploy app (booking RPCs + loginTechnician migration flow).
--   2. Set SUPABASE_SERVICE_ROLE_KEY on Netlify (provision-technician-auth-on-login).
--   3. Have each technician log in once (auto-creates Auth user) OR run provision-technician-auth-users.mjs.
--   4. Confirm Authentication → Users lists technicians, then run this script.
--
-- AFTER running: anon can no longer SELECT/UPDATE/DELETE customers directly.
-- Public booking uses SECURITY DEFINER RPCs below.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_indian_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits text;
BEGIN
  digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  IF length(digits) >= 12 AND left(digits, 2) = '91' THEN
    digits := substring(digits from 3);
  END IF;
  digits := ltrim(digits, '0');
  IF length(digits) > 10 THEN
    digits := right(digits, 10);
  END IF;
  IF length(digits) <> 10 THEN
    RAISE EXCEPTION 'invalid phone';
  END IF;
  IF digits !~ '^[6-9][0-9]{9}$' THEN
    RAISE EXCEPTION 'invalid phone';
  END IF;
  RETURN digits;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.is_technician_assigned_to_customer(p_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.jobs j
    WHERE j.customer_id = p_customer_id
      AND (
        j.assigned_technician_id = auth.uid()
        OR j.team_members @> jsonb_build_array(auth.uid()::text)
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Drop permissive policies (anon + open SELECT/UPDATE)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS customers_select ON public.customers;
DROP POLICY IF EXISTS customers_update ON public.customers;
DROP POLICY IF EXISTS "Allow anonymous to insert customers" ON public.customers;
DROP POLICY IF EXISTS "Allow authenticated users to delete customers" ON public.customers;

-- ---------------------------------------------------------------------------
-- Authenticated: admin full access; technician only assigned customers
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS customers_select_authenticated ON public.customers;
DROP POLICY IF EXISTS customers_insert_admin ON public.customers;
DROP POLICY IF EXISTS customers_update_authenticated ON public.customers;
DROP POLICY IF EXISTS customers_delete_admin ON public.customers;

CREATE POLICY customers_select_authenticated
  ON public.customers
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin_user()
    OR public.is_technician_assigned_to_customer(id)
  );

CREATE POLICY customers_insert_admin
  ON public.customers
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_user());

CREATE POLICY customers_update_authenticated
  ON public.customers
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin_user()
    OR public.is_technician_assigned_to_customer(id)
  )
  WITH CHECK (
    public.is_admin_user()
    OR public.is_technician_assigned_to_customer(id)
  );

CREATE POLICY customers_delete_admin
  ON public.customers
  FOR DELETE
  TO authenticated
  USING (public.is_admin_user());

-- Ensure RLS is on (no-op if already enabled)
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Public website booking (anon): phone-scoped RPCs only — no table access
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_customer_by_phone_for_booking(p_phone text)
RETURNS SETOF public.customers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  norm text;
BEGIN
  norm := public.normalize_indian_phone(p_phone);
  RETURN QUERY
  SELECT c.*
  FROM public.customers c
  WHERE right(regexp_replace(c.phone, '\D', '', 'g'), 10) = norm
     OR right(regexp_replace(coalesce(c.alternate_phone, ''), '\D', '', 'g'), 10) = norm
  LIMIT 1;
END;
$$;

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
    full_name, phone, alternate_phone, email, address, location,
    service_type, brand, model, status, customer_since,
    preferred_time_slot, custom_time, preferred_language,
    visible_address, has_prefilter, raw_water_tds, photos
  )
  VALUES (
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

CREATE OR REPLACE FUNCTION public.update_customer_for_booking(
  p_customer_id uuid,
  p_phone text,
  p_updates jsonb
)
RETURNS public.customers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  norm text;
  updated public.customers;
BEGIN
  norm := public.normalize_indian_phone(p_phone);

  UPDATE public.customers c
  SET
    full_name = coalesce(p_updates ->> 'full_name', c.full_name),
    email = coalesce(nullif(p_updates ->> 'email', ''), c.email),
    alternate_phone = CASE
      WHEN p_updates ? 'alternate_phone' THEN nullif(p_updates ->> 'alternate_phone', '')
      ELSE c.alternate_phone
    END,
    address = CASE WHEN p_updates ? 'address' THEN p_updates -> 'address' ELSE c.address END,
    location = CASE WHEN p_updates ? 'location' THEN p_updates -> 'location' ELSE c.location END,
    preferred_time_slot = CASE
      WHEN p_updates ? 'preferred_time_slot' THEN nullif(p_updates ->> 'preferred_time_slot', '')
      ELSE c.preferred_time_slot
    END,
    custom_time = CASE
      WHEN p_updates ? 'custom_time' THEN nullif(p_updates ->> 'custom_time', '')
      ELSE c.custom_time
    END,
    updated_at = coalesce((p_updates ->> 'updated_at')::timestamptz, now())
  WHERE c.id = p_customer_id
    AND right(regexp_replace(c.phone, '\D', '', 'g'), 10) = norm
  RETURNING * INTO updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'customer not found or phone mismatch';
  END IF;

  RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_by_phone_for_booking(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_customer_for_booking(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_customer_for_booking(uuid, text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_customer_by_phone_for_booking(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_for_booking(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_customer_for_booking(uuid, text, jsonb) TO anon, authenticated;
