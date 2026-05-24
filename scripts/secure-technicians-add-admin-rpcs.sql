-- ============================================================================
-- Half A (PRE-DEPLOY): Add admin-only SECURITY DEFINER RPCs for technicians.
--
-- This script is purely additive — it does NOT drop any column, revoke any
-- grant, or change RLS. Safe to run while the OLD app version is still live
-- (the old app keeps using direct SELECT and ignores these new RPCs).
--
-- Pairs with:
--   scripts/secure-technicians-drop-password-and-restrict-salary.sql (Half B,
--   run AFTER the new app build is deployed).
--
-- Idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Admin-only RPC: full row including salary + current_location.
-- Returns SETOF public.technicians, so callers in the app can keep treating
-- the result as a normal technicians row (no shape change in TypeScript).
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
-- Sanity verification: confirm both functions exist and are wired correctly.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  missing_rpcs text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_technicians_for_admin'
  ) THEN
    missing_rpcs := array_append(missing_rpcs, 'get_technicians_for_admin');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_technician_for_admin'
  ) THEN
    missing_rpcs := array_append(missing_rpcs, 'get_technician_for_admin');
  END IF;

  IF array_length(missing_rpcs, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'RPC creation failed: %', array_to_string(missing_rpcs, ', ');
  END IF;

  RAISE NOTICE 'OK: admin RPCs created. Safe to deploy new app build, then run Half B.';
END $$;
