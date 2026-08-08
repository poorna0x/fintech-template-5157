-- WhatsApp booking bot: secondary site + alternate_* on update_customer_for_booking,
-- and jobs.service_site on create_job_for_booking.
-- Run with service-role / SQL editor after deploy. Idempotent CREATE OR REPLACE.

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
  PERFORM public.assert_booking_rpc_service_role();

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
    visible_address = CASE
      WHEN p_updates ? 'visible_address' THEN nullif(btrim(p_updates ->> 'visible_address'), '')
      ELSE c.visible_address
    END,
    alternate_address = CASE
      WHEN p_updates ? 'alternate_address' THEN p_updates -> 'alternate_address'
      ELSE c.alternate_address
    END,
    alternate_location = CASE
      WHEN p_updates ? 'alternate_location' THEN p_updates -> 'alternate_location'
      ELSE c.alternate_location
    END,
    alternate_visible_address = CASE
      WHEN p_updates ? 'alternate_visible_address' THEN nullif(btrim(p_updates ->> 'alternate_visible_address'), '')
      ELSE c.alternate_visible_address
    END,
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
    AND (
      right(regexp_replace(c.phone, '\D', '', 'g'), 10) = norm
      OR right(regexp_replace(coalesce(c.alternate_phone, ''), '\D', '', 'g'), 10) = norm
    )
  RETURNING * INTO updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'customer not found or phone mismatch';
  END IF;

  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_job_for_booking(p_phone text, p_row jsonb)
RETURNS public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  norm text;
  cust_id uuid;
  inserted public.jobs;
  site text;
BEGIN
  PERFORM public.assert_booking_rpc_service_role();

  norm := public.normalize_indian_phone(p_phone);
  cust_id := (p_row ->> 'customer_id')::uuid;
  IF cust_id IS NULL THEN
    RAISE EXCEPTION 'customer_id required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = cust_id
      AND (
        right(regexp_replace(c.phone, '\D', '', 'g'), 10) = norm
        OR right(regexp_replace(coalesce(c.alternate_phone, ''), '\D', '', 'g'), 10) = norm
      )
  ) THEN
    RAISE EXCEPTION 'customer not found or phone mismatch';
  END IF;
  IF coalesce(p_row ->> 'job_number', '') = '' THEN
    RAISE EXCEPTION 'job_number required';
  END IF;

  site := lower(coalesce(nullif(btrim(p_row ->> 'service_site'), ''), 'primary'));
  IF site IS DISTINCT FROM 'secondary' THEN
    site := 'primary';
  END IF;

  INSERT INTO public.jobs (
    job_number, customer_id, service_type, service_sub_type, brand, model,
    scheduled_date, scheduled_time_slot, estimated_duration,
    service_address, service_location, service_site, status, priority, description,
    requirements, estimated_cost, payment_status, before_photos, images
  ) VALUES (
    p_row ->> 'job_number', cust_id,
    p_row ->> 'service_type', p_row ->> 'service_sub_type',
    coalesce(p_row ->> 'brand', 'Not specified'), coalesce(p_row ->> 'model', 'Not specified'),
    (p_row ->> 'scheduled_date')::date, p_row ->> 'scheduled_time_slot',
    coalesce((p_row ->> 'estimated_duration')::integer, 120),
    coalesce(p_row -> 'service_address', '{}'::jsonb),
    coalesce(p_row -> 'service_location', '{}'::jsonb),
    site,
    'PENDING', coalesce(p_row ->> 'priority', 'MEDIUM'),
    coalesce(p_row ->> 'description', ''),
    coalesce(p_row -> 'requirements', '[]'::jsonb),
    coalesce((p_row ->> 'estimated_cost')::numeric, 0),
    coalesce(p_row ->> 'payment_status', 'PENDING'),
    coalesce(p_row -> 'before_photos', '[]'::jsonb),
    coalesce(p_row -> 'images', coalesce(p_row -> 'before_photos', '[]'::jsonb))
  ) RETURNING * INTO inserted;
  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.update_customer_for_booking(uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_customer_for_booking(uuid, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_customer_for_booking(uuid, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_customer_for_booking(uuid, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.create_job_for_booking(text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_job_for_booking(text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_job_for_booking(text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_job_for_booking(text, jsonb) TO service_role;
