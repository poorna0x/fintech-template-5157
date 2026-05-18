-- Secure website_booking_intent RPCs: service_role only + quarantine support.
-- Run in Supabase SQL Editor after deploying /.netlify/functions/booking-intent
-- Safe to re-run.

ALTER TABLE public.website_booking_intent
  ADD COLUMN IF NOT EXISTS client_ip_hash text,
  ADD COLUMN IF NOT EXISTS quarantined boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_website_booking_intent_ip_recent
  ON public.website_booking_intent (client_ip_hash, updated_at DESC)
  WHERE client_ip_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assert_booking_intent_rpc_service_role()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_booking_intent_rpc_service_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_booking_intent_rpc_service_role() TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_website_booking_intent(
  p_full_name text,
  p_phone text,
  p_phone_normalized text,
  p_current_step smallint,
  p_site_key text DEFAULT 'hydrogenro',
  p_client_ip_hash text DEFAULT NULL,
  p_quarantined boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  INSERT INTO public.website_booking_intent (
    full_name,
    phone,
    phone_normalized,
    current_step,
    updated_at,
    dismissed_at,
    site_key,
    client_ip_hash,
    quarantined
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
    coalesce(p_quarantined, false)
  )
  ON CONFLICT (phone_normalized, site_key) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    current_step = EXCLUDED.current_step,
    updated_at = now(),
    dismissed_at = NULL,
    client_ip_hash = coalesce(EXCLUDED.client_ip_hash, public.website_booking_intent.client_ip_hash),
    quarantined = public.website_booking_intent.quarantined OR EXCLUDED.quarantined;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_website_booking_intent_booked(
  p_phone_normalized text,
  p_site_key text,
  p_job_number text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_booking_intent_rpc_service_role();

  IF char_length(p_phone_normalized) <> 10 THEN
    RAISE EXCEPTION 'invalid phone';
  END IF;
  IF p_site_key IS NULL OR p_site_key NOT IN ('hydrogenro', 'elevenro') THEN
    RAISE EXCEPTION 'invalid site';
  END IF;
  IF p_job_number IS NULL OR char_length(trim(p_job_number)) < 3 THEN
    RAISE EXCEPTION 'invalid job number';
  END IF;

  UPDATE public.website_booking_intent
  SET
    booked_at = now(),
    booked_job_number = trim(p_job_number),
    updated_at = now()
  WHERE phone_normalized = p_phone_normalized
    AND site_key = p_site_key;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_website_booking_intent(text, text, text, smallint, text, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_website_booking_intent(text, text, text, smallint, text, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.upsert_website_booking_intent(text, text, text, smallint, text, text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_website_booking_intent(text, text, text, smallint, text, text, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.mark_website_booking_intent_booked(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_website_booking_intent_booked(text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_website_booking_intent_booked(text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_website_booking_intent_booked(text, text, text) TO service_role;

-- Drop older overloads if present (5-arg upsert without ip/quarantine).
DROP FUNCTION IF EXISTS public.upsert_website_booking_intent(text, text, text, smallint);
DROP FUNCTION IF EXISTS public.upsert_website_booking_intent(text, text, text, smallint, text);
