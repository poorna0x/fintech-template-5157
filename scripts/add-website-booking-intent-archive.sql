-- Archive table for live website booking intents marked "Done".
-- Done = copy row here, then delete from website_booking_intent.
-- Run once in Supabase SQL Editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.website_booking_intent_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid,
  full_name text NOT NULL,
  phone text NOT NULL,
  phone_normalized text NOT NULL,
  site_key text NOT NULL DEFAULT 'hydrogenro',
  current_step smallint NOT NULL DEFAULT 1,
  intent_created_at timestamptz,
  intent_updated_at timestamptz,
  booked_at timestamptz,
  booked_job_number text,
  archived_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_booking_intent_archive_step CHECK (current_step >= 1 AND current_step <= 5),
  CONSTRAINT website_booking_intent_archive_site_key_check CHECK (site_key IN ('hydrogenro', 'elevenro'))
);

CREATE INDEX IF NOT EXISTS idx_website_booking_intent_archive_archived_at
  ON public.website_booking_intent_archive (archived_at DESC);

CREATE INDEX IF NOT EXISTS idx_website_booking_intent_archive_phone
  ON public.website_booking_intent_archive (phone_normalized);

ALTER TABLE public.website_booking_intent_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "website_booking_intent_archive select admin" ON public.website_booking_intent_archive;
CREATE POLICY "website_booking_intent_archive select admin"
  ON public.website_booking_intent_archive
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "website_booking_intent_archive insert admin" ON public.website_booking_intent_archive;
CREATE POLICY "website_booking_intent_archive insert admin"
  ON public.website_booking_intent_archive
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "website_booking_intent_archive delete admin" ON public.website_booking_intent_archive;
CREATE POLICY "website_booking_intent_archive delete admin"
  ON public.website_booking_intent_archive
  FOR DELETE
  TO authenticated
  USING (true);

-- Ensure live table still allows admin DELETE (Done removes the live row).
DO $$
BEGIN
  IF to_regclass('public.website_booking_intent') IS NOT NULL THEN
    DROP POLICY IF EXISTS "website_booking_intent delete admin" ON public.website_booking_intent;
    CREATE POLICY "website_booking_intent delete admin"
      ON public.website_booking_intent
      FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END $$;

-- Atomic Done: copy into archive, then delete from live table.
CREATE OR REPLACE FUNCTION public.archive_website_booking_intent(p_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  src public.website_booking_intent%ROWTYPE;
  new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO src
  FROM public.website_booking_intent
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking intent not found';
  END IF;

  INSERT INTO public.website_booking_intent_archive (
    source_id,
    full_name,
    phone,
    phone_normalized,
    site_key,
    current_step,
    intent_created_at,
    intent_updated_at,
    booked_at,
    booked_job_number,
    archived_at
  )
  VALUES (
    src.id,
    src.full_name,
    src.phone,
    src.phone_normalized,
    src.site_key,
    src.current_step,
    src.created_at,
    src.updated_at,
    src.booked_at,
    src.booked_job_number,
    now()
  )
  RETURNING id INTO new_id;

  DELETE FROM public.website_booking_intent WHERE id = p_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_website_booking_intent(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_website_booking_intent(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_website_booking_intent(uuid) TO service_role;
