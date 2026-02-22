-- Reminders table: one-time or recurring reminders (no scheduled function; app queries for today/tomorrow)
-- Run this in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.reminders (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  entity_type character varying(20) NOT NULL DEFAULT 'general',
  entity_id uuid,
  title text NOT NULL,
  notes text,
  reminder_at date NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  interval_type character varying(10),
  interval_value integer,
  CONSTRAINT reminders_entity_type_check CHECK (entity_type IN ('customer', 'job', 'general')),
  CONSTRAINT reminders_interval_type_check CHECK (interval_type IS NULL OR interval_type IN ('days', 'months'))
);

COMMENT ON TABLE public.reminders IS 'Reminders for today/tomorrow; app loads with single query. No cron.';
COMMENT ON COLUMN public.reminders.entity_type IS 'customer | job | general';
COMMENT ON COLUMN public.reminders.entity_id IS 'customer_id or job_id when entity_type is customer or job';
COMMENT ON COLUMN public.reminders.reminder_at IS 'Date to show reminder (app shows today + tomorrow)';
COMMENT ON COLUMN public.reminders.completed_at IS 'When user marked done; null = still active';
COMMENT ON COLUMN public.reminders.interval_type IS 'null = one-time, ''days'' or ''months'' = repeat';
COMMENT ON COLUMN public.reminders.interval_value IS 'Repeat every N days or N months';

CREATE INDEX IF NOT EXISTS idx_reminders_reminder_at ON public.reminders (reminder_at);
CREATE INDEX IF NOT EXISTS idx_reminders_entity ON public.reminders (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_reminders_completed ON public.reminders (completed_at) WHERE completed_at IS NULL;

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read reminders"
  ON public.reminders FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert reminders"
  ON public.reminders FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated update reminders"
  ON public.reminders FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated delete reminders"
  ON public.reminders FOR DELETE TO authenticated USING (true);
