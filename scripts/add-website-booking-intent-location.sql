-- Live booking banner: store location after the /book location step.
-- Safe to re-run. Service-role upsert only (same as current intent RPC).

ALTER TABLE public.website_booking_intent
  ADD COLUMN IF NOT EXISTS location_label text,
  ADD COLUMN IF NOT EXISTS location_maps_url text;

ALTER TABLE public.website_booking_intent
  DROP CONSTRAINT IF EXISTS website_booking_intent_location_label_len;
ALTER TABLE public.website_booking_intent
  ADD CONSTRAINT website_booking_intent_location_label_len
  CHECK (location_label IS NULL OR char_length(location_label) <= 160);

ALTER TABLE public.website_booking_intent
  DROP CONSTRAINT IF EXISTS website_booking_intent_location_maps_url_len;
ALTER TABLE public.website_booking_intent
  ADD CONSTRAINT website_booking_intent_location_maps_url_len
  CHECK (location_maps_url IS NULL OR char_length(location_maps_url) <= 500);

ALTER TABLE public.website_booking_intent_archive
  ADD COLUMN IF NOT EXISTS location_label text,
  ADD COLUMN IF NOT EXISTS location_maps_url text;

DROP FUNCTION IF EXISTS public.upsert_website_booking_intent(text, text, text, smallint, text, text, boolean);

CREATE OR REPLACE FUNCTION public.upsert_website_booking_intent(
  p_full_name text,
  p_phone text,
  p_phone_normalized text,
  p_current_step smallint,
  p_site_key text DEFAULT 'hydrogenro',
  p_client_ip_hash text DEFAULT NULL,
  p_quarantined boolean DEFAULT false,
  p_location_label text DEFAULT NULL,
  p_location_maps_url text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text := nullif(btrim(coalesce(p_location_label, '')), '');
  v_maps text := nullif(btrim(coalesce(p_location_maps_url, '')), '');
BEGIN
  PERFORM public.assert_booking_intent_rpc_service_role();

  IF char_length(trim(p_full_name)) < 2 OR char_length(trim(p_full_name)) > 200 THEN
    RAISE EXCEPTION 'invalid name';
  END IF;
  IF char_length(p_phone_normalized) <> 10 THEN
    RAISE EXCEPTION 'invalid phone';
  END IF;
  IF p_current_step < 1 OR p_current_step > 5 THEN
    RAISE EXCEPTION 'invalid step';
  END IF;
  IF p_site_key IS NULL OR p_site_key NOT IN ('hydrogenro', 'elevenro') THEN
    RAISE EXCEPTION 'invalid site';
  END IF;
  IF v_label IS NOT NULL AND char_length(v_label) > 160 THEN
    v_label := left(v_label, 160);
  END IF;
  IF v_maps IS NOT NULL AND char_length(v_maps) > 500 THEN
    v_maps := left(v_maps, 500);
  END IF;

  INSERT INTO public.website_booking_intent (
    full_name,
    phone,
    phone_normalized,
    current_step,
    updated_at,
    dismissed_at,
    site_key,
    client_ip_hash,
    quarantined,
    location_label,
    location_maps_url
  )
  VALUES (
    trim(p_full_name),
    p_phone,
    p_phone_normalized,
    p_current_step,
    now(),
    NULL,
    p_site_key,
    nullif(trim(p_client_ip_hash), ''),
    coalesce(p_quarantined, false),
    v_label,
    v_maps
  )
  ON CONFLICT (phone_normalized, site_key) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    current_step = EXCLUDED.current_step,
    updated_at = now(),
    dismissed_at = NULL,
    client_ip_hash = coalesce(EXCLUDED.client_ip_hash, public.website_booking_intent.client_ip_hash),
    quarantined = public.website_booking_intent.quarantined OR EXCLUDED.quarantined,
    location_label = coalesce(EXCLUDED.location_label, public.website_booking_intent.location_label),
    location_maps_url = coalesce(EXCLUDED.location_maps_url, public.website_booking_intent.location_maps_url);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_website_booking_intent(text, text, text, smallint, text, text, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_website_booking_intent(text, text, text, smallint, text, text, boolean, text, text) TO service_role;
