-- Track successful booking submission in website_booking_intent so admin banner can show "Booked".
-- Run once in Supabase SQL editor. Safe to re-run.

ALTER TABLE public.website_booking_intent
  ADD COLUMN IF NOT EXISTS booked_at timestamptz,
  ADD COLUMN IF NOT EXISTS booked_job_number text;

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

REVOKE ALL ON FUNCTION public.mark_website_booking_intent_booked(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_website_booking_intent_booked(text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.mark_website_booking_intent_booked(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_website_booking_intent_booked(text, text, text) TO service_role;

