-- Fix "new row violates row-level security policy" for table reminders
-- Run this in Supabase SQL Editor after the reminders table exists.

-- Drop existing policies (in case they exist but role doesn't match)
DROP POLICY IF EXISTS "Allow authenticated read reminders" ON public.reminders;
DROP POLICY IF EXISTS "Allow authenticated insert reminders" ON public.reminders;
DROP POLICY IF EXISTS "Allow authenticated update reminders" ON public.reminders;
DROP POLICY IF EXISTS "Allow authenticated delete reminders" ON public.reminders;

-- Ensure RLS is enabled
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- Allow authenticated: full access
CREATE POLICY "Allow authenticated read reminders"
  ON public.reminders FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert reminders"
  ON public.reminders FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated update reminders"
  ON public.reminders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated delete reminders"
  ON public.reminders FOR DELETE TO authenticated USING (true);

-- Allow anon as well (in case app uses anon key or session not sent as authenticated)
CREATE POLICY "Allow anon read reminders"
  ON public.reminders FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon insert reminders"
  ON public.reminders FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anon update reminders"
  ON public.reminders FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon delete reminders"
  ON public.reminders FOR DELETE TO anon USING (true);

-- Ensure table privileges (Supabase usually has these by default)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminders TO anon;
