-- Allow admin dashboard to hard-delete dismissed banner rows.
-- Run in Supabase SQL editor. Safe to re-run.

-- website_booking_intent: admins can delete rows (used by "Done" button).
DROP POLICY IF EXISTS "website_booking_intent delete admin" ON public.website_booking_intent;
CREATE POLICY "website_booking_intent delete admin"
  ON public.website_booking_intent
  FOR DELETE
  TO authenticated
  USING (true);

-- booking_abandonments: admins can delete rows (used by "Dismiss" button).
DROP POLICY IF EXISTS "booking_abandonments delete admin" ON public.booking_abandonments;
CREATE POLICY "booking_abandonments delete admin"
  ON public.booking_abandonments
  FOR DELETE
  TO authenticated
  USING (true);

