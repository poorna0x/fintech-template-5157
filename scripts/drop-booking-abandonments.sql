-- Run in Supabase SQL Editor if you created booking abandonment objects.
-- Dropping the table removes it from supabase_realtime automatically.

DROP FUNCTION IF EXISTS public.report_booking_abandon(text, text, text, smallint, date);

DROP TABLE IF EXISTS public.booking_abandonments CASCADE;
