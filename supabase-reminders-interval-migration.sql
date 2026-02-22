-- Add repeat interval to reminders (for tables created before interval was added)
-- Run this in Supabase SQL Editor if you get "column interval_type does not exist".

ALTER TABLE public.reminders
  ADD COLUMN interval_type character varying(10),
  ADD COLUMN interval_value integer;

COMMENT ON COLUMN public.reminders.interval_type IS 'null = one-time, ''days'' or ''months'' = repeat';
COMMENT ON COLUMN public.reminders.interval_value IS 'Repeat every N days or N months (used when interval_type is set)';

ALTER TABLE public.reminders
  DROP CONSTRAINT IF EXISTS reminders_interval_type_check;
ALTER TABLE public.reminders
  ADD CONSTRAINT reminders_interval_type_check
  CHECK (interval_type IS NULL OR interval_type IN ('days', 'months'));
