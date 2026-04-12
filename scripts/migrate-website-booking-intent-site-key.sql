-- Run once in Supabase SQL Editor if `website_booking_intent` already exists without `site_key`.
-- Allows the same phone to appear once per site (HydrogenRO vs ElevenRO).

ALTER TABLE public.website_booking_intent
  ADD COLUMN IF NOT EXISTS site_key text NOT NULL DEFAULT 'hydrogenro';

ALTER TABLE public.website_booking_intent
  DROP CONSTRAINT IF EXISTS website_booking_intent_phone_normalized_key;

ALTER TABLE public.website_booking_intent
  DROP CONSTRAINT IF EXISTS website_booking_intent_site_key_check;

ALTER TABLE public.website_booking_intent
  ADD CONSTRAINT website_booking_intent_site_key_check
  CHECK (site_key IN ('hydrogenro', 'elevenro'));

CREATE UNIQUE INDEX IF NOT EXISTS website_booking_intent_phone_site_unique
  ON public.website_booking_intent (phone_normalized, site_key);

DROP FUNCTION IF EXISTS public.upsert_website_booking_intent(text, text, text, smallint);

CREATE OR REPLACE FUNCTION public.upsert_website_booking_intent(
  p_full_name text,
  p_phone text,
  p_phone_normalized text,
  p_current_step smallint,
  p_site_key text DEFAULT 'hydrogenro'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
    full_name, phone, phone_normalized, current_step, updated_at, dismissed_at, site_key
  )
  VALUES (
    trim(p_full_name), p_phone, p_phone_normalized, p_current_step, now(), NULL, p_site_key
  )
  ON CONFLICT (phone_normalized, site_key) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    current_step = EXCLUDED.current_step,
    updated_at = now(),
    dismissed_at = NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_website_booking_intent(text, text, text, smallint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_website_booking_intent(text, text, text, smallint, text) TO anon;
GRANT EXECUTE ON FUNCTION public.upsert_website_booking_intent(text, text, text, smallint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_website_booking_intent(text, text, text, smallint, text) TO service_role;
