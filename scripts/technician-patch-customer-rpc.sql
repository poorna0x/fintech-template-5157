-- Technician-safe customer updates: whitelisted fields only + active job check.
-- Run in Supabase SQL Editor after patch-technician-customer-access.sql. Safe to re-run.

DROP FUNCTION IF EXISTS public.technician_append_customer_change_request(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.technician_patch_customer(uuid, uuid, text, text, text, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.technician_patch_customer(
  p_customer_id uuid,
  p_job_id uuid,
  p_full_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_alternate_phone text DEFAULT NULL,
  p_visible_address text DEFAULT NULL,
  p_address jsonb DEFAULT NULL,
  p_location jsonb DEFAULT NULL
)
RETURNS public.customers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.customers;
  v_lat double precision;
  v_lng double precision;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF public.is_admin_user() THEN
    RAISE EXCEPTION 'Use admin customer update';
  END IF;

  IF NOT public.is_technician_assigned_to_customer(p_customer_id) THEN
    RAISE EXCEPTION 'Not assigned to this customer';
  END IF;

  IF p_job_id IS NULL THEN
    RAISE EXCEPTION 'Job id is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.jobs j
    WHERE j.id = p_job_id
      AND j.customer_id = p_customer_id
      AND (
        j.assigned_technician_id = auth.uid()
        OR j.completed_by = auth.uid()
        OR (
          j.team_members IS NOT NULL
          AND j.team_members @> jsonb_build_array(auth.uid()::text)
        )
      )
      AND j.status IN ('ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS')
  ) THEN
    RAISE EXCEPTION 'Active job not found or not assigned to you';
  END IF;

  IF p_full_name IS NOT NULL AND length(trim(p_full_name)) > 120 THEN
    RAISE EXCEPTION 'Name too long';
  END IF;

  IF p_location IS NOT NULL THEN
    v_lat := NULLIF(trim(p_location->>'latitude'), '')::double precision;
    v_lng := NULLIF(trim(p_location->>'longitude'), '')::double precision;
    IF v_lat IS NULL OR v_lng IS NULL
      OR v_lat < -90 OR v_lat > 90
      OR v_lng < -180 OR v_lng > 180
      OR (v_lat = 0 AND v_lng = 0) THEN
      RAISE EXCEPTION 'Invalid map coordinates';
    END IF;
  END IF;

  IF p_visible_address IS NOT NULL AND length(trim(p_visible_address)) > 40 THEN
    RAISE EXCEPTION 'Area label too long';
  END IF;

  UPDATE public.customers c
  SET
    full_name = CASE
      WHEN p_full_name IS NOT NULL THEN NULLIF(trim(p_full_name), '')
      ELSE c.full_name
    END,
    email = CASE WHEN p_email IS NOT NULL THEN NULLIF(trim(p_email), '') ELSE c.email END,
    alternate_phone = CASE
      WHEN p_alternate_phone IS NOT NULL THEN NULLIF(trim(p_alternate_phone), '')
      ELSE c.alternate_phone
    END,
    visible_address = CASE
      WHEN p_visible_address IS NOT NULL THEN NULLIF(trim(p_visible_address), '')
      ELSE c.visible_address
    END,
    address = COALESCE(p_address, c.address),
    location = COALESCE(p_location, c.location),
    updated_at = now()
  WHERE c.id = p_customer_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.technician_patch_customer(uuid, uuid, text, text, text, text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.technician_patch_customer(uuid, uuid, text, text, text, text, jsonb, jsonb) TO authenticated;
