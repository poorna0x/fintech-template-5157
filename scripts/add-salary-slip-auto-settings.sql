-- Month-end auto salary-slip WhatsApp.
-- Singleton keeps last_sent_month (dedupe). Per-tech toggle lives on technicians.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.salary_slip_auto_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  technician_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  last_sent_month text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.salary_slip_auto_settings IS
  'Singleton: last_sent_month dedupe for month-end salary slip WhatsApp. Per-tech enable is technicians.salary_slip_auto_send.';

COMMENT ON COLUMN public.salary_slip_auto_settings.last_sent_month IS
  'YYYY-MM of last successful auto-send run (dedupe).';

INSERT INTO public.salary_slip_auto_settings (id, enabled, technician_ids)
VALUES (1, false, '{}'::uuid[])
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.salary_slip_auto_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS salary_slip_auto_settings_admin_select ON public.salary_slip_auto_settings;
CREATE POLICY salary_slip_auto_settings_admin_select
  ON public.salary_slip_auto_settings FOR SELECT TO authenticated
  USING (public.is_admin_user());

DROP POLICY IF EXISTS salary_slip_auto_settings_admin_update ON public.salary_slip_auto_settings;
CREATE POLICY salary_slip_auto_settings_admin_update
  ON public.salary_slip_auto_settings FOR UPDATE TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

REVOKE ALL ON TABLE public.salary_slip_auto_settings FROM anon;
GRANT SELECT, UPDATE ON TABLE public.salary_slip_auto_settings TO authenticated;
GRANT ALL ON TABLE public.salary_slip_auto_settings TO service_role;

ALTER TABLE public.technicians
  ADD COLUMN IF NOT EXISTS salary_slip_auto_send boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.technicians.salary_slip_auto_send IS
  'When true, month-end cron WhatsApps this technician their salary-slip PDF (last calendar day ~9 PM IST).';

GRANT SELECT (salary_slip_auto_send) ON TABLE public.technicians TO authenticated;
DO $$
BEGIN
  EXECUTE 'GRANT UPDATE (salary_slip_auto_send) ON TABLE public.technicians TO authenticated';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'salary_slip_auto_send UPDATE grant skipped: %', SQLERRM;
END $$;
