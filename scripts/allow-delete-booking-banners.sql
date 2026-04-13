-- Allow admin dashboard to hard-delete dismissed banner rows.
-- Run in Supabase SQL editor. Safe to re-run.

DO $$
BEGIN
  -- website_booking_intent: admins can delete rows (used by "Done" button).
  IF to_regclass('public.website_booking_intent') IS NOT NULL THEN
    DROP POLICY IF EXISTS "website_booking_intent delete admin" ON public.website_booking_intent;
    CREATE POLICY "website_booking_intent delete admin"
      ON public.website_booking_intent
      FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  -- booking_abandonments: admins can delete rows (used by "Dismiss" button).
  -- If you haven't created this table in Supabase, this block will safely do nothing.
  IF to_regclass('public.booking_abandonments') IS NOT NULL THEN
    DROP POLICY IF EXISTS "booking_abandonments delete admin" ON public.booking_abandonments;
    CREATE POLICY "booking_abandonments delete admin"
      ON public.booking_abandonments
      FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END $$;

