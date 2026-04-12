-- Live website booking contact: one row per phone; updates as the customer types (debounced in the app).
-- Run in Supabase SQL Editor once.

CREATE TABLE IF NOT EXISTS public.website_booking_intent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text NOT NULL,
  phone_normalized text NOT NULL UNIQUE,
  current_step smallint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz,
  CONSTRAINT website_booking_intent_step CHECK (current_step >= 1 AND current_step <= 5),
  CONSTRAINT website_booking_intent_name CHECK (char_length(trim(full_name)) >= 2 AND char_length(trim(full_name)) <= 200)
);

CREATE INDEX IF NOT EXISTS idx_website_booking_intent_active
  ON public.website_booking_intent (updated_at DESC)
  WHERE dismissed_at IS NULL;

ALTER TABLE public.website_booking_intent ENABLE ROW LEVEL SECURITY;

-- Authenticated admins: read + dismiss only (no direct insert from dashboard).
DROP POLICY IF EXISTS "website_booking_intent select admin" ON public.website_booking_intent;
CREATE POLICY "website_booking_intent select admin"
  ON public.website_booking_intent FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "website_booking_intent update admin" ON public.website_booking_intent;
CREATE POLICY "website_booking_intent update admin"
  ON public.website_booking_intent FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Inserts/updates from the public site go through the function below (not direct table access).

CREATE OR REPLACE FUNCTION public.upsert_website_booking_intent(
  p_full_name text,
  p_phone text,
  p_phone_normalized text,
  p_current_step smallint
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

  INSERT INTO public.website_booking_intent (
    full_name, phone, phone_normalized, current_step, updated_at, dismissed_at
  )
  VALUES (
    trim(p_full_name), p_phone, p_phone_normalized, p_current_step, now(), NULL
  )
  ON CONFLICT (phone_normalized) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    current_step = EXCLUDED.current_step,
    updated_at = now(),
    dismissed_at = NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_website_booking_intent(text, text, text, smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_website_booking_intent(text, text, text, smallint) TO anon;
GRANT EXECUTE ON FUNCTION public.upsert_website_booking_intent(text, text, text, smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_website_booking_intent(text, text, text, smallint) TO service_role;

-- Realtime (ignore error if already added)
ALTER PUBLICATION supabase_realtime ADD TABLE public.website_booking_intent;
