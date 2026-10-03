-- Company leave days: public booking (website + WhatsApp) cannot use these dates.
-- Run once in the Supabase SQL editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.booking_leave_dates (
  leave_date date PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.booking_leave_dates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_leave_dates_select ON public.booking_leave_dates;
DROP POLICY IF EXISTS booking_leave_dates_admin_insert ON public.booking_leave_dates;
DROP POLICY IF EXISTS booking_leave_dates_admin_delete ON public.booking_leave_dates;

-- Dates are not secret. The public booking page reads them to grey out the calendar.
CREATE POLICY booking_leave_dates_select
  ON public.booking_leave_dates
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY booking_leave_dates_admin_insert
  ON public.booking_leave_dates
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_user());

CREATE POLICY booking_leave_dates_admin_delete
  ON public.booking_leave_dates
  FOR DELETE
  TO authenticated
  USING (public.is_admin_user());

REVOKE ALL ON TABLE public.booking_leave_dates FROM PUBLIC;
GRANT SELECT ON TABLE public.booking_leave_dates TO anon, authenticated;
GRANT INSERT, DELETE ON TABLE public.booking_leave_dates TO authenticated;
GRANT ALL ON TABLE public.booking_leave_dates TO service_role;
