-- Live website booking contact: one row per (phone, site); updates as the customer types (debounced in the app).
-- site_key: 'hydrogenro' | 'elevenro' — run in Supabase SQL Editor once for a new project.

CREATE TABLE IF NOT EXISTS public.website_booking_intent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text NOT NULL,
  phone_normalized text NOT NULL,
  site_key text NOT NULL DEFAULT 'hydrogenro',
  current_step smallint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz,
  CONSTRAINT website_booking_intent_step CHECK (current_step >= 1 AND current_step <= 5),
  CONSTRAINT website_booking_intent_name CHECK (char_length(trim(full_name)) >= 2 AND char_length(trim(full_name)) <= 200),
  CONSTRAINT website_booking_intent_site_key_check CHECK (site_key IN ('hydrogenro', 'elevenro')),
  CONSTRAINT website_booking_intent_phone_site UNIQUE (phone_normalized, site_key)
);

CREATE INDEX IF NOT EXISTS idx_website_booking_intent_active
  ON public.website_booking_intent (updated_at DESC)
  WHERE dismissed_at IS NULL;

ALTER TABLE public.website_booking_intent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "website_booking_intent select admin" ON public.website_booking_intent;
CREATE POLICY "website_booking_intent select admin"
  ON public.website_booking_intent FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "website_booking_intent update admin" ON public.website_booking_intent;
CREATE POLICY "website_booking_intent update admin"
  ON public.website_booking_intent FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

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

-- Safe to re-run: skip if table is already in the publication (avoids ERROR 42710).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'website_booking_intent'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.website_booking_intent;
  END IF;
END $$;
