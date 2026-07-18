-- Allow public /book customer updates to set short location (visible_address).
-- Shared backend for HydrogenRO + ElevenRO. Safe to re-run.

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

REVOKE ALL ON FUNCTION public.update_customer_for_booking(uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_customer_for_booking(uuid, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_customer_for_booking(uuid, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_customer_for_booking(uuid, text, jsonb) TO service_role;
