-- ============================================================
-- AI Read-Only Query Tool
-- Safe, restricted SQL execution for the CRM AI assistant.
--
-- Run in Supabase SQL Editor (service role).
-- Safe to re-run (idempotent).
-- ============================================================

-- 1. Create a restricted role that can only SELECT on safe tables.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_readonly') THEN
    CREATE ROLE ai_readonly NOLOGIN NOSUPERUSER NOINHERIT NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

-- 2. Revoke everything first, then grant only SELECT on allowed tables.
--    Never grant access to: auth.*, app_secrets, admin_users, technician_push_tokens,
--    admin_push_tokens, document_pdf_authenticity, whatsapp_crm_settings.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ai_readonly;

GRANT SELECT ON
  public.customers,
  public.jobs,
  public.reminders,
  public.payments,
  public.technicians,
  public.expenses,
  public.amc_contracts,
  public.documents,
  public.whatsapp_messages,
  public.booking_slots
TO ai_readonly;

-- Also grant SELECT on sequences/views needed by those tables (none needed for reads).

-- 3. The safe query executor function.
--    Runs the caller-supplied SQL inside a read-only transaction
--    as the restricted ai_readonly role.
--    Returns up to 200 rows as JSONB array.
--    Hard statement timeout: 4 seconds.
--    Only SELECT statements allowed (checked before execution).

CREATE OR REPLACE FUNCTION public.ai_readonly_query(
  p_sql text,
  p_max_rows integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '4s'
AS $$
DECLARE
  v_result jsonb;
  v_clean  text;
  v_rows   integer;
BEGIN
  -- Strip whitespace/comments for the safety check
  v_clean := trim(regexp_replace(p_sql, '--[^\n]*', '', 'g'));
  v_clean := trim(regexp_replace(v_clean, '/\*.*?\*/', '', 'gs'));
  v_clean := upper(v_clean);

  -- Block anything that isn't a plain SELECT
  IF v_clean NOT LIKE 'SELECT%' THEN
    RAISE EXCEPTION 'ai_readonly_query: only SELECT statements are allowed';
  END IF;

  -- Block dangerous keywords even inside SELECT
  IF v_clean ~ '\m(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|EXECUTE|COPY|SET\s+ROLE|SET\s+SESSION|PERFORM|DO\b|CALL|EXPLAIN\s+ANALYZE)\M' THEN
    RAISE EXCEPTION 'ai_readonly_query: statement contains disallowed keyword';
  END IF;

  -- Block access to sensitive schemas / tables
  IF v_clean ~ '\m(AUTH|APP_SECRETS|ADMIN_USERS|TECHNICIAN_PUSH_TOKENS|ADMIN_PUSH_TOKENS|DOCUMENT_PDF_AUTHENTICITY|WHATSAPP_CRM_SETTINGS|PG_CATALOG|INFORMATION_SCHEMA)\M' THEN
    RAISE EXCEPTION 'ai_readonly_query: access to that table or schema is not permitted';
  END IF;

  -- Enforce row cap by wrapping in a subquery
  v_rows := LEAST(COALESCE(p_max_rows, 200), 200);

  -- Execute in a read-only subtransaction as the restricted role
  BEGIN
    SET LOCAL ROLE ai_readonly;
    SET LOCAL transaction_read_only = on;

    EXECUTE format(
      'SELECT COALESCE(jsonb_agg(r), ''[]''::jsonb) FROM (SELECT * FROM (%s) sub LIMIT %s) r',
      p_sql,
      v_rows
    ) INTO v_result;

    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    RAISE;
  END;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- 4. Only service_role (server-side Netlify functions) can call this.
--    Revoke from anon and authenticated so it is never callable from the browser.
REVOKE ALL ON FUNCTION public.ai_readonly_query(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_readonly_query(text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.ai_readonly_query(text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ai_readonly_query(text, integer) TO service_role;

-- 5. Nearby customers helper (used by location search tool).
--    Returns customers within radius_km kilometres of a point.
--    Uses the Haversine approximation (fast, no PostGIS needed).
CREATE OR REPLACE FUNCTION public.ai_customers_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision DEFAULT 5.0,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  customer_id text,
  full_name text,
  phone text,
  service_type text,
  latitude double precision,
  longitude double precision,
  distance_km double precision
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    c.id,
    c.customer_id,
    c.full_name,
    c.phone,
    c.service_type,
    c.latitude::double precision,
    c.longitude::double precision,
    -- Haversine distance in km
    6371.0 * 2 * asin(sqrt(
      power(sin(radians((c.latitude::double precision - p_lat) / 2)), 2) +
      cos(radians(p_lat)) * cos(radians(c.latitude::double precision)) *
      power(sin(radians((c.longitude::double precision - p_lng) / 2)), 2)
    )) AS distance_km
  FROM public.customers c
  WHERE
    c.latitude IS NOT NULL
    AND c.longitude IS NOT NULL
    AND c.latitude::double precision != 0
    AND c.longitude::double precision != 0
    -- Rough bounding-box filter first (cheap), then exact Haversine
    AND c.latitude::double precision BETWEEN p_lat - (p_radius_km / 111.0) AND p_lat + (p_radius_km / 111.0)
    AND c.longitude::double precision BETWEEN p_lng - (p_radius_km / (111.0 * cos(radians(p_lat)))) AND p_lng + (p_radius_km / (111.0 * cos(radians(p_lat))))
    AND 6371.0 * 2 * asin(sqrt(
      power(sin(radians((c.latitude::double precision - p_lat) / 2)), 2) +
      cos(radians(p_lat)) * cos(radians(c.latitude::double precision)) *
      power(sin(radians((c.longitude::double precision - p_lng) / 2)), 2)
    )) <= p_radius_km
  ORDER BY distance_km ASC
  LIMIT LEAST(COALESCE(p_limit, 20), 50);
$$;

-- Only service_role can call this
REVOKE ALL ON FUNCTION public.ai_customers_nearby(double precision, double precision, double precision, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_customers_nearby(double precision, double precision, double precision, integer) FROM anon;
REVOKE ALL ON FUNCTION public.ai_customers_nearby(double precision, double precision, double precision, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ai_customers_nearby(double precision, double precision, double precision, integer) TO service_role;

-- Done. Run this in Supabase SQL Editor, then deploy the Netlify functions.
-- Tables granted: customers, jobs, reminders, payments, technicians,
--                 expenses, amc_contracts, documents, whatsapp_messages, booking_slots
-- Blocked: auth.*, app_secrets, admin_users, push token tables, pdf authenticity, wa settings
